import { expect, test } from '@playwright/test';

/**
 * Guards the environment first paint (`#/env`) against silently regaining a heavy chunk.
 *
 * The budget is measured, not aspirational: run this spec, read the `first paint JS` line it
 * logs, and set FIRST_PAINT_JS_BUDGET_BYTES to that number plus ~10%. Raising it is a product
 * decision — do it deliberately, with the new number in the PR, not to make a red run green.
 *
 * Measured 2026-09-07 against `vite preview` (which gzips, so these are wire bytes):
 *   before this change: 404,548 bytes across 14 files
 *   after:              351,690 bytes across 13 files  → budget 387,000 (+10%)
 * The dominant entries are calc-engine (116 KB), index (81 KB), the two VGCPastes sample
 * chunks (67 KB), regma-pokemon-catalog (44 KB), EnvironmentPage (21 KB) and environment (18 KB).
 */
const FIRST_PAINT_JS_BUDGET_BYTES = 387_000;

/**
 * `move-catalog.ts` (362 KB raw / 55 KB gzip) reached the environment home through
 * `catalog.ts`, which re-exported `moves` and therefore made the shared
 * `regma-pokemon-catalog` chunk statically depend on `regma-moves`. It now loads on demand
 * from the Pokémon detail screen. The environment home renders rankings and team cards and
 * needs no `Move` object at all, so this must stay out of the navigation.
 */
const FORBIDDEN_FIRST_PAINT_CHUNKS = ['regma-moves'];

test('keeps the move catalog out of the environment first paint and stays inside the JS budget', async ({ page }) => {
  const requestedScripts = new Set<string>();
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('.js') && pathname !== '/sw.js') requestedScripts.add(pathname);
  });

  await page.goto('/');

  const skip = page.getByRole('button', { name: '跳过' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 5_000 });
    await skip.click();
    await page.getByRole('button', { name: '开始探索' }).click();
  } catch {
    // The tour was already completed in this browser context.
  }

  // First paint is "the environment home is actually usable": the Top 5 ranking rows and the
  // 上位构筑 cards, not just the shell.
  await expect(page.getByRole('heading', { name: '环境', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '宝可梦榜' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看全部宝可梦' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '上位构筑' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看全部队伍' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  // `content-length` is absent on vite preview's compressed responses, so read what the browser
  // says it actually pulled over the wire (`transferSize`, i.e. compressed bytes + headers).
  const scripts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry): entry is PerformanceResourceTiming => 'transferSize' in entry)
      .filter((entry) => new URL(entry.name).pathname.endsWith('.js') && new URL(entry.name).pathname !== '/sw.js')
      .map((entry) => ({ path: new URL(entry.name).pathname, bytes: entry.transferSize })),
  );
  const totalBytes = scripts.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`first paint JS = ${totalBytes} bytes across ${scripts.length} files:\n${
    [...scripts].sort((a, b) => b.bytes - a.bytes).map((entry) => `  ${entry.bytes}\t${entry.path}`).join('\n')
  }`);

  const requested = [...requestedScripts].sort();
  for (const forbidden of FORBIDDEN_FIRST_PAINT_CHUNKS) {
    expect(requested.filter((path) => path.includes(forbidden)), `${forbidden} must not load on #/env`).toEqual([]);
  }
  expect(scripts.length).toBe(requested.length);

  expect(totalBytes).toBeGreaterThan(0);
  expect(totalBytes).toBeLessThanOrEqual(FIRST_PAINT_JS_BUDGET_BYTES);
});
