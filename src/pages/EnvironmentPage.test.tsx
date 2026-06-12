// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentState } from '../data/environment';
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EnvironmentPage usage basis', () => {
  it('shows season, freshness, and timestamps without exposing PokeDB on the home or ranking headers', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    expect(screen.getByText('M-2 · 单打')).toBeTruthy();
    expect(screen.getByText('在线数据')).toBeTruthy();
    expect(screen.getByText('最新')).toBeTruthy();
    expect(screen.getByText(/源更新/)).toBeTruthy();
    expect(screen.getByText(/抓取/)).toBeTruthy();
    expect(screen.queryByText(/PokeDB/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '查看全部' }));

    expect(screen.getByText('M-2 · 单打')).toBeTruthy();
    expect(screen.queryByText(/PokeDB/)).toBeNull();
  });

  it('labels static and seed data sources as stale', () => {
    const staticEnvironment = {
      ...makeEnvironment('rank-relative'),
      sourceKind: 'static' as const,
      freshness: 'stale' as const,
    };
    const { rerender } = render(
      <EnvironmentPage environment={staticEnvironment} onImportSample={() => undefined} />,
    );

    expect(screen.getByText('静态缓存')).toBeTruthy();
    expect(screen.getByText('可能过期')).toBeTruthy();

    rerender(
      <EnvironmentPage
        environment={{
          ...staticEnvironment,
          seasonLabel: '开发样例',
          sourceKind: 'seed',
        }}
        onImportSample={() => undefined}
      />,
    );

    expect(screen.getByText('内置样例')).toBeTruthy();
    expect(screen.getByText('可能过期')).toBeTruthy();
  });

  it('uses medal ranks without derived ranking values and hides rank-relative teammate percentages', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

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

    expect(screen.getByText(/按 PokeDB 公布的使用排名排序/)).toBeTruthy();
    expect(screen.queryByText(/54\.0% \/ 285 队/)).toBeNull();
  });

  it('removes overall usage summaries even when the dataset basis is absolute', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('absolute')} onImportSample={() => undefined} />);

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

    await user.click(screen.getByRole('button', { name: '查看全部' }));

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

    await user.click(screen.getByRole('button', { name: '查看全部' }));
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

    await user.click(screen.getByRole('button', { name: '查看全部' }));
    await user.click(screen.getByRole('button', { name: '双打' }));

    expect(screen.getByText('暂无数据')).toBeTruthy();
    expect(screen.queryByText('没有找到匹配的宝可梦')).toBeNull();
  });

  it('resets the scroll position to the top when the visible view changes', async () => {
    const user = userEvent.setup();
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    // Ignore the scroll triggered by the initial mount; assert on view transitions.
    scrollToSpy.mockClear();

    await user.click(screen.getByRole('button', { name: '查看全部' }));
    expect(scrollToSpy).toHaveBeenCalled();

    scrollToSpy.mockClear();
    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));
    expect(scrollToSpy).toHaveBeenCalled();
  });
});
