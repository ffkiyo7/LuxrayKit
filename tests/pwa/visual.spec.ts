import { expect, type Page, test } from '@playwright/test';

const screenshotOptions = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  maxDiffPixelRatio: 0.02,
  timeout: 15_000,
};

test.use({ serviceWorkers: 'block' });

const openApp = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '环境' })).toBeVisible();
};

const scrollTop = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
};

test('captures the mobile visual regression smoke set', { timeout: 60_000 }, async ({ page }) => {
  await openApp(page);

  await expect(page).toHaveScreenshot('01-environment-home.png', screenshotOptions);

  await page.getByRole('button', { name: /查看全部/ }).click();
  await expect(page.getByRole('heading', { name: '完整宝可梦榜' })).toBeVisible();
  await expect(page).toHaveScreenshot('02-environment-ranking.png', screenshotOptions);

  await page.getByRole('button', { name: /烈咬陆鲨/ }).click();
  await expect(page.getByRole('heading', { name: '烈咬陆鲨', exact: true })).toBeVisible();
  await expect(page.getByText('相关上位构筑')).toBeVisible();
  await expect(page).toHaveScreenshot('03-pokemon-environment-detail.png', screenshotOptions);

  await page.getByRole('button', { name: '返回环境' }).click();
  await page.getByRole('button', { name: '返回环境' }).click();
  await expect(page.getByRole('heading', { name: '环境' })).toBeVisible();

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
  await expect(page.getByText('选择进攻方')).toBeVisible();
  await expect(page).toHaveScreenshot('09-calculator-selector.png', screenshotOptions);

  await page.getByRole('button', { name: '返回工具' }).click();
  await expect(page.getByRole('button', { name: /速度线计算/ })).toBeDisabled();

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
