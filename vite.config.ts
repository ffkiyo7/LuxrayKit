import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
    setupFiles: ['./vitest.setup.ts'],
    // CI / Workers Builds runners are several times slower than local, where the
    // heavy environment-app render tests already sit close to vitest's 5s default.
    // Per-test `{ timeout }` options still take precedence over this baseline.
    testTimeout: 20000,
    exclude: ['node_modules/**', 'dist/**', 'tmp/**', 'tests/pwa/**', 'test-results/**'],
  },
});
