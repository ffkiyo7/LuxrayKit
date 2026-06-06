import { expect, test } from '@playwright/test';

test('keeps app shell, teams, and unavailable tools available offline', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '环境' })).toBeVisible();

  const serviceWorkerReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  });
  expect(serviceWorkerReady).toBe(true);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '环境' })).toBeVisible();

  await page.getByRole('button', { name: '队伍' }).click();
  await expect(page.getByText('我的队伍')).toBeVisible();
  await page.getByRole('button', { name: /新建/ }).click();
  await page.getByPlaceholder(/输入队伍名称/).fill('离线测试队');
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
  await expect(page.getByRole('heading', { name: '环境' })).toBeVisible();

  await page.getByRole('button', { name: '队伍' }).click();
  await expect(page.getByText('离线测试队')).toBeVisible();

  await page.getByRole('button', { name: '我的' }).click();
  await expect(page.getByText('离线缓存', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '工具' }).click();
  await expect(page.getByRole('button', { name: /速度线计算/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /速度线计算/ })).toContainText('敬请期待');

  await context.setOffline(false);
});
