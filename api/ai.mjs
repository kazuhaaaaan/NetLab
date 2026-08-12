/**
 * Vercel serverless function — proxy AI Mentor (Gemini).
 *
 * Re-export app Express dari server/index.mjs (endpoint /api/health &
 * /api/ai). Satu origin dengan frontend → tanpa masalah CORS / APP_URL.
 *
 * Env (dashboard Vercel → Project → Settings → Environment Variables):
 *   GEMINI_API_KEY  — wajib, key Gemini (server-side, tidak pernah ke browser)
 *   GEMINI_MODEL    — opsional, default gemini-2.5-flash
 *   TRUST_PROXY=1   — agar rate limit memakai IP asli (Vercel di belakang proxy)
 *   RATE_LIMIT_*    — opsional, penyesuaian rate limit
 *
 * Catatan: rate limit in-memory bersifat per-instance serverless (bukan
 * global). Cukup untuk skala kecil; pada skala besar pakai KV eksternal.
 */
export { default } from '../server/index.mjs';
