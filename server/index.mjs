/**
 * MikroAi — server AI Mentor (Gemini proxy) — hardened.
 *
 * Satu-satunya endpoint publik: POST /api/ai
 *   body: { question: string, context?: string, history?: [{ role: 'user'|'ai', text: string }] }
 *   resp: { text: string }
 *
 * Keamanan (produksi):
 * - CORS dibatasi daftar origin (ALLOWED_ORIGINS), bukan "*".
 * - Rate limiting per-IP (sliding window sederhana).
 * - Validasi & batas ukuran payload/question/context/history.
 * - Timeout panggilan upstream.
 * - Error upstream TIDAK pernah bocor ke klien (dikode ulang).
 *
 * Jalankan: node server/index.mjs  (atau npm run dev:ai)
 */
import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.AI_PORT || process.env.PORT || 8787);
const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── Konfigurasi keamanan (semua bisa dioverride lewat env) ─────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Default dev: vite (3000) + server sendiri. Produksi: PASTIKAN set ALLOWED_ORIGINS.
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8787'];
const ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

const MAX_QUESTION_LEN = 2000;
const MAX_CONTEXT_LEN = 20000;
const MAX_HISTORY_TURNS = 12;
const UPSTREAM_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 30000);

// Rate limiting: RATE_LIMIT_REQUESTS per RATE_LIMIT_WINDOW_MS per IP.
const RATE_LIMIT_REQUESTS = Number(process.env.RATE_LIMIT_REQUESTS || 20);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rateBuckets = new Map();

// trust proxy hanya bila diaktifkan eksplisit (TRUST_PROXY=1 di belakang reverse proxy
// yang MENIMPA X-Forwarded-For). Tanpa itu, rate limit memakai socket address —
// header X-Forwarded-For dari klien TIDAK dipercaya (anti-spoof bypass).
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

const app = express();
app.use(express.json({ limit: '100kb', strict: true }));
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', 1);

// ── CORS terkendali (bukan *) ──────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Rate limiter sederhana (sliding window per IP) ─────────────────────
function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_REQUESTS) {
    rateBuckets.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  rateBuckets.set(ip, fresh);
  return false;
}

// Periodic cleanup bucket rate limit agar tidak bocor memori.
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref?.();

/** Konversi error upstream menjadi pesan aman — tidak pernah bocorkan detail/key. */
function sanitizeError(err) {
  const code = err?.code || err?.status || '';
  const isTimeout = err?.name === 'AbortError' || /timeout|deadline/i.test(String(err?.message || ''));
  const isQuota = /quota|429|resource exhausted/i.test(String(err?.message || ''));
  const isAuth = /api[ _-]?key|permission|403|401/i.test(String(err?.message || ''));
  if (isTimeout) return { code: 'AI_UPSTREAM_TIMEOUT', msg: 'AI service timed out, coba lagi' };
  if (isQuota) return { code: 'AI_QUOTA_EXCEEDED', msg: 'AI service quota exceeded' };
  if (isAuth) return { code: 'AI_UPSTREAM_AUTH', msg: 'AI service configuration error' };
  if (code && String(code).startsWith('4')) return { code: 'AI_UPSTREAM_ERROR', msg: 'AI service temporarily unavailable' };
  return { code: 'AI_UPSTREAM_ERROR', msg: 'AI service temporarily unavailable' };
}

const SYSTEM_PROMPT = [
  'Kamu adalah MikroAi, asisten AI untuk NetLab — simulator jaringan multi-vendor ',
  '(MikroTik, Cisco IOS/NX-OS, Juniper, Huawei, Fortinet, VyOS/Ubiquiti, OpenWrt, Linux).',
  'Pengguna sedang belajar jaringan dan memakai terminal/chat simulator ini.',
  '',
  'Aturan:',
  '- Jawab dalam Bahasa Indonesia, ringkas dan praktis, maksimal ~150 kata.',
  '- Fokus pada langkah perbaikan yang bisa langsung dicoba di simulator (perintah CLI vendor).',
  '- Jika diberi "KONTEKS JARINGAN", gunakan sebagai fakta kondisi jaringan saat ini — jangan berasumsi.',
  '- Jika tidak tahu atau konteks tidak cukup, bilang jujur dan minta info tambahan.',
  '- Jangan pernah mengarang status perangkat, IP, atau perintah yang tidak masuk akal.',
  '',
].join('\n');

function buildPrompt(question, context, history) {
  let prompt = SYSTEM_PROMPT;
  if (context && context.trim()) {
    prompt += `\n\n=== KONTEKS JARINGAN SAAT INI ===\n${context.trim()}\n=== AKHIR KONTEKS ===\n`;
  }
  if (Array.isArray(history) && history.length > 0) {
    prompt += '\n\n=== PERCAKAPAN SEBELUMNYA ===\n';
    for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
      if (!turn || typeof turn.text !== 'string' || !turn.text.trim()) continue;
      const role = turn.role === 'ai' ? 'MikroAi' : 'Pengguna';
      prompt += `${role}: ${turn.text.trim()}\n`;
    }
    prompt += '=== AKHIR PERCAKAPAN ===\n';
  }
  prompt += `\nPertanyaan pengguna: ${question.trim()}\n\nJawaban:`;
  return prompt;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llm: Boolean(API_KEY), model: MODEL });
});

app.post('/api/ai', async (req, res) => {
  // Validasi payload dasar (JSON parse error sudah ditangani express).
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body', code: 'INVALID_BODY' });
  }
  const { question, context, history } = body;

  // 1. Rate limit — sebelum kerja apa pun. req.ip = socket address, atau IP dari
  //    hop proxy tepercaya (TRUST_PROXY=1). Header klien tidak pernah dipercaya.
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests, silakan tunggu sebentar', code: 'RATE_LIMITED' });
  }

  // 2. Validasi question.
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Missing "question"', code: 'MISSING_QUESTION' });
  }
  if (question.length > MAX_QUESTION_LEN) {
    return res.status(400).json({ error: `Question too long (max ${MAX_QUESTION_LEN} chars)`, code: 'QUESTION_TOO_LONG' });
  }

  // 3. Validasi context.
  if (context !== undefined && (typeof context !== 'string' || context.length > MAX_CONTEXT_LEN)) {
    return res.status(400).json({ error: 'Context too long', code: 'CONTEXT_TOO_LONG' });
  }

  // 4. Validasi history (array, ukuran terbatas, teks terbatas).
  let cleanHistory = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: 'history must be an array', code: 'INVALID_HISTORY' });
    }
    cleanHistory = history
      .filter((t) => t && typeof t === 'object' && typeof t.text === 'string' && t.text.trim())
      .map((t) => ({ role: t.role === 'ai' ? 'ai' : 'user', text: t.text.slice(0, MAX_QUESTION_LEN) }))
      .slice(-MAX_HISTORY_TURNS);
  }

  if (!API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured', code: 'NO_API_KEY' });
  }

  // 5. Panggil upstream dengan timeout (Promise.race — SDK tidak menerima signal).
  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const call = ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(question, context, cleanHistory),
      config: { maxOutputTokens: 1000 },
    });
    const response = await Promise.race([
      call,
      new Promise((_resolve, reject) =>
        setTimeout(() => {
          const e = new Error('upstream timeout');
          e.name = 'AbortError';
          reject(e);
        }, UPSTREAM_TIMEOUT_MS)
      ),
    ]);
    const text = (response.text || '').trim();
    if (!text) return res.status(502).json({ error: 'Empty response from AI', code: 'AI_EMPTY_RESPONSE' });
    res.json({ text });
  } catch (err) {
    console.error('[mikroai] upstream error:', err?.message || err);
    const safe = sanitizeError(err);
    res.status(502).json({ error: safe.msg, code: safe.code });
  }
});

// Error handler umum — jangan pernah mengirim stack trace ke klien.
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' });
  }
  console.error('[mikroai] error:', err?.message || err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

app.listen(PORT, () => {
  console.log(`[mikroai] AI server listening on http://localhost:${PORT} (llm=${Boolean(API_KEY)}, origins=${ORIGINS.join(',')}, ${TRUST_PROXY ? 'trust-proxy=on' : 'trust-proxy=off'})`);
  if (NODE_ENV === 'production' && !ALLOWED_ORIGINS.length) {
    console.warn('[mikroai] PERINGATAN: NODE_ENV=production tanpa ALLOWED_ORIGINS — CORS memakai daftar dev (localhost). Set ALLOWED_ORIGINS=https://netlab.kazudev.my.id.');
  }
});
