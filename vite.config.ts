import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('node_modules/@smogon/')) return 'calc-engine';
          if (normalizedId.includes('/src/data/seed/regMA/move-catalog.ts')) return 'regma-moves';
          if (
            normalizedId.includes('/src/data/seed/regMA/catalog.ts')
            || normalizedId.includes('/src/data/seed/regMA/catalog-batch-')
            || normalizedId.includes('/src/data/seed/regMA/catalog-forms.ts')
            || normalizedId.includes('/src/data/seed/regMA/mega-catalog.ts')
          ) {
            return 'regma-pokemon-catalog';
          }
        },
      },
    },
  },
  test: {
    exclude: ['node_modules/**', 'dist/**', 'tests/pwa/**', 'test-results/**'],
  },
});