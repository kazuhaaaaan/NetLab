/**
 * MikroAi — server AI Mentor (Gemini proxy).
 *
 * Satu-satunya endpoint: POST /api/ai
 *   body: { question: string, context?: string, history?: [{ role: 'user'|'ai', text: string }] }
 *   resp: { text: string }
 *
 * history = percakapan multi-turn dari panel chat (opsional).
 * Server ini tipis (thin proxy) — seluruh simulasi tetap berjalan
 * client-side. Tanpa GEMINI_API_KEY, server mengembalikan 503 dan
 * frontend otomatis fallback ke AI Mentor rule-based.
 *
 * Jalankan: node server/index.mjs  (atau npm run dev:ai)
 */
import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.AI_PORT || process.env.PORT || 8787);
const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS longgar agar mudah dipakai di dev (vite proxy juga tersedia).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const SYSTEM_PROMPT = [
  'Kamu adalah MikroAi, asisten AI untuk MikroAi — simulator jaringan multi-vendor ',
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
    for (const turn of history.slice(-12)) {
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
  const { question, context, history } = req.body || {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Missing "question"' });
  }
  if (!API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(question, context, history),
      config: { maxOutputTokens: 1000 },
    });
    const text = (response.text || '').trim();
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini' });
    res.json({ text });
  } catch (err) {
    console.error('[mikroai] Gemini error:', err?.message || err);
    res.status(502).json({ error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`[mikroai] AI server listening on http://localhost:${PORT} (llm=${Boolean(API_KEY)})`);
});
