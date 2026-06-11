// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { EnvironmentState } from '../data/environment';
import { EnvironmentPage } from './EnvironmentPage';

const makeEnvironment = (overallUsageBasis: EnvironmentState['overallUsageBasis']): EnvironmentState => ({
  auditIssues: [],
  updatedAt: '2026-06-10T23:58:00.000+09:00',
  dataStatusLabel: '当季聚合统计',
  overallUsageBasis,
  pokemonUsage: {
    singles: [{
      pokemonId: 'garchomp',
      usageRate: 100,
      teamCount: 213,
      moveIds: ['earthquake'],
      itemIds: ['focus-sash'],
      teammateIds: ['archaludon'],
      moveStats: [{ id: 'earthquake', usageRate: 99.2, teamCount: 211 }],
      itemStats: [{ id: 'focus-sash', usageRate: 37.7, teamCount: 80 }],
      teammateStats: [{ id: 'archaludon', usageRate: 100, teamCount: 213 }],
    }],
    doubles: [],
  },
  sampleTeamCounts: { singles: 213, doubles: 0 },
  teamSamples: [],
  sourceLabel: 'PokeDB · M-2 · 宝可梦使用率统计',
  loadStatus: 'pokedb',
});

afterEach(() => cleanup());

describe('EnvironmentPage usage basis', () => {
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
});
