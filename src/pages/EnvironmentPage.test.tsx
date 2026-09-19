// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentRegulation as catalogRegulation,
  type EnvironmentPokemonUsage,
  type EnvironmentState,
  type EnvironmentTeamSample,
} from '../data/environment';
import { regulationSchedule } from '../data/schedule';
import { currentDataVersion, currentRuleSet } from '../data';
import { pokemon } from '../data/seed/regMA/catalog';
import { repository } from '../lib/db';
import { AppProvider } from '../state/AppContext';
import type { Team, TeamMember } from '../types';
import { CatalogRegulationLagNotice, EnvironmentPage } from './EnvironmentPage';

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

const makeTeamSampleEnvironment = (teamSamples: EnvironmentTeamSample[]): EnvironmentState => ({
  ...makeEnvironment('rank-relative'),
  teamSamples: teamSamples.map((sample) => ({ regulation: 'M-B' as const, ...sample })),
});

const member = (pokemonId: string, patch: Partial<TeamMember> = {}): TeamMember => ({
  id: `member-${pokemonId}`,
  pokemonId,
  moveIds: [],
  nature: '认真',
  statPoints: {},
  level: 50,
  notes: '',
  legalityStatus: 'legal',
  ...patch,
});

const testTeam = (id: string, name: string, members: TeamMember[]): Team => ({
  id,
  name,
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  notes: '',
  members,
});

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('pokemon-champions-assistant');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

const renderEnvironment = (environment: EnvironmentState, onImportSample: (sample: EnvironmentTeamSample) => void = () => undefined) =>
  render(
    <AppProvider>
      <EnvironmentPage environment={environment} onImportSample={onImportSample} />
    </AppProvider>,
  );

const homeRankingSection = () => screen.getByText('使用排行').closest('section') as HTMLElement;
// The hero card is also a button for the rank-1 Pokemon, so home-page row queries are scoped
// to the 使用排行 section.
const homeRow = (name: string) => within(homeRankingSection()).getByRole('button', { name: new RegExp(name) });

beforeEach(async () => {
  // The picker writes real teams, so every test starts from an empty database rather than
  // inheriting whatever the previous one saved.
  await deleteDb();
  window.location.hash = '#/env';
  // The 数据口径 intro sheet (01-06) is shown once per browser; every test but its own starts
  // with it already acknowledged.
  window.localStorage.setItem('luxraykit.env.methodologySeen', '1');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('环境首页', () => {
  it('drops the 你知道吗 banner and the top-three medals', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    expect(screen.queryByLabelText('宝可梦趣味小知识')).toBeNull();
    expect(screen.queryByText('你知道吗？')).toBeNull();

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(screen.queryByLabelText(/金牌|银牌|铜牌/)).toBeNull();
  });

  it('heads the page with the season, regulation and update time, and hides sample counts', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    expect(screen.getByRole('heading', { name: '今日环境' })).toBeTruthy();
    expect(screen.getByText(new RegExp(`M-2 赛季 · ${catalogRegulation} 规则 · .* 更新`))).toBeTruthy();
    expect(screen.queryByText(/213 队/)).toBeNull();
    expect(screen.queryByText(/PokeDB/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(screen.getByRole('button', { name: '查看完整使用排行' }).textContent).toBe('全部 3');
    expect(screen.getByRole('button', { name: /查看 烈咬陆鲨 的环境详情/ })).toBeTruthy();
  });

  it('shows the stale and degraded notices but stays silent when the snapshot is fresh', () => {
    const base = makeEnvironment('rank-relative');
    const { rerender } = renderEnvironment(base);
    expect(screen.queryByText('可能过期')).toBeNull();
    expect(screen.queryByText('数据源异常')).toBeNull();

    rerender(
      <AppProvider>
        <EnvironmentPage environment={{ ...base, freshness: 'stale' }} onImportSample={() => undefined} />
      </AppProvider>,
    );
    expect(screen.getByText('可能过期')).toBeTruthy();

    rerender(
      <AppProvider>
        <EnvironmentPage environment={{ ...base, sourceStatus: 'degraded' }} onImportSample={() => undefined} />
      </AppProvider>,
    );
    expect(screen.getByText('数据源异常')).toBeTruthy();
    expect(screen.queryByText('可能过期')).toBeNull();
  });

  it('shows the 数据口径 sheet once and remembers the acknowledgement', async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem('luxraykit.env.methodologySeen');
    const { unmount } = renderEnvironment(makeEnvironment('rank-relative'));

    const sheet = await screen.findByRole('dialog', { name: '数据口径' });
    expect(within(sheet).getByText('榜单来自上位构筑样本')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: '知道了' }));
    expect(screen.queryByRole('dialog', { name: '数据口径' })).toBeNull();

    unmount();
    renderEnvironment(makeEnvironment('rank-relative'));
    expect(screen.queryByRole('dialog', { name: '数据口径' })).toBeNull();
  });

  it('hands an 上位构筑 teaser card to the import flow instead of being inert', async () => {
    const user = userEvent.setup();
    const onImportSample = vi.fn();
    const environment = makeTeamSampleEnvironment([
      {
        id: 'pokedb-singles-rank-1',
        dataKind: 'external-snapshot',
        author: 'PokeDB author',
        score: 2815,
        rank: 1,
        title: 'すいか',
        battleType: 'singles',
        slots: [{ pokemonId: 'garchomp', moveIds: [] }],
      },
    ]);
    renderEnvironment(environment, onImportSample);

    await user.click(screen.getByRole('button', { name: '单打' }));
    const teasers = screen.getByText('上位构筑').closest('section') as HTMLElement;
    await user.click(within(teasers).getByRole('button', { name: '导入「すいか」' }));

    expect(onImportSample).toHaveBeenCalledWith(expect.objectContaining({ id: 'pokedb-singles-rank-1' }));
  });
});

describe('使用排行', () => {
  it('names the tiers in Chinese and flattens them while searching', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeTierEnvironment());

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看完整使用排行' }));

    expect(screen.getByText('第一梯队')).toBeTruthy();
    expect(screen.getByText('第二梯队')).toBeTruthy();
    expect(screen.getByText('第三梯队')).toBeTruthy();
    expect(screen.queryByText(/^Tier /)).toBeNull();
    // Rank 61 sits past the first page, so the 第四梯队 header only arrives after 继续加载.
    expect(screen.queryByText('第四梯队')).toBeNull();
    await user.click(screen.getByRole('button', { name: /继续加载 · 已显示 60 \/ 61/ }));
    expect(screen.getByText('第四梯队')).toBeTruthy();

    await user.type(screen.getByRole('textbox', { name: '搜索宝可梦' }), pokemon[60].englishName);
    expect(screen.queryByText('第一梯队')).toBeNull();
    expect(screen.queryByText('第三梯队')).toBeNull();
  });

  it('counts search hits and offers a way back from a miss', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看完整使用排行' }));
    const search = screen.getByRole('textbox', { name: '搜索宝可梦' });

    await user.type(search, '铝钢桥龙');
    expect(screen.getByText('「铝钢桥龙」· 1 个结果')).toBeTruthy();
    expect(screen.getByRole('button', { name: /铝钢桥龙/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /烈咬陆鲨/ })).toBeNull();

    await user.clear(search);
    await user.type(search, '  InCiNeRoAr  ');
    expect(within(screen.getByRole('button', { name: /炽焰咆哮虎/ })).getByText('3')).toBeTruthy();

    await user.clear(search);
    await user.type(search, '耿鬼');
    expect(screen.getByText('「耿鬼」· 0 个结果')).toBeTruthy();
    expect(screen.getByText('榜上没有这只')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '显示全部 3 只' }));
    expect(screen.getByRole('button', { name: /烈咬陆鲨/ })).toBeTruthy();
  });

  it('prints rank movement as NEW / ↑n / ↓n / – with the season in the accessible name', async () => {
    const user = userEvent.setup();
    const environment: EnvironmentState = {
      ...makeEnvironment('rank-relative'),
      previousSeason: {
        season: 'M-1',
        seasonNumber: 1,
        capturedAt: '2026-06-11T00:00:00.000Z',
        ranks: { singles: { garchomp: 3, archaludon: 2 } },
      },
    };
    renderEnvironment(environment);

    await user.click(screen.getByRole('button', { name: '单打' }));
    const garchomp = homeRow('烈咬陆鲨');
    expect(within(garchomp).getByLabelText('较 M-1 上升 2 名').textContent).toBe('↑2');
    expect(within(homeRow('铝钢桥龙')).getByLabelText('与 M-1 名次持平').textContent).toBe('–');
    expect(within(homeRow('炽焰咆哮虎')).getByLabelText('M-1 未上榜').textContent).toBe('NEW');
  });

  it('renders no movement cell at all when there is no previous season to diff against', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(within(homeRow('烈咬陆鲨')).queryByLabelText(/名次|未上榜/)).toBeNull();
  });

  it('keeps catalog-missing Pokemon in the ranking as non-clickable placeholders', async () => {
    const user = userEvent.setup();
    const base = makeEnvironment('rank-relative');
    const environment: EnvironmentState = {
      ...base,
      pokemonUsage: {
        // Sentinel sits at rank 2, so 炽焰咆哮虎 must stay at rank 3 rather than moving up.
        singles: [
          base.pokemonUsage.singles[0],
          {
            pokemonId: 'pokedb:9999-00',
            displayName: 'ミライドン',
            unresolved: true,
            usageRate: 99,
            teamCount: 211,
            moveIds: [],
            itemIds: [],
            teammateIds: [],
          },
          base.pokemonUsage.singles[2],
        ],
        doubles: [],
      },
    };
    renderEnvironment(environment);

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(screen.getByText('ミライドン')).toBeTruthy();
    expect(screen.getByText('图鉴待补 · 本机没有它的资料')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ミライドン/ })).toBeNull();
    expect(within(homeRow('炽焰咆哮虎')).getByText('3')).toBeTruthy();
  });

  it('distinguishes an empty ranking from a search with no matches', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '查看完整使用排行' }));
    expect(screen.getByText('暂无数据')).toBeTruthy();
    expect(screen.queryByText('榜上没有这只')).toBeNull();
  });
});

describe('宝可梦详情', () => {
  it('shows real percentages for moves and items but never a teammate number', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));

    expect(await screen.findByText('99.2%')).toBeTruthy();
    expect(screen.getByText('37.7%')).toBeTruthy();
    expect(screen.queryByText('85.7%')).toBeNull();
    expect(screen.queryByText('100.0%')).toBeNull();
    expect(screen.getByText('常见队友')).toBeTruthy();
    expect(screen.getByText('榜单 1 / 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: '按热门配置加入队伍' })).toBeTruthy();
  });

  it('pages through the ranking with the header chevrons', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));
    expect((screen.getByRole('button', { name: '上一名' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: '下一名' }));
    expect(screen.getByRole('heading', { name: '铝钢桥龙' })).toBeTruthy();
    expect(screen.getByText('榜单 2 / 3')).toBeTruthy();
  });

  it('hides the statistics sections and 按热门配置加入队伍 outside the top 60', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeTierEnvironment());

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看完整使用排行' }));
    await user.click(screen.getByRole('button', { name: /继续加载/ }));
    await user.click(screen.getByRole('button', { name: new RegExp(pokemon[60].chineseName) }));

    expect(screen.getByText('榜单 61 / 61')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '按热门配置加入队伍' })).toBeNull();
    expect(screen.queryByText('常用招式')).toBeNull();
  });

  it('lists related upper builds and hands the full list over to 上位构筑', async () => {
    const user = userEvent.setup();
    const samples: EnvironmentTeamSample[] = [
      {
        id: 'pokedb-singles-rank-1',
        dataKind: 'external-snapshot',
        author: 'PokeDB author',
        season: 'M-3',
        score: 2815,
        rank: 1,
        title: 'すいか',
        battleType: 'singles',
        reportUrl: 'https://example.com/pokedb',
        slots: [{ pokemonId: 'garchomp', itemId: 'focus-sash', moveIds: [] }],
      },
      {
        id: 'vgcpastes-other',
        dataKind: 'external-snapshot',
        sourceId: 'vgcpastes-champions-ma',
        author: 'Other author',
        score: 0,
        title: 'Unrelated Team',
        battleType: 'singles',
        reportUrl: 'https://example.com/other',
        slots: [{ pokemonId: 'archaludon', moveIds: [] }],
      },
    ];
    renderEnvironment(makeTeamSampleEnvironment(samples));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));

    const related = screen.getByText('相关上位构筑').closest('section')!;
    expect(within(related).getByText('すいか')).toBeTruthy();
    expect(within(related).getByText('第 1 名 · 2815 分 · 单打')).toBeTruthy();
    expect(within(related).queryByText('Unrelated Team')).toBeNull();

    await user.click(within(related).getByRole('button', { name: '查看全部' }));
    expect(await screen.findByRole('heading', { name: '上位构筑' })).toBeTruthy();
  });

  it('offers a related upper build for import instead of routing to the list', async () => {
    const user = userEvent.setup();
    const onImportSample = vi.fn();
    const samples: EnvironmentTeamSample[] = [
      {
        id: 'pokedb-singles-rank-1',
        dataKind: 'external-snapshot',
        author: 'PokeDB author',
        score: 2815,
        rank: 1,
        title: 'すいか',
        battleType: 'singles',
        slots: [{ pokemonId: 'garchomp', moveIds: [] }],
      },
    ];
    renderEnvironment(makeTeamSampleEnvironment(samples), onImportSample);

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));
    await user.click(await screen.findByRole('button', { name: '导入「すいか」' }));

    expect(onImportSample).toHaveBeenCalledWith(expect.objectContaining({ id: 'pokedb-singles-rank-1' }));
    expect(screen.queryByRole('heading', { name: '上位构筑' })).toBeNull();
  });

  it('walks back down a 常见队友 chain one detail at a time', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));
    expect(await screen.findByRole('heading', { name: '烈咬陆鲨' })).toBeTruthy();

    const teammates = screen.getByText('常见队友').closest('section') as HTMLElement;
    await user.click(within(teammates).getByRole('button', { name: /铝钢桥龙/ }));
    expect(await screen.findByRole('heading', { name: '铝钢桥龙' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(await screen.findByRole('heading', { name: '烈咬陆鲨' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(await screen.findByRole('heading', { name: '今日环境' })).toBeTruthy();
  });

  it('pages with the header chevrons without stacking history entries', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));
    await user.click(await screen.findByRole('button', { name: '下一名' }));
    expect(await screen.findByRole('heading', { name: '铝钢桥龙' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(await screen.findByRole('heading', { name: '今日环境' })).toBeTruthy();
  });
});

describe('SP 分配', () => {
  // `points` is written out of stat order on purpose: the section must print HP → 速度 regardless.
  const makeSpreadEnvironment = (statPointStats: EnvironmentPokemonUsage['statPointStats']): EnvironmentState => {
    const base = makeEnvironment('rank-relative');
    return {
      ...base,
      pokemonUsage: {
        ...base.pokemonUsage,
        singles: [
          { ...base.pokemonUsage.singles[0], ...(statPointStats ? { statPointStats } : {}) },
          ...base.pokemonUsage.singles.slice(1),
        ],
      },
    };
  };

  const spreads: NonNullable<EnvironmentPokemonUsage['statPointStats']> = [
    {
      label: 'AS',
      primaryStatKeys: ['attack', 'speed'],
      points: { speed: 32, attack: 32 },
      hasRemainder: true,
      usageRate: 32.2,
      teamCount: 69,
    },
    {
      label: 'HBD',
      primaryStatKeys: ['hp', 'defense', 'specialDefense'],
      points: { specialDefense: 20, hp: 32, defense: 14 },
      usageRate: 18.6,
      teamCount: 40,
    },
    {
      label: 'BCS',
      primaryStatKeys: ['defense', 'specialAttack', 'speed'],
      points: { defense: 5, specialAttack: 31, speed: 30 },
      usageRate: 4.2,
      teamCount: 9,
    },
    {
      label: 'HA',
      primaryStatKeys: ['hp', 'attack'],
      points: { hp: 32, attack: 32 },
      hasRemainder: true,
      usageRate: 1.1,
      teamCount: 2,
    },
  ];

  const openGarchomp = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));
    expect(await screen.findByRole('heading', { name: '烈咬陆鲨' })).toBeTruthy();
  };

  it('prints the top three spreads in stat order, with the leftover only where PokeDB merged rows', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeSpreadEnvironment(spreads));
    await openGarchomp(user);

    const section = screen.getByText('SP 分配').closest('section') as HTMLElement;
    const rows = within(section).getAllByRole('group');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      '攻击 32、速度 32，余 2 点，使用率 32.2%',
      'HP 32、防御 14、特防 20，使用率 18.6%',
      '防御 5、特攻 31、速度 30，使用率 4.2%',
    ]);
    // A full 66-point row carries no leftover chip at all.
    expect(within(rows[1]).queryByText('余')).toBeNull();
    expect(within(rows[0]).getByText('余')).toBeTruthy();
    expect(within(rows[0]).getByText('点')).toBeTruthy();
    // Upstream's shorthand and team counts stay out of the UI.
    expect(within(section).queryByText('AS')).toBeNull();
    expect(within(section).queryByText(/69/)).toBeNull();
  });

  it('drops the whole section — heading included — when the snapshot carries no spreads', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeSpreadEnvironment(undefined));
    await openGarchomp(user);

    expect(screen.queryByText('SP 分配')).toBeNull();
    expect(screen.getByText('常见队友')).toBeTruthy();
  });

  it('drops the section when the field is present but empty', async () => {
    const user = userEvent.setup();
    renderEnvironment(makeSpreadEnvironment([]));
    await openGarchomp(user);

    expect(screen.queryByText('SP 分配')).toBeNull();
  });
});

describe('按热门配置加入队伍', () => {
  const openGarchompDetail = async (user: ReturnType<typeof userEvent.setup>) => {
    renderEnvironment(makeEnvironment('rank-relative'));
    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(homeRow('烈咬陆鲨'));
    await user.click(await screen.findByRole('button', { name: '按热门配置加入队伍' }));
    return screen.findByRole('dialog', { name: '把烈咬陆鲨加入哪支队伍' });
  };

  it('asks which team to join, writes into the chosen one and says so', async () => {
    const user = userEvent.setup();
    await repository.saveTeam(testTeam('team-a', '主力队', []));
    await repository.saveTeam(testTeam('team-b', '备用队', []));

    const sheet = await openGarchompDetail(user);
    await user.click(within(sheet).getByRole('button', { name: /备用队/ }));

    expect((await screen.findByRole('status')).textContent).toContain('已加入备用队');
    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.teams.find((team) => team.id === 'team-b')!.members).toHaveLength(1);
      expect(state.teams.find((team) => team.id === 'team-a')!.members).toHaveLength(0);
    });
  });

  it('greys out a team that is full or already holds the Pokemon, Mega and form alike', async () => {
    const user = userEvent.setup();
    // A Mega is the same team slot as its base form, so the row must read 已在队伍中.
    await repository.saveTeam(testTeam('team-holds', '已有队', [member('garchomp', { formId: 'mega-garchomp' })]));
    await repository.saveTeam(
      testTeam(
        'team-full',
        '满员队',
        pokemon
          .filter((entry) => entry.nationalDexNo !== 445)
          .slice(0, 6)
          .map((entry) => member(entry.id, { id: `member-${entry.id}` })),
      ),
    );

    const sheet = await openGarchompDetail(user);

    const holds = within(sheet).getByRole('button', { name: /已有队/ }) as HTMLButtonElement;
    expect(holds.disabled).toBe(true);
    expect(holds.textContent).toContain('已在队伍中');
    const full = within(sheet).getByRole('button', { name: /满员队/ }) as HTMLButtonElement;
    expect(full.disabled).toBe(true);
    expect(full.textContent).toContain('已满 6 只');
  });

  it('never silently repeats the same Pokemon: the second visit finds the team greyed out', async () => {
    const user = userEvent.setup();
    await repository.saveTeam(testTeam('team-a', '主力队', []));

    const sheet = await openGarchompDetail(user);
    await user.click(within(sheet).getByRole('button', { name: /主力队/ }));
    await screen.findByRole('status');

    await user.click(screen.getByRole('button', { name: '按热门配置加入队伍' }));
    const reopened = await screen.findByRole('dialog', { name: '把烈咬陆鲨加入哪支队伍' });
    expect((within(reopened).getByRole('button', { name: /主力队/ }) as HTMLButtonElement).disabled).toBe(true);
    const state = await repository.loadState();
    expect(state.teams.find((team) => team.id === 'team-a')!.members).toHaveLength(1);
  });

  it('creates a team and joins it when asked', async () => {
    const user = userEvent.setup();
    await repository.saveTeam(testTeam('team-a', '主力队', []));

    const sheet = await openGarchompDetail(user);
    await user.click(within(sheet).getByRole('button', { name: '新建队伍并加入' }));

    await waitFor(async () => {
      const state = await repository.loadState();
      const created = state.teams.find((team) => team.id !== 'team-a');
      expect(created).toBeTruthy();
      expect(created!.members.map((entry) => entry.pokemonId)).toEqual(['garchomp']);
    });
    expect((await screen.findByRole('status')).textContent).toContain('已加入');
  });

  it('leaves the item blank when a teammate already carries the popular one', async () => {
    const user = userEvent.setup();
    await repository.saveTeam(testTeam('team-a', '主力队', [member('incineroar', { itemId: 'focus-sash' })]));

    const sheet = await openGarchompDetail(user);
    await user.click(within(sheet).getByRole('button', { name: /主力队/ }));

    await waitFor(async () => {
      const state = await repository.loadState();
      const added = state.teams.find((team) => team.id === 'team-a')!.members.find((entry) => entry.pokemonId === 'garchomp');
      expect(added).toBeTruthy();
      expect(added!.itemId).toBeUndefined();
    });
  });
});

describe('数据口径页', () => {
  it('states the rank-only basis, the 60-rank detail cut-off and the source', async () => {
    const user = userEvent.setup();
    const environment: EnvironmentState = {
      ...makeEnvironment('rank-relative'),
      sourceStatus: 'degraded',
    };
    renderEnvironment(environment);

    await user.click(screen.getByRole('button', { name: '看数据口径' }));

    expect(screen.getByRole('heading', { name: '数据口径' })).toBeTruthy();
    expect(screen.getByText('PokeDB 公开的上位构筑样本。')).toBeTruthy();
    expect(screen.getByText('榜单只给名次和名次变化，不给登场率百分比。')).toBeTruthy();
    expect(screen.getByText('前 60 名有招式、道具、特性、性格的使用率，60 名之外不出统计段。')).toBeTruthy();
    expect(screen.getByText('这不是官方使用率')).toBeTruthy();
    // No previous season in this fixture: the 变动 row must not be invented.
    expect(screen.queryByText(/NEW \/ ↑n/)).toBeNull();
  });
});

describe('上位构筑', () => {
  const sample = (
    id: string,
    title: string,
    overrides: Partial<EnvironmentTeamSample> = {},
  ): EnvironmentTeamSample => ({
    id,
    dataKind: 'external-snapshot',
    author: `${title} author`,
    score: 2700,
    rank: 1,
    title,
    battleType: 'singles',
    reportUrl: `https://example.com/${id}`,
    slots: [{ pokemonId: 'garchomp', moveIds: [] }],
    ...overrides,
  });

  const listedTitles = () =>
    within(screen.getByRole('region', { name: '上位构筑列表' }))
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);

  it('shows the four-block card and filters by what a sample carries', async () => {
    const user = userEvent.setup();
    const samples = [
      sample('a', 'Alpha', { rank: 1, score: 2724, hasMoves: true, hasSpread: true, replicaCode: 'AAA' }),
      sample('b', 'Bravo', { rank: 2, score: 2681, hasMoves: true }),
      sample('c', 'Charlie', { rank: 3, score: 2664 }),
    ];
    renderEnvironment(makeTeamSampleEnvironment(samples));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看全部上位构筑' }));

    expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(screen.getByText('2724 分')).toBeTruthy();
    expect(screen.getByText('第 1 名 · 单打 · M-B')).toBeTruthy();
    // Dropped with the redesign: source badge, 队报 button and the 可导入 chips.
    expect(screen.queryByText('PokeDB 环境榜')).toBeNull();
    expect(screen.queryByRole('button', { name: '队报链接' })).toBeNull();
    expect(screen.queryByLabelText(/可导入/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '带配招 2' }));
    expect(listedTitles()).toEqual(['Alpha', 'Bravo']);

    await user.click(screen.getByRole('button', { name: '有队伍码 1' }));
    expect(listedTitles()).toEqual(['Alpha']);

    await user.click(screen.getByRole('button', { name: '全部 3' }));
    expect(listedTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('explains an empty filter combination and offers a way out', async () => {
    const user = userEvent.setup();
    const samples = [sample('a', 'Alpha', { hasMoves: true }), sample('b', 'Bravo', { replicaCode: 'BBB' })];
    renderEnvironment(makeTeamSampleEnvironment(samples));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看全部上位构筑' }));
    await user.click(screen.getByRole('button', { name: '带配招 1' }));
    await user.click(screen.getByRole('button', { name: '有队伍码 1' }));

    expect(screen.getByText('这一季没有同时满足的样本')).toBeTruthy();
    expect(screen.getByText(/去掉「带配招」还有 1 支/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '重置筛选' }));
    expect(listedTitles()).toEqual(['Alpha', 'Bravo']);
  });

  it('draws a random team and imports it from the dialog', async () => {
    const user = userEvent.setup();
    const onImportSample = vi.fn();
    renderEnvironment(makeTeamSampleEnvironment([sample('a', 'Alpha')]), onImportSample);

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看全部上位构筑' }));
    await user.click(screen.getByRole('button', { name: '随机一队' }));

    const dialog = await screen.findByRole('dialog', { name: '随机一队' });
    await user.click(within(dialog).getByRole('button', { name: '导入为我的队伍' }));
    expect(onImportSample).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: '随机一队' })).toBeNull();
  });

  it('searches by team name and by Pokemon', async () => {
    const user = userEvent.setup();
    const samples = [
      sample('a', 'Alpha'),
      sample('b', 'Bravo', { slots: [{ pokemonId: 'archaludon', moveIds: [] }] }),
    ];
    renderEnvironment(makeTeamSampleEnvironment(samples));

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(screen.getByRole('button', { name: '查看全部上位构筑' }));
    const search = screen.getByRole('textbox', { name: '搜索队伍或宝可梦' });

    await user.type(search, 'archaludon');
    expect(listedTitles()).toEqual(['Bravo']);

    await user.clear(search);
    await user.type(search, 'Alpha');
    expect(listedTitles()).toEqual(['Alpha']);
  });
});

describe('CatalogRegulationLagNotice', () => {
  it('flags a catalog that lags the regulation schedule, and stays silent when they agree', () => {
    // Both regulation labels are derived: this asserts the mechanism, not a hard-coded M-C.
    const scheduleAheadOfCatalog = regulationSchedule.find((entry) => entry.id !== catalogRegulation);
    expect(scheduleAheadOfCatalog).toBeTruthy();

    render(<CatalogRegulationLagNotice now={new Date(scheduleAheadOfCatalog!.startAt)} />);
    expect(screen.getByRole('status').textContent).toContain(`规则已切换到 ${scheduleAheadOfCatalog!.id}`);
    expect(screen.getByRole('status').textContent).toContain(catalogRegulation);
    cleanup();

    const catalogWindow = regulationSchedule.find((entry) => entry.id === catalogRegulation);
    render(<CatalogRegulationLagNotice now={new Date(catalogWindow!.startAt)} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('scroll handling', () => {
  it('resets the scroll position to the top when the visible view changes', async () => {
    const user = userEvent.setup();
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderEnvironment(makeEnvironment('rank-relative'));

    await user.click(screen.getByRole('button', { name: '单打' }));
    scrollToSpy.mockClear();

    await user.click(screen.getByRole('button', { name: '查看完整使用排行' }));
    expect(scrollToSpy).toHaveBeenCalled();

    scrollToSpy.mockClear();
    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));
    expect(scrollToSpy).toHaveBeenCalled();
  });
});
