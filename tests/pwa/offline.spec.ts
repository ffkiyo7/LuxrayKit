import { expect, type Page, test } from '@playwright/test';

const dismissOnboarding = async (page: Page) => {
  const skip = page.getByRole('button', { name: '跳过' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 5_000 });
    await skip.click();
    await page.getByRole('button', { name: '开始探索' }).click();
  } catch {
    // The tour was already completed in this browser context.
  }
};

test('keeps app shell, teams, and unavailable tools available offline', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  await dismissOnboarding(page);
  await expect(page.getByRole('heading', { name: '环境', exact: true })).toBeVisible();

  const serviceWorkerReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  });
  expect(serviceWorkerReady).toBe(true);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '环境', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '队伍' }).click();
  await expect(page.getByText('我的队伍')).toBeVisible();
  await page.getByRole('button', { name: /新建/ }).click();
  await page.getByRole('textbox').fill('离线测试队');
  await page.getByRole('button', { name: '确认' }).click();
  await expect(page.getByText(/0\/6 成员/)).toBeVisible();

  await page.getByRole('button', { name: '我的' }).click();
  await expect(page.getByText('本地备份')).toBeVisible();
  await expect(page.getByRole('button', { name: /导出备份/ })).toBeVisible();

  await page.getByRole('button', { name: '工具' }).click();
  await expect(page.getByRole('button', { name: /速度线计算/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /速度线计算/ })).toContainText('敬请期待');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '环境', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '队伍' }).click();
  await expect(page.getByText('离线测试队')).toBeVisible();

  await page.getByRole('button', { name: '我的' }).click();
  await expect(page.getByText('离线缓存', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '工具' }).click();
  await expect(page.getByRole('button', { name: /速度线计算/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /速度线计算/ })).toContainText('敬请期待');

  await context.setOffline(false);
});
