// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentState, EnvironmentTeamSample } from '../data/environment';
import { pokemon } from '../data/seed/regMA/catalog';
import { EnvironmentPage } from './EnvironmentPage';

const makeEnvironment = (overallUsageBasis: EnvironmentState['overallUsageBasis']): EnvironmentState => ({
  auditIssues: [],
  updatedAt: '2026-06-10T23:58:00.000+09:00',
  dataStatusLabel: '当季聚合统计',
  overallUsageBasis,
  pokemonUsage: {
    singles: [
      {
        pokemonId: 'garchomp',
        usageRate: 100,
        teamCount: 213,
        moveIds: ['earthquake'],
        itemIds: ['focus-sash'],
        teammateIds: ['archaludon'],
        moveStats: [{ id: 'earthquake', usageRate: 99.2, teamCount: 211 }],
        itemStats: [{ id: 'focus-sash', usageRate: 37.7, teamCount: 80 }],
        teammateStats: [{ id: 'archaludon', usageRate: 85.7, teamCount: 0 }],
      },
      {
        pokemonId: 'archaludon',
        usageRate: 99,
        teamCount: 211,
        moveIds: [],
        itemIds: [],
        teammateIds: [],
      },
      {
        pokemonId: 'incineroar',
        usageRate: 98,
        teamCount: 209,
        moveIds: [],
        itemIds: [],
        teammateIds: [],
      },
    ],
    doubles: [],
  },
  sampleTeamCounts: { singles: 213, doubles: 0 },
  teamSamples: [],
  sourceLabel: 'PokeDB · M-2 · 宝可梦使用率统计',
  loadStatus: 'pokedb',
  seasonLabel: 'M-2',
  sourceKind: 'worker',
  freshness: 'fresh',
  sourceStatus: 'ok',
  sourceUpdatedAt: '2026-06-10T23:58:00.000+09:00',
});

const makeTierEnvironment = (): EnvironmentState => ({
  ...makeEnvironment('rank-relative'),
  pokemonUsage: {
    singles: pokemon.slice(0, 61).map((entry, index) => ({
      pokemonId: entry.id,
      usageRate: 100 - index,
      teamCount: 213 - index,
      moveIds: [],
      itemIds: [],
      teammateIds: [],
    })),
    doubles: [],
  },
});

// 队伍一览 defaults its regulation filter to 全部规则 (all). Fixtures here tag untagged
// samples as M-B (current rule); tests that exercise the regulation filter pass an explicit
// regulation, which is preserved.
const makeTeamSampleEnvironment = (teamSamples: EnvironmentTeamSample[]): EnvironmentState => ({
  ...makeEnvironment('rank-relative'),
  teamSamples: teamSamples.map((sample) => ({ regulation: 'M-B' as const, ...sample })),
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EnvironmentPage usage basis', () => {
  it('shows a current-rule Pokemon fact and rotates without repeating immediately', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    const banner = screen.getByLabelText('宝可梦趣味小知识');
    expect(within(banner).getByText('你知道吗？')).toBeTruthy();
    expect(within(banner).queryByText(/冷知识/)).toBeNull();
    const firstFact = within(banner).getByText((_, element) => element?.tagName === 'P' && element.className.includes('text-sm')).textContent;

    await user.click(within(banner).getByRole('button', { name: '换一条小知识' }));

    const nextFact = within(banner).getByText((_, element) => element?.tagName === 'P' && element.className.includes('text-sm')).textContent;
    expect(nextFact).not.toBe(firstFact);
  });

  it('uses source-aware sample card labels without forcing VGCPastes into season/rank/score text', async () => {
    const user = userEvent.setup();
    const samples: EnvironmentTeamSample[] = [
      {
        id: 'pokedb-singles-rank-1',
        dataKind: 'external-snapshot',
        author: 'PokeDB author',
        season: 'M-3',
        score: 2815,
        rank: 1,
        title: 'M-3 · 最高第 1 名 · 2815 分',
        battleType: 'singles',
        reportUrl: 'https://example.com/pokedb',
        slots: [{ pokemonId: 'garchomp', itemId: 'focus-sash', moveIds: [] }],
      },
      {
        id: 'vgcpastes-champions-ma-example',
        dataKind: 'external-snapshot',
        sourceId: 'vgcpastes-champions-ma',
        author: 'VGC author',
        season: 'reg-ma',
        score: 0,
        title: 'PJCS 2026 public team',
        battleType: 'singles',
        reportUrl: 'https://example.com/vgc',
        tournament: 'PJCS 2026',
        eventRank: 'Top 4 (Seniors)',
        dateShared: '2026-06-07',
        replicaCode: 'ABC123DEFG',
        hasMoves: true,
        hasSpread: true,
        slots: [{ pokemonId: 'garchomp', itemId: 'focus-sash', moveIds: ['earthquake'] }],
      },
    ];

    render(<EnvironmentPage environment={makeTeamSampleEnvironment(samples)} onImportSample={() => undefined} />);

    // Default view is now 双打; these fixtures are singles samples, so switch to see them.
    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(screen.getByText('M-3 · 最高第 1 名 · 2815 分')).toBeTruthy();
    expect(screen.getByText('PokeDB 环境榜')).toBeTruthy();
    expect(screen.getByText('PJCS 2026 public team')).toBeTruthy();
    expect(screen.getByText('VGCPastes')).toBeTruthy();
    expect(screen.getByText(/原作者：VGC author · PJCS 2026 · Top 4 \(Seniors\) · 分享 2026-06-07/)).toBeTruthy();
    const vgcCard = screen.getByText('PJCS 2026 public team').closest('section');
    expect(vgcCard).toBeTruthy();
    expect(within(vgcCard as HTMLElement).getByLabelText('可导入 SP分配')).toBeTruthy();
    expect(within(vgcCard as HTMLElement).getByLabelText('可导入 配招')).toBeTruthy();
    expect(within(vgcCard as HTMLElement).getByLabelText('可导入 队伍码')).toBeTruthy();
    const pokeDbCard = screen.getByText('M-3 · 最高第 1 名 · 2815 分').closest('section');
    expect(within(pokeDbCard as HTMLElement).queryByLabelText(/可导入/)).toBeNull();
    expect(screen.queryByText(/0 分/)).toBeNull();
  });

  it('maps pokemon detail related teams across PokeDB and VGCPastes sample sources', async () => {
    const user = userEvent.setup();
    const samples: EnvironmentTeamSample[] = [
      {
        id: 'pokedb-singles-rank-1',
        dataKind: 'external-snapshot',
        author: 'PokeDB author',
        season: 'M-3',
        score: 2815,
        rank: 1,
        title: 'M-3 · 最高第 1 名 · 2815 分',
        battleType: 'singles',
        reportUrl: 'https://example.com/pokedb',
        slots: [{ pokemonId: 'garchomp', itemId: 'focus-sash', moveIds: [] }],
      },
      {
        id: 'vgcpastes-champions-ma-garchomp',
        dataKind: 'external-snapshot',
        sourceId: 'vgcpastes-champions-ma',
        author: 'VGC author',
        season: 'reg-ma',
        score: 0,
        title: 'PJCS 2026 Garchomp Team',
        battleType: 'singles',
        reportUrl: 'https://example.com/vgc',
        tournament: 'PJCS 2026',
        eventRank: 'Top 4',
        hasMoves: true,
        hasSpread: true,
        slots: [{ pokemonId: 'garchomp', itemId: 'focus-sash', moveIds: ['earthquake'] }],
      },
      {
        id: 'vgcpastes-champions-ma-other',
        dataKind: 'external-snapshot',
        sourceId: 'vgcpastes-champions-ma',
        author: 'Other author',
        season: 'reg-ma',
        score: 0,
        title: 'Unrelated VGCPastes Team',
        battleType: 'singles',
        reportUrl: 'https://example.com/other',
        tournament: 'PJCS 2026',
        eventRank: 'Top 8',
        hasMoves: true,
        hasSpread: true,
        slots: [{ pokemonId: 'archaludon', itemId: 'leftovers', moveIds: ['draco-meteor'] }],
      },
    ];

    render(<EnvironmentPage environment={makeTeamSampleEnvironment(samples)} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));

    const relatedSection = screen.getByText('相关上位构筑').closest('section');
    expect(relatedSection).toBeTruthy();
    expect(within(relatedSection as HTMLElement).getByText('M-3 · 最高第 1 名 · 2815 分')).toBeTruthy();
    expect(within(relatedSection as HTMLElement).getByText('PJCS 2026 Garchomp Team')).toBeTruthy();
    expect(within(relatedSection as HTMLElement).getByText('VGCPastes')).toBeTruthy();
    expect(within(relatedSection as HTMLElement).queryByText('Unrelated VGCPastes Team')).toBeNull();
  });

  it('shows the latest four teams and browses, filters, searches, sorts, and inspires from the full library', async () => {
    const user = userEvent.setup();
    const onImportSample = vi.fn();
    const eventSample = (
      id: string,
      title: string,
      dateShared: string,
      pokemonId: string,
      replicaCode?: string,
      battleType: EnvironmentTeamSample['battleType'] = 'singles',
    ): EnvironmentTeamSample => ({
      id: `vgcpastes-${id}`,
      dataKind: 'external-snapshot',
      sourceId: 'vgcpastes-champions-ma',
      author: `${title} author`,
      score: 0,
      title,
      battleType,
      reportUrl: `https://example.com/${id}`,
      tournament: 'Champions M-A Cup',
      dateShared,
      replicaCode,
      hasMoves: true,
      hasSpread: Boolean(replicaCode),
      slots: [{ pokemonId, moveIds: [] }],
    });
    const rankedSample: EnvironmentTeamSample = {
      id: 'pokedb-ranked-garchomp',
      dataKind: 'external-snapshot',
      author: 'Ranked author',
      score: 2900,
      rank: 1,
      title: 'Ranked Garchomp',
      battleType: 'singles',
      reportUrl: 'https://example.com/ranked',
      slots: [{ pokemonId: 'garchomp', moveIds: [] }],
    };
    const samples = [
      rankedSample,
      eventSample('alpha', 'Alpha Team', '2026-06-01', 'garchomp'),
      eventSample('bravo', 'Bravo Team', '2026-06-02', 'archaludon', 'BRAVO123'),
      eventSample('charlie', 'Charlie Team', '2026-06-03', 'incineroar'),
      eventSample('delta', 'Delta Team', '2026-06-04', 'garchomp', 'DELTA123'),
      eventSample('echo', 'Echo Team', '2026-06-05', 'archaludon'),
      eventSample('doubles', 'Doubles Team', '2026-06-06', 'garchomp', undefined, 'doubles'),
    ];

    render(<EnvironmentPage environment={makeTeamSampleEnvironment(samples)} onImportSample={onImportSample} />);

    // Exercise the singles upper-build set explicitly (default view is now 双打).
    await user.click(screen.getByRole('button', { name: '单打' }));
    const upperBuildSection = screen.getByText('上位构筑').closest('section');
    expect(upperBuildSection).toBeTruthy();
    expect(
      within(upperBuildSection as HTMLElement)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
        .slice(1),
    ).toEqual(['Echo Team', 'Delta Team', 'Charlie Team', 'Bravo Team']);
    expect(within(upperBuildSection as HTMLElement).queryByText('Alpha Team')).toBeNull();
    expect(screen.queryByRole('button', { name: '换一批' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '查看全部队伍' }));
    expect(await screen.findByRole('heading', { name: '队伍一览' })).toBeTruthy();
    const listedTitles = () =>
      within(screen.getByRole('region', { name: '队伍列表' }))
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent);
    expect(listedTitles()).toEqual(['Echo Team', 'Delta Team', 'Charlie Team', 'Bravo Team', 'Alpha Team', 'Ranked Garchomp']);

    await user.click(screen.getByRole('button', { name: '排位高分' }));
    expect(listedTitles()).toEqual(['Ranked Garchomp']);

    await user.click(screen.getByRole('button', { name: '全部' }));
    await user.click(screen.getByRole('checkbox', { name: '含队伍码' }));
    expect(listedTitles()).toEqual(['Delta Team', 'Bravo Team']);

    await user.click(screen.getByRole('button', { name: '清除筛选' }));
    const search = screen.getByRole('searchbox', { name: '搜索队伍或宝可梦' });
    await user.type(search, 'archaludon');
    expect(listedTitles()).toEqual(['Echo Team', 'Bravo Team']);

    await user.clear(search);
    await user.type(search, 'Delta Team');
    expect(listedTitles()).toEqual(['Delta Team']);
    await user.clear(search);

    await user.selectOptions(screen.getByRole('combobox', { name: '时间排序' }), 'oldest');
    expect(listedTitles()).toEqual(['Alpha Team', 'Bravo Team', 'Charlie Team', 'Delta Team', 'Echo Team', 'Ranked Garchomp']);

    await user.click(screen.getByRole('button', { name: '双打' }));
    expect(listedTitles()).toEqual(['Doubles Team']);
    await user.click(screen.getByRole('button', { name: '单打' }));

    await user.click(screen.getByRole('button', { name: '试试灵感' }));
    const inspirationDialog = await screen.findByRole('dialog', { name: '队伍灵感' });
    expect(within(inspirationDialog).getByRole('button', { name: '导入配置' })).toBeTruthy();
    await user.click(within(inspirationDialog).getByRole('button', { name: '导入配置' }));
    expect(onImportSample).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: '队伍灵感' })).toBeNull();
  });

  it('keeps the team library reachable when only the other battle type has samples', async () => {
    const user = userEvent.setup();
    // Default view is now 双打, so the "other battle type" with samples is singles.
    const singlesSample: EnvironmentTeamSample = {
      id: 'pokedb-singles-only',
      dataKind: 'external-snapshot',
      author: 'Singles author',
      score: 2800,
      rank: 1,
      title: 'Singles Only Team',
      battleType: 'singles',
      reportUrl: 'https://example.com/singles-only',
      slots: [{ pokemonId: 'garchomp', moveIds: [] }],
    };

    render(
      <EnvironmentPage
        environment={makeTeamSampleEnvironment([singlesSample])}
        onImportSample={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '查看全部队伍' }));
    expect(await screen.findByRole('heading', { name: '队伍一览' })).toBeTruthy();
    expect(screen.getByText('0 支队伍')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(screen.getByText('Singles Only Team')).toBeTruthy();
  });

  it('filters the team library by regulation, defaulting to 全部规则 so no view starts empty', async () => {
    const user = userEvent.setup();
    const regulationSample = (
      id: string,
      title: string,
      regulation: EnvironmentTeamSample['regulation'],
      dateShared: string,
    ): EnvironmentTeamSample => ({
      id,
      dataKind: 'external-snapshot',
      sourceId: 'vgcpastes-champions',
      author: `${title} author`,
      score: 0,
      title,
      regulation,
      battleType: 'singles',
      reportUrl: `https://example.com/${id}`,
      dateShared,
      hasMoves: true,
      hasSpread: true,
      slots: [{ pokemonId: 'garchomp', moveIds: [] }],
    });
    const samples = [
      regulationSample('mb-1', 'MB Team One', 'M-B', '2026-06-12'),
      regulationSample('mb-2', 'MB Team Two', 'M-B', '2026-06-11'),
      regulationSample('ma-1', 'MA Team One', 'M-A', '2026-06-10'),
    ];

    render(<EnvironmentPage environment={makeTeamSampleEnvironment(samples)} onImportSample={() => undefined} />);

    // Fixtures are singles samples; switch from the 双打 default so the library is populated.
    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看全部队伍' }));
    const listedTitles = () =>
      within(screen.getByRole('region', { name: '队伍列表' }))
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent);

    // Defaults to 全部规则: every team is visible on entry, so the page is never empty.
    expect(listedTitles()).toEqual(['MB Team One', 'MB Team Two', 'MA Team One']);

    await user.click(screen.getByRole('button', { name: 'M-B' }));
    expect(listedTitles()).toEqual(['MB Team One', 'MB Team Two']);

    await user.click(screen.getByRole('button', { name: 'M-A' }));
    expect(listedTitles()).toEqual(['MA Team One']);

    await user.click(screen.getByRole('button', { name: '全部规则' }));
    expect(listedTitles()).toEqual(['MB Team One', 'MB Team Two', 'MA Team One']);
  });

  it('shows season, timestamps, and freshness on the home and ranking headers', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    expect(screen.getByText('M-2 · 双打')).toBeTruthy();
    expect(screen.getByText(/源更新/)).toBeTruthy();
    expect(screen.getByText(/抓取/)).toBeTruthy();
    expect(screen.queryByText('在线数据')).toBeNull();
    expect(screen.getByText('最新')).toBeTruthy();
    expect(screen.queryByText('可能过期')).toBeNull();
    expect(screen.queryByText('数据源异常')).toBeNull();
    expect(screen.queryByText(/PokeDB/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '查看全部宝可梦' }));

    expect(screen.getByText('M-2 · 双打')).toBeTruthy();
    expect(screen.getByText('最新')).toBeTruthy();
    expect(screen.queryByText('数据源异常')).toBeNull();
    expect(screen.queryByText(/PokeDB/)).toBeNull();
  });

  it('shows stale and degraded environment status without exposing source names', () => {
    const staticEnvironment = {
      ...makeEnvironment('rank-relative'),
      sourceKind: 'static' as const,
      freshness: 'stale' as const,
    };
    const { rerender } = render(
      <EnvironmentPage environment={staticEnvironment} onImportSample={() => undefined} />,
    );

    expect(screen.getByText('M-2 · 双打')).toBeTruthy();
    expect(screen.queryByText('静态缓存')).toBeNull();
    expect(screen.getByText('可能过期')).toBeTruthy();

    rerender(
      <EnvironmentPage
        environment={{
          ...staticEnvironment,
          seasonLabel: '开发样例',
          sourceKind: 'seed',
          sourceStatus: 'degraded',
        }}
        onImportSample={() => undefined}
      />,
    );

    expect(screen.getByText('开发样例 · 双打')).toBeTruthy();
    expect(screen.queryByText('内置样例')).toBeNull();
    expect(screen.getByText('数据源异常')).toBeTruthy();
  });

  it('uses medal ranks without derived ranking values and hides rank-relative teammate percentages', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    const rankingButton = screen.getByRole('button', { name: /烈咬陆鲨/ });
    expect(within(rankingButton).getByLabelText('第 1 名，金牌')).toBeTruthy();
    expect(screen.getByLabelText('第 2 名，银牌')).toBeTruthy();
    expect(screen.getByLabelText('第 3 名，铜牌')).toBeTruthy();
    expect(within(rankingButton).queryByText('排名第 1')).toBeNull();
    expect(within(rankingButton).queryByText('100.0%')).toBeNull();
    expect(screen.queryByText('Tier 1')).toBeNull();

    await user.click(rankingButton);

    expect(screen.getByLabelText('第 1 名，金牌')).toBeTruthy();
    expect(screen.queryByText('排名第 1')).toBeNull();
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('37.7%')).toBeTruthy();
    expect(screen.queryByText('85.7%')).toBeNull();
    expect(screen.queryByText('100.0%')).toBeNull();

    await user.click(screen.getByRole('button', { name: '返回环境' }));
    await user.click(screen.getByRole('button', { name: '查看数据口径' }));

    expect(screen.getByText('来源')).toBeTruthy();
    expect(screen.getByText(/PokeDB 公开统计页（M-2 当季聚合）/)).toBeTruthy();
    expect(screen.getByText('范围')).toBeTruthy();
    expect(screen.getByText('不是全服实时统计')).toBeTruthy();
    expect(screen.getByText('排行')).toBeTruthy();
    expect(screen.getByText(/无总使用率 %，只有名次/)).toBeTruthy();
    expect(screen.getByText('详情')).toBeTruthy();
    expect(screen.getByText(/招式、道具 % 是真实占比；队友仅按搭档排名展示/)).toBeTruthy();
    expect(screen.getByText('构筑')).toBeTruthy();
    expect(screen.getByText(/公开队报链接/)).toBeTruthy();
    expect(screen.queryByText(/M-1/)).toBeNull();
    expect(screen.queryByText(/常见队友的百分比/)).toBeNull();
    expect(screen.queryByText(/54\.0% \/ 285 队/)).toBeNull();

    const singlesSampleCount = screen.getByText('213 队').closest('div');
    expect(singlesSampleCount?.getAttribute('role')).toBeNull();
    expect(singlesSampleCount?.getAttribute('tabindex')).toBeNull();
    expect(singlesSampleCount?.className).toContain('cursor-default');
    expect(screen.queryByRole('button', { name: /213 队/ })).toBeNull();
  });

  it('removes overall usage summaries even when the dataset basis is absolute', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('absolute')} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(screen.queryByText('100.0%')).toBeNull();
    expect(screen.queryByText('213 队')).toBeNull();

    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));

    expect(screen.queryByText('100.0%')).toBeNull();
    expect(screen.queryByText('213 队')).toBeNull();
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('37.7%')).toBeTruthy();
    expect(screen.getByText('85.7%')).toBeTruthy();
  });

  it('groups the complete ranking into four tiers but flattens filtered results', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeTierEnvironment()} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看全部宝可梦' }));

    expect(screen.getByText('Tier 1')).toBeTruthy();
    expect(screen.getByText('Tier 2')).toBeTruthy();
    expect(screen.getByText('Tier 3')).toBeTruthy();
    expect(screen.getByText('Tier 4')).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: '搜索宝可梦' }), pokemon[60].englishName);

    expect(screen.queryByText('Tier 1')).toBeNull();
    expect(screen.queryByText('Tier 2')).toBeNull();
    expect(screen.queryByText('Tier 3')).toBeNull();
    expect(screen.queryByText('Tier 4')).toBeNull();
  });

  it('filters the full ranking by Chinese or English name while preserving the original rank', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看全部宝可梦' }));
    const search = screen.getByRole('searchbox', { name: '搜索宝可梦' });

    await user.type(search, '铝钢桥龙');
    expect(screen.getByRole('button', { name: /铝钢桥龙/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /烈咬陆鲨/ })).toBeNull();

    await user.clear(search);
    await user.type(search, '  InCiNeRoAr  ');
    const incineroarRow = screen.getByRole('button', { name: /炽焰咆哮虎/ });
    expect(within(incineroarRow).getByLabelText('第 3 名，铜牌')).toBeTruthy();
    expect(within(incineroarRow).queryByText('排名第 3')).toBeNull();

    await user.clear(search);
    await user.type(search, '不存在的宝可梦');
    expect(screen.getByText('没有找到匹配的宝可梦')).toBeTruthy();
  });

  it('distinguishes an empty ranking from a search with no matches', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '查看全部宝可梦' }));
    await user.click(screen.getByRole('button', { name: '双打' }));

    expect(screen.getByText('暂无数据')).toBeTruthy();
    expect(screen.queryByText('没有找到匹配的宝可梦')).toBeNull();
  });

  it('shows rank movement against the previous season and explains the 名次 basis', async () => {
    const user = userEvent.setup();
    const environment: EnvironmentState = {
      ...makeEnvironment('rank-relative'),
      previousSeason: {
        season: 'M-1',
        seasonNumber: 1,
        capturedAt: '2026-06-11T00:00:00.000Z',
        // Live singles order is garchomp(1) / archaludon(2) / incineroar(3): garchomp climbs
        // two, archaludon holds, and incineroar is absent from M-1 so it reads as NEW.
        ranks: { singles: { garchomp: 3, archaludon: 2 } },
      },
    };
    render(<EnvironmentPage environment={environment} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(within(screen.getByRole('button', { name: /烈咬陆鲨/ })).getByLabelText('较 M-1 上升 2 名')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /铝钢桥龙/ })).getByLabelText('与 M-1 名次持平')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /炽焰咆哮虎/ })).getByLabelText('M-1 未上榜')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '查看数据口径' }));
    expect(screen.getByText(/相对 M-1 的名次变化，不是使用率变化/)).toBeTruthy();
  });

  it('renders no movement chip at all when there is no previous season to diff against', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    const row = screen.getByRole('button', { name: /烈咬陆鲨/ });
    expect(within(row).queryByLabelText(/名次|未上榜/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '查看数据口径' }));
    expect(screen.queryByText(/名次变化/)).toBeNull();
  });

  it('resets the scroll position to the top when the visible view changes', async () => {
    const user = userEvent.setup();
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    await user.click(screen.getByRole('button', { name: '单打' }));
    // Ignore the scroll triggered by the initial mount; assert on view transitions.
    scrollToSpy.mockClear();

    await user.click(screen.getByRole('button', { name: '查看全部宝可梦' }));
    expect(scrollToSpy).toHaveBeenCalled();

    scrollToSpy.mockClear();
    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));
    expect(scrollToSpy).toHaveBeenCalled();
  });
});
