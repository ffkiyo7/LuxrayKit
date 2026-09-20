import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

import { currentRuleSet } from '../../src/data/seed/regMA/metadata';

/**
 * Guards that the generated team-sample library actually reaches 上位构筑 (#/env/teams):
 * the curated VGCPastes files for *every live regulation* (M-B + M-C; M-A was dropped on
 * 2026-09-20) plus the PokeDB high-score samples, all scoped to the rule set's own battle
 * type, each stamped with the regulation it came from.
 *
 * The old 赛事 / M-B filters are gone with the redesign — 07-01 has four chips
 * (全部 / 带配招 / 带 SP / 有队伍码) and no category or regulation picker. So the counts are
 * checked against the chip that does exist (全部 N, which is scoped to the current battle
 * type) and the regulation stamp is checked where it is still rendered: every card's meta
 * line is 「第 n 名 · 双打 · M-B」.
 *
 * Every expected number is read from the generated files at run time, never written out, so a
 * data refresh moves the test with it.
 */

const battleTypeLabels: Record<'singles' | 'doubles', string> = { singles: '单打', doubles: '双打' };

type Sample = {
  id: string;
  battleType: 'singles' | 'doubles';
  title?: string;
  regulation?: string;
  hasMoves?: boolean;
  hasSpread?: boolean;
};

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8')) as T;

/** 01-06 is a one-shot sheet over 环境; nothing on the page is tappable until it is gone. */
const dismissMethodologyIntro = async (page: Page) => {
  const intro = page.getByRole('dialog', { name: '数据口径' });
  await intro.getByRole('button', { name: '知道了' }).click();
  await expect(intro).toHaveCount(0);
};

test('renders the generated VGCPastes team library', async ({ page, context }) => {
  // The rule set decides which battle type every toggle in the app opens on; the browse list
  // is scoped to it, so the expected counts are too.
  const battleType = currentRuleSet.battleType as 'singles' | 'doubles';

  const [mcSamples, mbSamples, snapshot] = await Promise.all([
    readJson<Sample[]>('src/data/external/vgcpastes/reg_mc_champions_mc_team_samples.json'),
    readJson<Sample[]>('src/data/external/vgcpastes/reg_mb_champions_mb_team_samples.json'),
    // `vite preview` has no Worker, so the app falls through to the bundled static snapshot.
    readJson<{ teamSamples?: Partial<Record<'singles' | 'doubles', Sample[]>> }>(
      'public/data/pokedb/reg-ma-environment.json',
    ),
  ]);
  const inBattleType = (samples: Sample[]) => samples.filter((sample) => sample.battleType === battleType);
  const expectedSamples = [
    ...(snapshot.teamSamples?.[battleType] ?? []),
    ...inBattleType(mbSamples),
    ...inBattleType(mcSamples),
  ];
  const expectedWithMoves = expectedSamples.filter((sample) => Boolean(sample.hasMoves)).length;

  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await context.clearCookies();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日环境' })).toBeVisible();
  await dismissMethodologyIntro(page);

  const browseButton = page.getByRole('button', { name: '查看全部上位构筑' });
  await browseButton.scrollIntoViewIfNeeded();
  await browseButton.click();
  await expect(page.getByRole('heading', { name: '上位构筑', exact: true })).toBeVisible();

  // 全部 N is the only count the redesign still shows, and it is the whole library for this
  // battle type — both curated regulation files plus the ladder samples.
  const allChip = page.getByRole('button', { name: `全部 ${expectedSamples.length}` });
  await expect(allChip).toBeVisible();
  const list = page.getByRole('region', { name: '上位构筑列表' });
  await expect(list.getByRole('heading', { level: 3 })).toHaveCount(expectedSamples.length);
  await expect(page.getByRole('button', { name: '导入为我的队伍' }).first()).toBeVisible();

  // Filtering still narrows the list to exactly what the chip promises (the old 赛事 / M-B
  // assertion's job).
  const movesChip = page.getByRole('button', { name: `带配招 ${expectedWithMoves}` });
  await movesChip.click();
  await expect(movesChip).toHaveAttribute('aria-pressed', 'true');
  await expect(list.getByRole('heading', { level: 3 })).toHaveCount(expectedWithMoves);
  await allChip.click();

  // Regulation stamping: a curated sample keeps the regulation of the file it came from, and
  // the card meta is where that reaches the screen.
  const stamped = inBattleType(mbSamples).find((sample) => sample.title && sample.regulation);
  expect(stamped, 'the M-B sample file must carry at least one titled, regulation-tagged team').toBeTruthy();
  await page.getByRole('textbox', { name: '搜索队伍或宝可梦' }).fill(stamped!.title!);
  const stampedCard = list.locator('section').filter({ has: page.getByRole('heading', { name: stamped!.title! }) }).first();
  await expect(stampedCard).toContainText(`${battleTypeLabels[battleType]} · ${stamped!.regulation}`);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => message.includes('VGCPastes'))).toEqual([]);
});
