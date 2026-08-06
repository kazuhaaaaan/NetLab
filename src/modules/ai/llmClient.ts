/**
 * Klien LLM MikroAi — memanggil server Gemini (server/index.mjs) lewat
 * POST /api/ai dengan konteks jaringan dari PromptBuilder dan history
 * percakapan panel chat (multi-turn).
 *
 * Bila server tidak tersedia (fetch gagal / 503 / timeout), kembalikan
 * { ok: false } agar pemanggil jatuh ke AI Mentor rule-based.
 */
const RAW_BASE_URL =
  (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_APP_URL || (import.meta as any).env?.APP_URL)) ||
  '';
const BASE_URL = String(RAW_BASE_URL).replace(/\/+$/, '');
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

export async function askLlm(question: string, context?: string, history?: LlmHistoryItem[]): Promise<LlmResult> {
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
