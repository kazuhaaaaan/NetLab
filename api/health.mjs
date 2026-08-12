/**
 * Vercel serverless function — health check AI Mentor.
 *
 * Di Vercel setiap file di api/ ter-mount di path persis namanya, maka
 * /api/health butuh file sendiri (api/ai.mjs hanya melayani /api/ai).
 * Re-export app Express yang sama dari server/index.mjs.
 */
export { default } from '../server/index.mjs';