// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentDataVersion, currentRuleSet, pokemon } from '../data';
import { environmentFallbackState } from '../data/environment';
import { recordToolResult, type SpeedToolResult } from '../lib/toolActivity';
import type { Team } from '../types';
import { ToolsPage } from './ToolsPage';

const speedBuild: SpeedToolResult['build'] = {
  baseSpeed: 102,
  statPoints: 32,
  nature: 'neutral',
  scarf: false,
  speedAbility: false,
  tailwind: false,
};

const teamLedBy = (pokemonId: string): Team => ({
  id: 'team-tools',
  name: '工具页默认队',
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  notes: '',
  members: [
    {
      id: 'member-lead',
      pokemonId,
      moveIds: [],
      nature: '认真',
      statPoints: { speed: 0 },
      level: 50,
      notes: '',
      legalityStatus: 'legal',
    },
  ],
});

const renderPage = (props: Partial<Parameters<typeof ToolsPage>[0]> = {}) =>
  render(<ToolsPage onOpenDexEntry={vi.fn()} onOpenTool={vi.fn()} {...props} />);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe('ToolsPage', () => {
  it('leaves a tool card bare when that tool has no recorded result', () => {
    renderPage();

    expect(screen.getByText('伤害计算')).toBeTruthy();
    expect(screen.queryByText('上次')).toBeNull();
    expect(screen.queryByText('我的成员')).toBeNull();
    expect(screen.queryByRole('heading', { name: '最近用过' })).toBeNull();
  });

  it('drops the unplanned 对局记录 / 随机一队 entries', () => {
    renderPage();

    expect(screen.queryByText('对局记录')).toBeNull();
    expect(screen.queryByText('随机一队')).toBeNull();
    expect(screen.queryByText('未开放')).toBeNull();
  });

  it('names the newest team lead on the speed card when nothing has been recorded', () => {
    renderPage({ teams: [teamLedBy('garchomp')], environment: environmentFallbackState });

    expect(screen.getByText('烈咬陆鲨')).toBeTruthy();
    expect(screen.queryByText('我的成员')).toBeNull();
  });

  it('falls back to the most-used environment pokemon when there is no team', () => {
    const mostUsed = [...environmentFallbackState.pokemonUsage[currentRuleSet.battleType]].sort(
      (left, right) => right.usageRate - left.usageRate,
    )[0];
    const expected = pokemon.find((entry) => entry.id === mostUsed.pokemonId);
    renderPage({ teams: [], environment: environmentFallbackState });

    expect(screen.getByText(expected!.chineseName)).toBeTruthy();
  });

  it('phrases the last calculator run from the stored numbers', () => {
    recordToolResult({
      tool: 'calculator',
      label: '喷火龙',
      minDamage: 148,
      maxDamage: 176,
      minPercent: 73.6,
      maxPercent: 87.6,
      hko: '确定两击击杀',
    });
    renderPage();

    expect(screen.getByText('上次')).toBeTruthy();
    expect(screen.getByText(/148/)).toBeTruthy();
    expect(screen.getByText('确定两击击杀 · 87.6%')).toBeTruthy();
    expect(screen.getByText('伤害计算 · 进攻方')).toBeTruthy();
  });

  it('shows the speed line result and drops the tier advice when none was recorded', () => {
    recordToolResult({
      tool: 'speed',
      label: '烈咬陆鲨',
      pokemonId: 'garchomp',
      build: speedBuild,
      speed: 154,
      window: [160, 154, 150],
      windowIndex: 1,
    });
    renderPage({ teams: [teamLedBy('staraptor')] });

    // The recorded run wins over the default subject: the card names who it is previewing.
    expect(screen.getAllByText('烈咬陆鲨').length).toBeGreaterThan(0);
    expect(screen.queryByText('姆克鹰')).toBeNull();
    expect(screen.getByText('154')).toBeTruthy();
    expect(screen.queryByText(/档需/)).toBeNull();
    expect(screen.getByText('速度线 · 154')).toBeTruthy();
  });

  it('reads the type chart headline off the recorded type', () => {
    recordToolResult({ tool: 'typeChart', type: 'Fairy' });
    renderPage();

    expect(screen.getByText(/妖精/).textContent?.replace(/\s+/g, ' ')).toContain('妖精 打 格斗 ×2 · 挨 毒 ×2');
  });
});
