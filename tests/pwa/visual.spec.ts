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

// Frozen copies of the VGCPastes team library (src/data/external/vgcpastes/*_team_samples.json).
// Unlike the PokeDB snapshot these are not fetched: each file is `import()`ed and bundled into its
// own `assets/<file name>-<hash>.js` chunk, so the chunk request is answered with the fixture
// instead. Without this, the weekly automation/vgcpastes-team-refresh PR would change the teams
// on 15-team-browse / 16-team-inspiration and redden the gate on whichever UI PR came next.
// Refresh deliberately, like the environment fixture above: copy the live files over, rebuild.
const VGCPASTES_FIXTURES = ['reg_mb_champions_mb_team_samples', 'reg_mc_champions_mc_team_samples'].map((name) => ({
  name,
  path: fileURLToPath(new URL(`./fixtures/vgcpastes/${name}.json`, import.meta.url)),
}));

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
  const servedTeamFixtures = new Set<string>();
  for (const fixture of VGCPASTES_FIXTURES) {
    const moduleBody = `export default ${await readFile(fixture.path, 'utf8')};`;
    await page.route(`**/assets/${fixture.name}-*.js`, (route) => {
      servedTeamFixtures.add(fixture.name);
      return route.fulfill({ body: moduleBody, contentType: 'text/javascript' });
    });
  }
  await page.addInitScript(() => {
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView | null) => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = 0x1234abcd;
        return array;
      }
      return originalGetRandomValues(array as never);
    }) as typeof crypto.getRandomValues;
    // 01-06 is a once-per-browser sheet over 环境. Every frame below is the screen *behind*
    // it, so it is marked as already seen instead of dismissed with a click.
    try {
      window.localStorage.setItem('luxraykit.env.methodologySeen', '1');
    } catch {
      // Blocked storage makes the sheet render; the 01 shot would then show it.
    }
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();
  // A renamed chunk would slip past the glob and quietly put the live library back on screen.
  await expect
    .poll(() => [...servedTeamFixtures].sort(), { message: 'VGCPastes chunks were not served from the fixture' })
    .toEqual(VGCPASTES_FIXTURES.map((fixture) => fixture.name).sort());
};

const scrollTop = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
};

test('captures the mobile visual regression smoke set', { timeout: 60_000 }, async ({ page }) => {
  await openApp(page);

  await expect(page).toHaveScreenshot('01-environment-home.png', screenshotOptions);

  await page.getByRole('button', { name: '查看完整使用排行' }).click();
  await expect(page.getByRole('heading', { name: '使用排行' })).toBeVisible();
  await expect(page).toHaveScreenshot('02-environment-ranking.png', screenshotOptions);

  await page.getByRole('button', { name: /烈咬陆鲨/ }).click();
  await expect(page.getByRole('heading', { name: '烈咬陆鲨', exact: true })).toBeVisible();
  // 常用招式 comes from the move catalog, which this screen loads on demand (it is deliberately
  // not in the environment first paint). Wait for it so the shot is taken on the settled layout
  // rather than racing the chunk. Same pixels, just a deterministic moment.
  await expect(page.getByText('常用招式')).toBeVisible();
  await expect(page.getByText('相关上位构筑')).toBeVisible();
  await expect(page).toHaveScreenshot('03-pokemon-environment-detail.png', screenshotOptions);

  // Every pushed environment screen now carries the same 返回 chevron (environmentChrome's
  // PushHeader / hero button); it pops real history, so two taps walk detail → ranking → home.
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();

  // 数据口径 is its own route (#/env/methodology) and the home no longer links to it — only the
  // 数据源异常 notice and 我的 · 离线缓存 do, neither of which this frozen snapshot raises. Go
  // there by hash, which is the same navigation the app performs.
  await page.evaluate(() => {
    window.location.hash = '#/env/methodology';
  });
  await expect(page.getByRole('heading', { name: '数据口径' })).toBeVisible();
  await expect(page).toHaveScreenshot('14-environment-methodology.png', screenshotOptions);
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();

  // 07-01 has no battle-type tabs of its own — the browse list inherits 环境's toggle, which
  // starts on the rule set's own format.
  await page.getByRole('button', { name: '查看全部上位构筑' }).click();
  await expect(page.getByRole('heading', { name: '上位构筑', exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('15-team-browse.png', screenshotOptions);

  // 07-05's 随机一队 draws from whatever the list currently holds. The redesign dropped the
  // 排位高分 / 赛事 filter that used to keep the draw inside the frozen PokeDB fixture, so this
  // shot now also depends on the VGCPastes sample files: a curated-sample refresh can make the
  // pinned shuffle seed land on a different card and redden this baseline. There is no filter
  // left to re-isolate it; rebuild 16 when that happens.
  await page.getByRole('button', { name: '随机一队' }).click();
  const inspirationDialog = page.getByRole('dialog', { name: '随机一队' });
  await expect(inspirationDialog).toBeVisible();
  await expect(page).toHaveScreenshot('16-team-inspiration.png', screenshotOptions);
  await inspirationDialog.getByRole('button', { name: '关闭随机一队' }).last().click();
  await page.getByRole('button', { name: '返回' }).click();

  await page.getByRole('button', { name: '队伍', exact: true }).click();
  await expect(page.getByText('我的队伍')).toBeVisible();
  await expect(page).toHaveScreenshot('04-team-list.png', screenshotOptions);

  // The fixture team is the shipped preset on its first appearance (02-02's card), which is a
  // section, not a button: only 「接着补齐这支」 opens it. The team name is a heading on the list
  // card too, so the detail page is confirmed by its member tile instead.
  await page.getByLabel('队伍：Luxray test').getByRole('button', { name: '接着补齐这支' }).click();
  const luxrayTile = page.getByRole('button', { name: /^展开 伦琴猫/ });
  await expect(luxrayTile).toBeVisible();
  await expect(page).toHaveScreenshot('05-team-detail.png', screenshotOptions);

  await luxrayTile.click();
  await expect(page.getByText('能力值', { exact: true })).toBeVisible();

  // 03 draws the member editor as a whole page (#/teams/:id/members/:id), not a sheet, and the
  // SP picker is the inline 能力分配 wheel rather than an overlay.
  await page.getByRole('button', { name: /编辑配置/ }).click();
  await expect(page.getByRole('heading', { name: '编辑配置' })).toBeVisible();
  await expect(page).toHaveScreenshot('06-member-editor.png', screenshotOptions);
  await page.getByRole('button', { name: '调整速度' }).click();
  await expect(page.getByRole('slider', { name: '速度 SP' })).toBeVisible();
  await expect(page).toHaveScreenshot('07-member-editor-sp-picker.png', screenshotOptions);
  await page.getByRole('button', { name: '返回队伍详情' }).click();

  await page.getByRole('button', { name: '工具', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工具' })).toBeVisible();
  await expect(page).toHaveScreenshot('08-tools.png', screenshotOptions);

  await page.getByRole('button', { name: /伤害计算/ }).click();
  await scrollTop(page);
  await expect(page.getByText('请先选择进攻方、防守方和招式。')).toBeVisible();
  await expect(page).toHaveScreenshot('09-calculator-selector.png', screenshotOptions);

  await page.getByRole('button', { name: '返回工具' }).click();
  await page.getByRole('button', { name: /^速度线/ }).click();
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
  await expect(page.getByRole('heading', { name: '规则内图鉴' })).toBeVisible();
  await expect(page).toHaveScreenshot('10-dex.png', screenshotOptions);
  await page.getByRole('button', { name: /^烈咬陆鲨 / }).click();
  await expect(page.getByRole('heading', { name: '可学会招式' })).toBeVisible();
  await expect(page).toHaveScreenshot('11-dex-detail.png', screenshotOptions);
  await page.getByRole('button', { name: /返回图鉴列表/ }).click();
  // 04-06's filter is an inline drawer opened by a disclosure chip (属性 / 类别), not a sheet;
  // 收起筛选 in its footer is what closes it.
  await page.getByRole('button', { name: '属性', exact: true }).click();
  await expect(page.getByText('属性 · 最多选 2 个')).toBeVisible();
  await expect(page).toHaveScreenshot('12-dex-type-filter.png', screenshotOptions);
  await page.getByRole('button', { name: '收起筛选' }).click();
  await page.getByRole('button', { name: '道具', exact: true }).click();
  await page.getByRole('button', { name: '类别', exact: true }).click();
  await expect(page.getByRole('button', { name: '收起筛选' })).toBeVisible();
  await expect(page).toHaveScreenshot('18-dex-item-filter.png', screenshotOptions);
  await page.getByRole('button', { name: '收起筛选' }).click();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await scrollTop(page);
  await expect(page.getByRole('heading', { name: '我的' })).toBeVisible();
  await expect(page.getByText('本地备份')).toBeVisible();
  await expect(page).toHaveScreenshot('13-profile.png', screenshotOptions);
});

/**
 * The light theme's own pass. The set above runs entirely on the default dark theme, so every
 * light value shipped in P7 was until now covered by nothing — a regression in `--segment-on-shadow`
 * or a card that forgets `--raised-shadow` is invisible on dark and reddens no gate.
 *
 * Six screens, deliberately not eighteen: one page per surface family (list, card grid, editor,
 * tool cards, data rows, settings rows), which between them carry the light theme's whole
 * vocabulary. The baselines stay few and stable, as `AGENTS.md` §3 asks.
 *
 * The theme is switched through the product's own control (我的 · 主题), not by stamping
 * `data-theme`: the switch writes the preference to IndexedDB and `App` mirrors it onto the root,
 * so this also covers that the persisted value survives navigation.
 */
test('captures the light-theme set', { timeout: 60_000 }, async ({ page }) => {
  await openApp(page);

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的' })).toBeVisible();
  await page.getByRole('switch', { name: '切换深色和浅色主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await scrollTop(page);
  await expect(page.getByText('本地备份')).toBeVisible();
  await expect(page).toHaveScreenshot('19-light-profile.png', screenshotOptions);

  await page.getByRole('button', { name: '环境', exact: true }).click();
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();
  await page.getByRole('button', { name: '查看完整使用排行' }).click();
  await expect(page.getByRole('heading', { name: '使用排行' })).toBeVisible();
  await expect(page).toHaveScreenshot('20-light-environment-ranking.png', screenshotOptions);

  await page.getByRole('button', { name: '队伍', exact: true }).click();
  await expect(page.getByText('我的队伍')).toBeVisible();
  await page.getByLabel('队伍：Luxray test').getByRole('button', { name: '接着补齐这支' }).click();
  const luxrayTile = page.getByRole('button', { name: /^展开 伦琴猫/ });
  await expect(luxrayTile).toBeVisible();
  await expect(page).toHaveScreenshot('21-light-team-detail.png', screenshotOptions);

  await luxrayTile.click();
  await expect(page.getByText('能力值', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /编辑配置/ }).click();
  await expect(page.getByRole('heading', { name: '编辑配置' })).toBeVisible();
  await expect(page).toHaveScreenshot('22-light-member-editor.png', screenshotOptions);
  await page.getByRole('button', { name: '返回队伍详情' }).click();

  await page.getByRole('button', { name: '工具', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工具' })).toBeVisible();
  await expect(page).toHaveScreenshot('23-light-tools.png', screenshotOptions);

  await page.getByRole('button', { name: /规则图鉴/ }).click();
  await scrollTop(page);
  await expect(page.getByRole('heading', { name: '规则内图鉴' })).toBeVisible();
  await page.getByRole('button', { name: /^烈咬陆鲨 / }).click();
  await expect(page.getByRole('heading', { name: '可学会招式' })).toBeVisible();
  await expect(page).toHaveScreenshot('24-light-dex-detail.png', screenshotOptions);
});
