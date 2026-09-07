// @ts-expect-error -- the repo ships no @types/node; this config only ever runs under Node.
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
// @ts-expect-error -- plain ESM maintenance script, also unit-tested from scripts/*.test.mjs
import { writePrecacheManifest } from './scripts/precache-manifest.mjs';

/**
 * Emits dist/precache-manifest.json (item icon paths, straight from the item catalog's iconRef)
 * for public/sw.js to read at install time. The service worker used to carry a hand-written copy
 * of this list, which drifted from the catalog on every item change.
 */
const precacheManifestPlugin = (): Plugin => {
  let root = '';
  let outDir = 'dist';
  return {
    name: 'luxraykit-precache-manifest',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const manifest = await writePrecacheManifest(outDir, { root });
      this.info(`precache-manifest.json: ${manifest.itemIcons.length} item icons`);
    },
  };
};

/**
 * Build identifier shown in 「我的 → 关于」 and pasted into bug reports. A git short SHA points
 * at exactly one commit; Cloudflare Workers Builds does check out the repo, so this normally
 * resolves. When git is unavailable (a tarball build, a shallow checkout without .git) we fall
 * back to a build timestamp — less precise, but still enough to tell two builds apart, and
 * never a hard build failure over a diagnostics string.
 */
const resolveBuildId = () => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
};

const appBuildId = resolveBuildId() ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export default defineConfig({
  plugins: [react(), precacheManifestPlugin()],
  define: {
    __APP_BUILD__: JSON.stringify(appBuildId),
  },
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
