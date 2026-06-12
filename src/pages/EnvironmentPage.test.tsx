// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentState } from '../data/environment';
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
        teammateStats: [{ id: 'archaludon', usageRate: 100, teamCount: 213 }],
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

  it('shows rankings instead of derived percentages while preserving real detail percentages', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('rank-relative')} onImportSample={() => undefined} />);

    const rankingButton = screen.getByRole('button', { name: /烈咬陆鲨/ });
    expect(within(rankingButton).getByText('排名第 1')).toBeTruthy();
    expect(within(rankingButton).queryByText('100.0%')).toBeNull();

    await user.click(rankingButton);

    expect(screen.getByText('排名第 1')).toBeTruthy();
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('37.7%')).toBeTruthy();
    expect(screen.queryByText('100.0%')).toBeNull();

    await user.click(screen.getByRole('button', { name: '返回环境' }));
    await user.click(screen.getByRole('button', { name: '查看数据口径' }));

    expect(screen.getByText(/按 PokeDB 公布的使用排名排序/)).toBeTruthy();
    expect(screen.queryByText(/54\.0% \/ 285 队/)).toBeNull();
  });

  it('keeps absolute usage percentages unchanged', async () => {
    const user = userEvent.setup();
    render(<EnvironmentPage environment={makeEnvironment('absolute')} onImportSample={() => undefined} />);

    expect(screen.getByText('100.0%')).toBeTruthy();
    expect(screen.getByText('213 队')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));

    expect(screen.getAllByText('100.0%')).toHaveLength(2);
    expect(screen.getByText('99.2%')).toBeTruthy();
    expect(screen.getByText('37.7%')).toBeTruthy();
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
    expect(within(incineroarRow).getAllByText('3').length).toBeGreaterThan(0);
    expect(within(incineroarRow).getByText('排名第 3')).toBeTruthy();

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
