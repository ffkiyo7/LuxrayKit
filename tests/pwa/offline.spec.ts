import { expect, test, type Page } from '@playwright/test';

/**
 * Two behaviours, both unchanged by the 2026-09 redesign:
 *  - the shell, all four tabs and the bundled catalog stay usable with the network cut;
 *  - a team written while online survives an offline reload (IndexedDB, not the HTTP cache).
 *
 * Only the selectors moved. 环境 is now the 今日环境 home; 导出备份 became 我的 · 本地备份 ·
 * 导出 JSON (its own route); and the tools page's data-backed line is 规则图鉴's
 * 「N 只 · <规则>」 rather than the old 速度线计算 subtitle — same job, it can only render
 * from the local catalog, so it proves the catalog is on the device.
 */

/** 01-06 is a one-shot sheet over 环境; nothing on the page is tappable until it is gone. */
const dismissMethodologyIntro = async (page: Page) => {
  const intro = page.getByRole('dialog', { name: '数据口径' });
  await intro.getByRole('button', { name: '知道了' }).click();
  await expect(intro).toHaveCount(0);
};

test('keeps app shell, teams, and the local catalog available offline', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();
  await dismissMethodologyIntro(page);
  // The ranking section only exists once the environment snapshot resolved, so it — not the
  // page title, which the loading and failure views also draw — is what says 环境 is usable.
  await expect(page.getByRole('heading', { name: '使用排行' })).toBeVisible();

  const serviceWorkerReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  });
  expect(serviceWorkerReady).toBe(true);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();

  await page.getByRole('button', { name: '队伍', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的队伍' })).toBeVisible();
  await page.getByRole('button', { name: '新建队伍' }).click();
  await page.getByRole('textbox', { name: '队伍名称' }).fill('离线测试队');
  await page.getByRole('button', { name: '建立' }).click();
  await expect(page.getByText(/0\/6 成员/)).toBeVisible();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的' })).toBeVisible();
  // 本地备份 is a pushed page now (N08-01) and it hides the tab bar, so walk in and back out.
  await page.getByRole('button', { name: /本地备份/ }).click();
  await expect(page.getByRole('button', { name: '导出 JSON' })).toBeVisible();
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.getByRole('heading', { name: '我的' })).toBeVisible();

  await page.getByRole('button', { name: '工具', exact: true }).click();
  const dexCard = page.getByRole('button', { name: /规则图鉴/ });
  await expect(dexCard).toBeEnabled();
  await expect(dexCard).toContainText(/\d+ 只 · M-/);
  await expect(page.getByRole('button', { name: /^速度线/ })).toBeEnabled();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Navigation lives in the URL hash, so a reload comes back to the screen the user was
  // on (工具) instead of resetting to 环境. That is the whole point of the change — assert the
  // new behaviour rather than papering over it.
  await expect(page).toHaveURL(/#\/tools$/);
  await expect(page.getByRole('heading', { name: '工具', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /规则图鉴/ })).toContainText(/\d+ 只 · M-/);
  await expect(page.getByRole('button', { name: /^速度线/ })).toBeEnabled();

  await page.getByRole('button', { name: '环境', exact: true }).click();
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();

  await page.getByRole('button', { name: '队伍', exact: true }).click();
  await expect(page.getByText('离线测试队')).toBeVisible();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('离线缓存', { exact: true })).toBeVisible();

  await context.setOffline(false);
});
