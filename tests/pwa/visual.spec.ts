import { fileURLToPath } from 'node:url';

import { expect, type Page, test } from '@playwright/test';

// Frozen copy of public/data/pokedb/reg-ma-environment.json. The live snapshot is
// rewritten by the refresh pipeline (daily when it is healthy), and its timestamps and
// rankings render straight into these screenshots — without pinning it, every data
// refresh would redden the visual gate and stall the auto-merge pipeline. Refresh the
// fixture deliberately (copy the live file over it, then rebuild baselines) when you
// actually want the gate to look at newer data.
const ENVIRONMENT_SNAPSHOT_FIXTURE = fileURLToPath(
  new URL('./fixtures/environment-snapshot.json', import.meta.url),
);

// The season/regulation header and the freshness badge are both derived from the wall
// clock, so an unpinned clock would silently change pixels as real time passes a season
// boundary or a staleness threshold.
const FIXED_TIME = new Date('2026-07-20T12:00:00Z');

const screenshotOptions = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  maxDiffPixelRatio: 0.02,
  timeout: 15_000,
};

test.use({ serviceWorkers: 'block' });

const openApp = async (page: Page) => {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.route('**/data/pokedb/reg-ma-environment.json', (route) =>
    route.fulfill({ path: ENVIRONMENT_SNAPSHOT_FIXTURE, contentType: 'application/json' }),
  );
  await page.addInitScript(() => {
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView | null) => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = 0x1234abcd;
        return array;
      }
      return originalGetRandomValues(array as never);
    }) as typeof crypto.getRandomValues;
  });
  await page.goto('/');
  // First launch shows the onboarding tour (a z-[60] full-screen overlay).
  // Dismiss it (跳过 → 开始探索) so screenshots capture the real screens
  // instead of the tour, and so its overlay never intercepts later clicks.
  const skip = page.getByRole('button', { name: '跳过' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 5_000 });
    await skip.click();
    await page.getByRole('button', { name: '开始探索' }).click();
  } catch {
    // Onboarding already completed in this context — nothing to dismiss.
  }
  await expect(page.getByRole('heading', { name: '环境' })).toBeVisible();
};

const scrollTop = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
};

test('captures the mobile visual regression smoke set', { timeout: 60_000 }, async ({ page }) => {
  await openApp(page);

  await expect(page).toHaveScreenshot('01-environment-home.png', screenshotOptions);

  await page.getByRole('button', { name: '查看全部宝可梦' }).click();
  await expect(page.getByRole('heading', { name: '完整宝可梦榜' })).toBeVisible();
  await expect(page).toHaveScreenshot('02-environment-ranking.png', screenshotOptions);

  await page.getByRole('button', { name: /烈咬陆鲨/ }).click();
  await expect(page.getByRole('heading', { name: '烈咬陆鲨', exact: true })).toBeVisible();
  await expect(page.getByText('相关上位构筑')).toBeVisible();
  await expect(page).toHaveScreenshot('03-pokemon-environment-detail.png', screenshotOptions);

  await page.getByRole('button', { name: '返回环境' }).click();
  await page.getByRole('button', { name: '返回环境' }).click();
  await expect(page.getByRole('heading', { name: '环境' })).toBeVisible();

  await page.getByRole('button', { name: '查看数据口径' }).click();
  await expect(page.getByRole('heading', { name: '数据口径' })).toBeVisible();
  await expect(page).toHaveScreenshot('14-environment-methodology.png', screenshotOptions);
  await page.getByRole('button', { name: '返回环境' }).click();

  await page.getByRole('button', { name: '查看全部队伍' }).click();
  await expect(page.getByRole('heading', { name: '队伍一览' })).toBeVisible();
  await page.getByRole('button', { name: '双打' }).click();
  await expect(page).toHaveScreenshot('15-team-browse.png', screenshotOptions);

  await page.getByRole('button', { name: '试试灵感' }).click();
  const inspirationDialog = page.getByRole('dialog', { name: '队伍灵感' });
  await expect(inspirationDialog).toBeVisible();
  await expect(page).toHaveScreenshot('16-team-inspiration.png', screenshotOptions);
  await inspirationDialog.getByRole('button', { name: '关闭试试灵感' }).last().click();
  await page.getByRole('button', { name: '返回环境' }).click();

  await page.getByRole('button', { name: '队伍', exact: true }).click();
  await expect(page.getByText('我的队伍')).toBeVisible();
  await expect(page).toHaveScreenshot('04-team-list.png', screenshotOptions);

  const teamCard = page.getByLabel('队伍：Luxray test');
  await teamCard.click();
  await expect(page.getByRole('heading', { name: 'Luxray test' })).toBeVisible();
  await page.getByRole('button', { name: '继续编辑' }).click();
  await expect(page).toHaveScreenshot('05-team-detail.png', screenshotOptions);

  await page.getByRole('button', { name: /^伦琴猫 / }).click();
  await expect(page.getByText('能力值 / SP')).toBeVisible();

  await page.getByTitle('编辑成员').click();
  await expect(page.getByText('编辑成员')).toBeVisible();
  await expect(page).toHaveScreenshot('06-member-editor.png', screenshotOptions);
  await page.getByRole('button', { name: /速度\s*32/ }).click();
  await expect(page.getByText('拖动滑条，或直接设为最小 / 最大')).toBeVisible();
  await expect(page).toHaveScreenshot('07-member-editor-sp-picker.png', screenshotOptions);
  await page.getByTitle('关闭 SP 调整').click();
  await page.getByTitle('关闭').click();

  await page.getByRole('button', { name: '工具', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工具' })).toBeVisible();
  await expect(page).toHaveScreenshot('08-tools.png', screenshotOptions);

  await page.getByRole('button', { name: /伤害计算/ }).click();
  await scrollTop(page);
  await expect(page.getByText('选择进攻方', { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('09-calculator-selector.png', screenshotOptions);

  await page.getByRole('button', { name: '返回工具' }).click();
  await page.getByRole('button', { name: /速度线计算/ }).click();
  await expect(page.getByRole('heading', { name: '速度线' })).toBeVisible();
  const speedMarker = page.locator('[data-speed-marker]');
  await expect(speedMarker).toBeVisible();
  await speedMarker.scrollIntoViewIfNeeded();
  await expect(speedMarker).toBeInViewport();
  await page.evaluate(() => window.scrollBy(0, 120));
  await expect(page).toHaveScreenshot('17-speed-tier.png', screenshotOptions);
  await page.getByRole('button', { name: '返回工具' }).click();

  await page.getByRole('button', { name: /规则图鉴/ }).click();
  await scrollTop(page);
  await expect(page.getByText('规则内图鉴')).toBeVisible();
  await expect(page).toHaveScreenshot('10-dex.png', screenshotOptions);
  await page.getByRole('button', { name: /^烈咬陆鲨 / }).click();
  await expect(page.getByRole('heading', { name: '可学会招式' })).toBeVisible();
  await expect(page).toHaveScreenshot('11-dex-detail.png', screenshotOptions);
  await page.getByRole('button', { name: /返回图鉴列表/ }).click();
  await page.getByRole('button', { name: '打开图鉴过滤' }).click();
  await expect(page.getByText('最多选择 2 个属性')).toBeVisible();
  await expect(page).toHaveScreenshot('12-dex-type-filter.png', screenshotOptions);
  await page.getByTitle('关闭属性筛选').click();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await scrollTop(page);
  await expect(page.getByRole('heading', { name: '我的' })).toBeVisible();
  await expect(page.getByText('本地备份')).toBeVisible();
  await expect(page).toHaveScreenshot('13-profile.png', screenshotOptions);
});
