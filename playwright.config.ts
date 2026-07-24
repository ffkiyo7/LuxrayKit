import { defineConfig, devices } from '@playwright/test';

const mobile390 = {
  ...devices['Pixel 5'],
  viewport: { width: 390, height: 844 },
};

export default defineConfig({
  testDir: './tests/pwa',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      // Functional gates (offline cache, generated team samples). Runs on the
      // machine's installed Google Chrome, which CI runners ship preinstalled —
      // no browser download step needed.
      name: 'chrome-mobile-390',
      testIgnore: /visual\.spec\.ts/,
      use: {
        ...mobile390,
        channel: 'chrome',
      },
    },
    {
      // Visual regression. Deliberately NOT `channel: 'chrome'`: Chrome stable
      // auto-updates, and a font/raster change in any release silently rots the
      // baselines. The bundled Chromium is pinned by @playwright/test in
      // package-lock.json, so the browser only moves when we bump the dep.
      // Baselines are generated inside the matching mcr.microsoft.com/playwright
      // image — see `npm run test:visual` / scripts/visual-docker.sh.
      name: 'visual-mobile-390',
      testMatch: /visual\.spec\.ts/,
      use: mobile390,
    },
  ],
});
