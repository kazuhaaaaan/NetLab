import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Pecah bundle agar tidak ada chunk > 500 kB (gzip ≈ 400 kB).
      // Grup app code satu arah: ai-modules → net-engine/net-vendors → vendor-*.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('jszip')) return 'vendor-jszip';
              if (id.includes('motion')) return 'vendor-motion';
              if (
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/scheduler/')
              ) {
                return 'vendor-react';
              }
              return 'vendor-misc';
            }
            if (id.includes('/packages/vendors/') || id.includes('/packages/cli/')) return 'net-vendors';
            if (id.includes('/src/engine/')) return 'net-engine';
            if (id.includes('/src/modules/ai/')) return 'ai-modules';
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Teruskan panggilan AI ke server Gemini (server/index.mjs, port 8787).
        // Bila server tidak berjalan, frontend fallback ke AI Mentor rule-based.
        '/api': {
          target: `http://localhost:${process.env.AI_PORT || 8787}`,
          changeOrigin: true,
        },
      },
    },
  };
});
