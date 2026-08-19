/**
 * Klien LLM NetLab — dua mode:
 *  1. Langsung (browser → Gemini REST): HANYA di development (import.meta.env.DEV)
 *     bila VITE_GEMINI_API_KEY tersedia. Key TIDAK PERNAH masuk bundle produksi:
 *     guard DEV memastikan tukang bangun (build) tidak meng-inline key publik.
 *  2. Proxy server (server/index.mjs → POST /api/ai): satu-satunya mode produksi;
 *     key Gemini tinggal server-side (GEMINI_API_KEY). Bila server mati → rule-based.
 *
 * Konteks jaringan dari PromptBuilder + history percakapan multi-turn
 * dikirim sebagai system instruction / contents.
 */

const meta = (typeof import.meta !== 'undefined' ? import.meta : {}) as any;
const env = (meta.env ?? {}) as Record<string, string | undefined>;
const IS_DEV = Boolean(meta.env?.DEV);
// Mode langsung hanya diizinkan saat development; produksi selalu lewat proxy.
const DIRECT_KEY = IS_DEV ? (env.VITE_GEMINI_API_KEY || '').trim() : '';
const DIRECT_MODEL = (env.VITE_GEMINI_MODEL || 'gemini-3.5-flash').trim();
const RAW_BASE_URL = env.VITE_APP_URL || '';
const BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');
const TIMEOUT_MS = 30000;

export interface LlmHistoryItem {
  role: 'user' | 'ai';
  text: string;
}

export interface LlmResult {
  ok: boolean;
  text: string;
  source: 'llm' | 'fallback' | 'error';
}

/** True bila mode langsung (browser → Gemini) aktif: hanya development. */
export function isDirectLlmEnabled(): boolean {
  return Boolean(DIRECT_KEY);
}

export function systemPrompt(context?: string): string {
  return [
    'Kamu adalah Aikari, asisten AI untuk simulator jaringan multi-vendor',
    '(MikroTik, Cisco IOS/NX-OS, Juniper, Huawei, Fortinet, VyOS/Ubiquiti, OpenWrt, Linux).',
    'Pengguna sedang belajar jaringan dan memakai simulator ini.',
    'NetLab diciptakan oleh Nouva Prasetya Ardhana (KazuDev); bila ditanya siapa',
    'pencipta/pembuat NetLab atau proyek ini, jawab: diciptakan oleh Nouva Prasetya',
    'Ardhana (KazuDev) dan bisa dihubungi lewat www.kazudev.my.id.',
    '',
    'Aturan:',
    '- Jawab dalam Bahasa Indonesia, jelas dan praktis. Panjang jawaban ADAPTIF mengikuti',
    '  kompleksitas pertanyaan (jangan dipotong paksa):',
    '  * Pertanyaan sederhana → 50–150 kata, langsung ke inti.',
    '  * Troubleshooting / diagnosis → 200–500 kata.',
    '  * Konfigurasi perangkat → 300–800 kata bila perlu (perintah CLI lengkap + penjelasan singkat).',
    '  * Tutorial atau diagnosis kompleks → sepanjang yang diperlukan.',
    '- Jangan memanjangkan jawaban hanya demi panjang — tetap padat dan relevan.',
    '- Untuk troubleshooting, gunakan struktur: (1) Diagnosis, (2) Kemungkinan penyebab,',
    '  (3) Penjelasan singkat, (4) Langkah perbaikan, (5) Cara verifikasi,',
    '  (6) Hal yang perlu diperiksa bila masih gagal. Struktur ini opsional untuk pertanyaan sederhana.',
    '- Fokus pada langkah perbaikan yang bisa langsung dicoba di simulator (perintah CLI vendor).',
    '- Jika diberi "KONTEKS JARINGAN", gunakan sebagai fakta kondisi jaringan saat ini — jangan berasumsi.',
    '- Jika tidak tahu atau konteks tidak cukup, bilang jujur dan minta info tambahan.',
    '- Jangan pernah mengarang status perangkat, IP, atau perintah yang tidak masuk akal.',
    ...(context && context.trim()
      ? ['', '=== KONTEKS JARINGAN SAAT INI ===', context.trim(), '=== AKHIR KONTEKS ===']
      : []),
  ].join('\n');
}

/** Panggil Gemini langsung dari browser (HANYA development; key lewat header, bukan URL). */
async function askGeminiDirect(question: string, context?: string, history?: LlmHistoryItem[]): Promise<LlmResult> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [
    ...(Array.isArray(history) ? history.slice(-12) : []).map((h) => ({
      role: (h.role === 'ai' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: h.text }],
    })),
    { role: 'user', parts: [{ text: question }] },
  ];

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DIRECT_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': DIRECT_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(context) }] },
          contents,
          generationConfig: { maxOutputTokens: 2048 },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) return { ok: false, text: '', source: 'fallback' };
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!text) return { ok: false, text: '', source: 'fallback' };
    return { ok: true, text, source: 'llm' };
  } catch {
    return { ok: false, text: '', source: 'fallback' };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Panggil server proxy (server/index.mjs). */
async function askServerProxy(question: string, context?: string, history?: LlmHistoryItem[]): Promise<LlmResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        context: context || '',
        history: Array.isArray(history) ? history.slice(-12) : [],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, text: '', source: 'fallback' };
    const data = (await res.json()) as { text?: string };
    const text = (data.text || '').trim();
    if (!text) return { ok: false, text: '', source: 'fallback' };
    return { ok: true, text, source: 'llm' };
  } catch {
    return { ok: false, text: '', source: 'fallback' };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Pintu masuk: langsung (dev saja) → proxy server → gagal. */
export async function askLlm(question: string, context?: string, history?: LlmHistoryItem[]): Promise<LlmResult> {
  if (DIRECT_KEY) {
    const direct = await askGeminiDirect(question, context, history);
    if (direct.ok) return direct;
  }
  return askServerProxy(question, context, history);
}