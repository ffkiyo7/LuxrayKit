// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
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

/** Both square cards draw sprites, so every card assertion is scoped to its own card. */
const card = (title: string) => within(screen.getByText(title).closest('button')!);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe('ToolsPage', () => {
  it('shows a worked example on every card when no tool has been run', () => {
    renderPage();

    expect(screen.getByText('伤害计算')).toBeTruthy();
    expect(screen.queryByText('上次')).toBeNull();
    expect(screen.getAllByText('示例').length).toBe(3);
    // The frozen damage sample, rounded to whole percent (91.8–109.4 → 92–109).
    expect(screen.getByText(/92/).textContent?.replace(/\s+/g, '')).toBe('92–109%');
    expect(screen.getByText('地震')).toBeTruthy();
    expect(screen.getByText('未分配 SP')).toBeTruthy();
    expect(screen.queryByText('我的成员')).toBeNull();
  });

  it('keeps the 最近用过 heading standing with nothing under it', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '最近用过' })).toBeTruthy();
    expect(screen.queryByText('伤害计算 · 进攻方')).toBeNull();
  });

  it('drops the unplanned 对局记录 / 随机一队 entries', () => {
    renderPage();

    expect(screen.queryByText('对局记录')).toBeNull();
    expect(screen.queryByText('随机一队')).toBeNull();
    expect(screen.queryByText('未开放')).toBeNull();
  });

  it('previews the newest team lead on the speed card when nothing has been recorded', () => {
    renderPage({ teams: [teamLedBy('garchomp')], environment: environmentFallbackState });

    expect(card('速度线').getByAltText('烈咬陆鲨')).toBeTruthy();
    // 0 SP, neutral nature: floor(102 + 0 + 20).
    expect(card('速度线').getByText('122')).toBeTruthy();
    expect(screen.queryByText('我的成员')).toBeNull();
  });

  it('falls back to the most-used environment pokemon when there is no team', () => {
    const mostUsed = [...environmentFallbackState.pokemonUsage[currentRuleSet.battleType]].sort(
      (left, right) => right.usageRate - left.usageRate,
    )[0];
    const expected = pokemon.find((entry) => entry.id === mostUsed.pokemonId);
    renderPage({ teams: [], environment: environmentFallbackState });

    expect(card('速度线').getByAltText(expected!.chineseName)).toBeTruthy();
  });

  it('redraws the last calculator run as a percent range and a matchup line', () => {
    recordToolResult({
      tool: 'calculator',
      label: '喷火龙',
      moveLabel: '大字爆炎',
      defenderLabel: '钢铠鸦',
      minDamage: 148,
      maxDamage: 176,
      minPercent: 73.6,
      maxPercent: 87.6,
      hko: '确定两击击杀',
    });
    renderPage();

    expect(screen.getByText('上次')).toBeTruthy();
    expect(screen.getByText(/74/).textContent?.replace(/\s+/g, '')).toBe('74–88%');
    expect(screen.getByText('大字爆炎')).toBeTruthy();
    // The long HKO sentence is gone; the sample matchup is replaced by the recorded one.
    expect(screen.queryByText(/确定两击击杀/)).toBeNull();
    expect(screen.queryByText('地震')).toBeNull();
    expect(screen.getByText('伤害计算 · 进攻方')).toBeTruthy();
  });

  it('shows the speed line result and drops the tier advice when none was recorded', () => {
    recordToolResult({
      tool: 'speed',
      label: '烈咬陆鲨',
      iconRef: '/assets/pokemon/thumbs/445.png',
      pokemonId: 'garchomp',
      build: speedBuild,
      speed: 154,
      window: [160, 154, 150],
      windowIndex: 1,
    });
    renderPage({ teams: [teamLedBy('staraptor')] });

    // The recorded run wins over the default subject: the card previews who it is about.
    expect(card('速度线').getByAltText('烈咬陆鲨')).toBeTruthy();
    expect(screen.queryByAltText('姆克鹰')).toBeNull();
    expect(card('速度线').getByText('154')).toBeTruthy();
    expect(screen.queryByText(/档需/)).toBeNull();
    expect(screen.getByText('速度线 · 154')).toBeTruthy();
  });

  it('reads both type chart matchups off the recorded type', () => {
    recordToolResult({ tool: 'typeChart', type: 'Fairy' });
    renderPage();

    const typeCard = card('属性速查');
    expect(typeCard.getByText('上次')).toBeTruthy();
    // The labels are bare text nodes between the dots and the arrow, so read the whole line.
    const line = typeCard.getByText('上次').nextElementSibling;
    expect(line?.textContent?.replace(/\s+/g, '')).toBe('妖精攻击格斗×2毒攻击妖精×2');
  });
});
