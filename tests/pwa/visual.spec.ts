import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, type Page, test } from '@playwright/test';

import { currentSeasonLabel } from '../../src/data/schedule';
import { currentRuleSet } from '../../src/data/seed/regMA/metadata';

// Frozen copy of public/data/pokedb/reg-ma-environment.json. The live snapshot is
// rewritten by the refresh pipeline (daily when it is healthy), and its timestamps and
// rankings render straight into these screenshots — without pinning it, every data
// refresh would redden the visual gate and stall the auto-merge pipeline. Refresh the
// fixture deliberately (copy the live file over it, then rebuild baselines) when you
// actually want the gate to look at newer data.
const ENVIRONMENT_SNAPSHOT_FIXTURE = fileURLToPath(
  new URL('./fixtures/environment-snapshot.json', import.meta.url),
);

const DAY_MS = 24 * 60 * 60 * 1000;

// The season/regulation header and the catalog-lag notice are both derived from the wall
// clock, so an unpinned clock would silently change pixels as real time passes a season or
// regulation boundary. The clock is derived from the *catalog* rather than
// written as a literal: `CatalogRegulationLagNotice` compares the schedule's regulation at
// `now` against `currentRuleSet`, so a clock left behind in the previous regulation renders
// the lag notice inverted ("规则已切换到 M-B，本地图鉴仍为 M-C") and the header would label the
// screenshots with the old regulation. Eleven days into the catalog's own window keeps it
// clear of both ends of the rollover.
const RULE_SET_START = new Date(currentRuleSet.startAt);
const FIXED_TIME = new Date(
  Date.UTC(
    RULE_SET_START.getUTCFullYear(),
    RULE_SET_START.getUTCMonth(),
    RULE_SET_START.getUTCDate() + 11,
    12,
    0,
    0,
  ),
);
if (FIXED_TIME <= RULE_SET_START || FIXED_TIME >= new Date(currentRuleSet.endAt)) {
  throw new Error(
    `Frozen visual clock ${FIXED_TIME.toISOString()} falls outside ${currentRuleSet.name} ` +
      `(${currentRuleSet.startAt} – ${currentRuleSet.endAt}). Shorten the offset in visual.spec.ts.`,
  );
}

// Season labels rewritten into the snapshot below. The header prefers the snapshot's own
// season (productContextLabel), so it has to agree with the schedule at FIXED_TIME.
const SNAPSHOT_SEASON = currentSeasonLabel(FIXED_TIME);
const SNAPSHOT_SEASON_NUMBER = Number(/^M-(\d+)$/.exec(SNAPSHOT_SEASON)?.[1]);
if (!Number.isInteger(SNAPSHOT_SEASON_NUMBER)) {
  throw new Error(
    `No "M-n" season in seasonSchedule covers ${FIXED_TIME.toISOString()} (got "${SNAPSHOT_SEASON}"). ` +
      'Append the season window to src/data/schedule.ts.',
  );
}
// The refresh pipeline pulls high-score team samples from the previous, completed season
// (scripts/update-pokedb-environment.mjs: max(selectedSeason - 1, 1)).
const SAMPLE_SEASON = `M-${Math.max(SNAPSHOT_SEASON_NUMBER - 1, 1)}`;

// `retrievedAt` is an ISO instant; PokeDB's own `updatedAt` is a zone-less JST wall clock
// ("2026-07-19 00:43:00"). Both are rendered on the environment header, so they are pinned
// relative to FIXED_TIME instead of staying frozen in the fixture's original month.
const SNAPSHOT_RETRIEVED_AT = new Date(FIXED_TIME.getTime() - DAY_MS).toISOString();
const SNAPSHOT_SOURCE_UPDATED_AT = new Date(FIXED_TIME.getTime() - 2 * DAY_MS + 9 * 60 * 60 * 1000)
  .toISOString()
  .replace('T', ' ')
  .slice(0, 19);

/**
 * The fixture's rankings and counts are served verbatim; only its timestamps and season labels
 * are rewritten, so the screenshots stay coherent with the frozen clock without editing (and
 * re-reviewing) the checked-in JSON at every rollover.
 */
const frozenSnapshotBody = async () => {
  const snapshot = JSON.parse(await readFile(ENVIRONMENT_SNAPSHOT_FIXTURE, 'utf8')) as {
    retrievedAt: string;
    battles: Record<string, { season: string; seasonNumber: number; updatedAt: string }>;
    teamSamples?: Record<string, Array<{ season: string }>>;
    dataFreshness?: { selectedSeason: number };
  };
  snapshot.retrievedAt = SNAPSHOT_RETRIEVED_AT;
  Object.values(snapshot.battles).forEach((battle) => {
    battle.season = SNAPSHOT_SEASON;
    battle.seasonNumber = SNAPSHOT_SEASON_NUMBER;
    battle.updatedAt = SNAPSHOT_SOURCE_UPDATED_AT;
  });
  Object.values(snapshot.teamSamples ?? {}).forEach((samples) => {
    samples.forEach((sample) => {
      sample.season = SAMPLE_SEASON;
    });
  });
  if (snapshot.dataFreshness) snapshot.dataFreshness.selectedSeason = SNAPSHOT_SEASON_NUMBER;
  return JSON.stringify(snapshot);
};

const screenshotOptions = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  maxDiffPixelRatio: 0.02,
  timeout: 15_000,
};

test.use({ serviceWorkers: 'block' });

const openApp = async (page: Page) => {
  await page.clock.setFixedTime(FIXED_TIME);
  const snapshotBody = await frozenSnapshotBody();
  await page.route('**/data/pokedb/reg-ma-environment.json', (route) =>
    route.fulfill({ body: snapshotBody, contentType: 'application/json' }),
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
  // 常用招式 comes from the move catalog, which this screen loads on demand (it is deliberately
  // not in the environment first paint). Wait for it so the shot is taken on the settled layout
  // rather than racing the chunk. Same pixels, just a deterministic moment.
  await expect(page.getByText('常用招式')).toBeVisible();
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

  // Keep the inspiration draw inside the frozen PokeDB fixture. Event samples are
  // generated separately and refresh without this fixture or its visual baseline;
  // including them here makes the pinned shuffle seed select a different card after
  // an otherwise unrelated data refresh.
  const rankedFilter = page.getByRole('button', { name: '排位高分' });
  await rankedFilter.click();
  await expect(rankedFilter).toHaveAttribute('aria-pressed', 'true');
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
  await page.getByRole('button', { name: '道具' }).click();
  await page.getByRole('button', { name: '打开道具类别筛选' }).click();
  await expect(page.getByText('道具类别筛选')).toBeVisible();
  await expect(page).toHaveScreenshot('18-dex-item-filter.png', screenshotOptions);
  await page.getByTitle('关闭道具类别筛选').click();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await scrollTop(page);
  await expect(page.getByRole('heading', { name: '我的' })).toBeVisible();
  await expect(page.getByText('本地备份')).toBeVisible();
  await expect(page).toHaveScreenshot('13-profile.png', screenshotOptions);
});
