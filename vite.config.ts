// @ts-expect-error -- the repo ships no @types/node; this config only ever runs under Node.
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
// @ts-expect-error -- plain ESM maintenance script, also unit-tested from scripts/*.test.mjs
import { writePrecacheManifest } from './scripts/precache-manifest.mjs';

/**
 * Writes this build's precache manifest (version, every dist/assets file, the item icons straight
 * from the catalog's iconRef) into dist/sw.js. The embedded list is what makes each deploy a new
 * service worker and keeps the precache tied to the build that produced it.
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
      this.info(`sw.js ${manifest.version}: ${manifest.assets.length} assets, ${manifest.itemIcons.length} item icons`);
    },
  };
};

/**
 * Build identifier shown in 「我的 → 关于」 and pasted into bug reports. A git short SHA points
 * at exactly one commit; Cloudflare Workers Builds does check out the repo, so this normally
 * resolves. When git is unavailable (a tarball build, a shallow checkout without .git) we fall
 * back to a build timestamp — less precise, but still enough to tell two builds apart, and
 * never a hard build failure over a diagnostics string.
 *
 * The SHA is the last commit that touched anything outside public/data/, not HEAD: it is compiled
 * into the index chunk, so HEAD would give the daily PokeDB JSON refresh new chunk hashes, a new
 * sw.js and an update prompt for a file the service worker already refreshes on its own. The JSON
 * is fetched at runtime, so that commit still describes exactly the code being run. A shallow
 * checkout degrades to HEAD.
 */
const resolveBuildId = () => {
  try {
    return execSync("git log -1 --format=%h -- . ':(exclude)public/data'", { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
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
          // Rollup's commonjs plugin synthesises a virtual `\0commonjsHelpers.js` module that every
          // CJS dependency needs — React and ReactDOM included, so the entry chunk needs it too.
          // Left unassigned it lands in whichever manual chunk claimed it first (`calc-engine`),
          // and the entry then pulls all 116 KB of @smogon/calc down for a few dozen bytes of
          // helper. Give it a chunk of its own so nothing but the helper travels with it.
          if (normalizedId.includes('commonjsHelpers')) return 'vendor-helpers';
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
    // `.claude/**`: parallel agent worktrees live there, each a full copy of the test suite.
    exclude: ['node_modules/**', 'dist/**', 'tmp/**', 'tests/pwa/**', 'test-results/**', '.claude/**'],
  },
});
