// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import singleRankedTeams from './data/external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from './data/external/pokedb/s1_double_ranked_teams.json';
import moveStats from './data/external/pokedb/s1_move_stats.json';
import teamSamples from './data/external/pokedb/s1_team_samples.json';
import vgcPastesSamples from './data/external/vgcpastes/reg_ma_champions_ma_team_samples.json';
import {
  createEnvironmentStateFromPokeDbSnapshot,
  getEnvironmentMove,
  getEnvironmentPokemon,
} from './data/environment';
import { currentDataVersion, currentRuleNatureOptions, currentRuleSet, pokemon } from './data';
import { repository } from './lib/db';
import type { Team, TeamMember } from './types';
import { sortTeamSamplesByDate } from './pages/environmentTeamSamples';

const DB_NAME = 'pokemon-champions-assistant';
const pokedbSnapshot = {
  retrievedAt: '2026-06-05T06:34:02.661Z',
  battles: {
    singles: singleRankedTeams,
    doubles: doubleRankedTeams,
  },
  moveStats,
  teamSamples,
};
const testEnvironmentState = createEnvironmentStateFromPokeDbSnapshot(pokedbSnapshot);
const vgcPastesTeamSamples = vgcPastesSamples as typeof testEnvironmentState.teamSamples;
const basicPokeDbSample = testEnvironmentState.teamSamples.find((sample) => sample.id === 'pokedb-singles-rank-1')!;
const topSinglesPokemon = getEnvironmentPokemon(testEnvironmentState.pokemonUsage.singles[0].pokemonId)!;
const topSinglesMove = getEnvironmentMove(testEnvironmentState.pokemonUsage.singles[0].moveStats?.[0]?.id ?? '')!;
const relatedGarchompSample = testEnvironmentState.teamSamples.find(
  (sample) => sample.battleType === 'singles' && sample.slots.some((slot) => slot.pokemonId === 'garchomp'),
)!;
const relatedGarchompTeamLabel = `队伍：${relatedGarchompSample.title}`;
const testTeam = (name: string, members: TeamMember[]): Team => ({
  id: `team-${name}`,
  name,
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  notes: '',
  members,
});

const garchompMember = (patch: Partial<TeamMember> = {}): TeamMember => ({
  id: 'member-garchomp-test',
  pokemonId: 'garchomp',
  formId: 'garchomp',
  abilityId: 'rough-skin',
  itemId: 'magnet',
  moveIds: ['earthquake', 'protect'],
  nature: '爽朗',
  statPoints: { attack: 32, speed: 32, hp: 1 },
  level: 50,
  notes: '',
  legalityStatus: 'legal',
  ...patch,
});

const incineroarMember = (patch: Partial<TeamMember> = {}): TeamMember => ({
  id: 'member-incineroar-test',
  pokemonId: 'incineroar',
  formId: 'incineroar',
  abilityId: 'intimidate',
  itemId: 'magnet',
  moveIds: ['flare-blitz', 'protect'],
  nature: '固执',
  statPoints: { hp: 1 },
  level: 50,
  notes: '',
  legalityStatus: 'legal',
  ...patch,
});

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

const installVisualViewport = (height: number, offsetTop = 0) => {
  const viewport = {
    width: 390,
    height,
    offsetLeft: 0,
    offsetTop,
    pageLeft: 0,
    pageTop: offsetTop,
    scale: 1,
    onresize: null,
    onscroll: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as VisualViewport;
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 844);
};

const renderApp = async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: '环境' });
  await user.click(screen.getByRole('button', { name: '队伍' }));
  await screen.findByText('我的队伍');
  return user;
};

const renderEnvironmentApp = async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText(`${testEnvironmentState.seasonLabel} · 单打`);
  return user;
};

const continueFirstImportNotice = async (user: ReturnType<typeof userEvent.setup>) => {
  const dialog = await screen.findByRole('dialog', { name: '导入配置提示' });
  expect(dialog.textContent).toContain('这份样本可带入Pokémon、道具');
  expect(dialog.textContent).toContain('未公开的SP分配、配招、队伍码需要手动确认');
  expect(dialog.textContent).toContain('队报链接');
  await user.click(within(dialog).getByRole('button', { name: '继续导入' }));
};

const findSampleForImportButton = (button: HTMLElement) => {
  const card = button.closest('section') as HTMLElement | null;
  const sample = card ? testEnvironmentState.teamSamples.find((candidate) => within(card).queryByText(candidate.title)) : undefined;
  if (!sample) throw new Error('Unable to resolve visible environment sample for import button.');
  return sample;
};

const revealEnvironmentSample = async (user: ReturnType<typeof userEvent.setup>, sample: typeof testEnvironmentState.teamSamples[number]) => {
  await user.click(await screen.findByRole('button', { name: '查看全部队伍' }));
  // The library defaults to 全部规则; click it explicitly so M-A samples are visible regardless.
  await user.click(screen.getByRole('button', { name: '全部规则' }));
  if (sample.battleType === 'doubles') {
    await user.click(screen.getByRole('button', { name: '双打' }));
  } else {
    await user.click(screen.getByRole('button', { name: '单打' }));
  }
  await user.type(screen.getByRole('searchbox', { name: '搜索队伍或宝可梦' }), sample.title);
  const title = await screen.findByText(sample.title);
  return title.closest('section') as HTMLElement;
};

const revealVisibleReplicaCodeSample = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: '查看全部队伍' }));
  // The library defaults to 全部规则; click it explicitly so M-A samples are visible regardless.
  await user.click(screen.getByRole('button', { name: '全部规则' }));
  await user.click(screen.getByRole('button', { name: '双打' }));
  await user.click(screen.getByRole('checkbox', { name: '含队伍码' }));

  const chips = await screen.findAllByLabelText('可导入 队伍码');
  for (const chip of chips) {
    const card = chip.closest('section') as HTMLElement | null;
    const sample = card ? vgcPastesTeamSamples.find((candidate) => within(card).queryByText(candidate.title)) : undefined;
    if (card && sample?.replicaCode) return { card, sample };
  }

  throw new Error('Unable to reveal a VGCPastes sample with replica code.');
};

const openTool = async (user: ReturnType<typeof userEvent.setup>, toolName: string | RegExp) => {
  const backToTools = screen.queryByRole('button', { name: /返回工具/ });
  if (backToTools) {
    await user.click(backToTools);
  } else {
    await user.click(screen.getByRole('button', { name: '工具' }));
  }
  await user.click(await screen.findByRole('button', { name: toolName }));
};

const pickCalculatorPokemon = async (
  user: ReturnType<typeof userEvent.setup>,
  side: 'attacker' | 'defender',
  query: string,
  label: string,
) => {
  await user.click(screen.getByRole('button', { name: side === 'attacker' ? /选择进攻方/ : /选择防守方/ }));
  const search = screen.getByPlaceholderText('搜索名称');
  await user.clear(search);
  await user.type(search, query);
  const option = (await screen.findAllByText(label)).map((element) => element.closest('button')).find(Boolean);
  if (!option) throw new Error(`Unable to find calculator Pokemon option: ${label}`);
  await user.click(option);
};

const selectCalculatorPair = async (user: ReturnType<typeof userEvent.setup>) => {
  await pickCalculatorPokemon(user, 'attacker', 'Garchomp', '烈咬陆鲨');
  await pickCalculatorPokemon(user, 'defender', 'Torkoal', '煤炭龟');
};

const waitForDexPage = () => screen.findByText('规则内图鉴', undefined, { timeout: 5000 });

const openDefaultTeam = async (user: ReturnType<typeof userEvent.setup>) => {
  const teamCard = await screen.findByLabelText('队伍：Luxray test');
  await user.click(teamCard);
  await screen.findByRole('heading', { name: 'Luxray test' });
  const easterEgg = screen.queryByRole('dialog', { name: 'Luxray test 彩蛋' });
  if (easterEgg) {
    await user.click(within(easterEgg).getByRole('button', { name: '继续编辑' }));
  }
};

describe('App page flows', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(pokedbSnapshot), { status: 200 })),
    );
    // Pin the team-sample shuffle seed (Task 4) so re-entering the环境 page does not
    // re-randomize order between renders. Without this, the import-coverage flow could
    // import the same sample twice across remounts and collide on `队伍：<title>` labels.
    // Only getRandomValues is stubbed; createId relies on randomUUID and stays unique.
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array) new Uint32Array(array.buffer, array.byteOffset, 1)[0] = 0x1234abcd;
      return array;
    });
    await deleteDb();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('labels the loading state as local rule data instead of mock data', async () => {
    render(<App />);

    expect(screen.getByText('正在载入本地缓存与规则数据...')).toBeTruthy();
    expect(screen.queryByText(/模拟数据/)).toBeNull();
    expect(await screen.findByRole('heading', { name: '环境' })).toBeTruthy();
    expect(screen.getByText('LuxrayKit')).toBeTruthy();
    expect(screen.getByText('Season M-3 · Regulation M-B')).toBeTruthy();
    expect(screen.queryByText(/移动端 PWA/)).toBeNull();
  });

  it('navigates bottom tabs and keeps the teams tab focused on local teams', { timeout: 15000 }, async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByRole('heading', { name: '伤害计算' })).toBeTruthy();

    await openTool(user, /规则图鉴/);
    expect(await waitForDexPage()).toBeTruthy();
    expect(await screen.findByText('Pokémon / 招式 / 道具 / 特性 · 当前规则数据')).toBeTruthy();
    expect(screen.queryByText(/当前规则模拟数据/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '队伍' }));
    expect(await screen.findByText('我的队伍')).toBeTruthy();
    expect(screen.queryByText('本地缓存可用')).toBeNull();
    expect(screen.queryByText('Regulation Set M-B')).toBeNull();
    expect(screen.queryByText('当前赛季')).toBeNull();
    expect(screen.queryByText('官方数据源状态可追溯')).toBeNull();
  });

  it('keeps the tools landing page as three equal entries without explanatory notes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: '环境' });

    await user.click(screen.getByRole('button', { name: '工具' }));

    expect(await screen.findByRole('heading', { name: '工具' })).toBeTruthy();
    const toolButtons = screen.getAllByRole('button').filter((button) =>
      /规则图鉴|伤害计算|速度线计算/.test(button.textContent ?? ''),
    );
    expect(toolButtons.map((button) => button.textContent?.replace(/\s+/g, ''))).toEqual([
      '规则图鉴当前规则内的宝可梦、招式、道具、特性。',
      '伤害计算攻防双方、招式、天气与伤害区间。',
      '速度线计算对照环境档位，反解超速所需配置。',
    ]);
    expect(await screen.findByRole('button', { name: /伤害计算/ })).toBeTruthy();
    const speedTool = await screen.findByRole('button', { name: /速度线计算/ });
    expect((speedTool as HTMLButtonElement).disabled).toBe(false);
    expect(await screen.findByRole('button', { name: /规则图鉴/ })).toBeTruthy();
    expect(screen.queryByText(/三个入口并列|从本地队伍带入配置|队伍配置带入/)).toBeNull();
    expect(screen.queryByText(/天气、场地/)).toBeNull();
    expect(screen.queryByRole('button', { name: '当前规则' })).toBeNull();
  });

  it('toggles the app theme from the settings page', async () => {
    const user = await renderApp();

    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: '我的' }));
    await user.click(await screen.findByRole('button', { name: '切换深色和浅色主题' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(await screen.findByText('浅色工具界面')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '切换深色和浅色主题' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await screen.findByText('深色工具界面')).toBeTruthy();
  });

  it('keeps the profile page focused on local preferences and backup rather than rule navigation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: '环境' });

    await user.click(screen.getByRole('button', { name: '我的' }));

    expect(await screen.findByRole('heading', { name: '我的' })).toBeTruthy();
    expect(screen.getByText('主题')).toBeTruthy();
    expect(screen.getByRole('button', { name: /导出备份/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /导入备份/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /清除本地数据/ })).toBeTruthy();
    expect(screen.queryByText('当前规则')).toBeNull();
    expect(screen.queryByRole('button', { name: /当前赛季|规则详情/ })).toBeNull();
    expect(screen.queryByText(/本地队伍\s+\d|收藏\s+\d/)).toBeNull();
  });

  it('creates and switches teams, then expands and collapses a member card', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: /新建/ }));
    const nameInput = screen.getByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, '测试队');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(await screen.findByRole('heading', { name: '测试队' })).toBeTruthy();
    expect(await screen.findByText(/0\/6 成员/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    await openDefaultTeam(user);
    expect(await screen.findByText(/1\/6 成员/)).toBeTruthy();

    await user.click(screen.getByText('伦琴猫'));
    expect(await screen.findByText('能力值 / SP')).toBeTruthy();
    await user.click(screen.getByTitle('编辑成员'));
    expect(await screen.findByText('编辑成员')).toBeTruthy();
    await user.click(screen.getByTitle('关闭'));

    await user.click(screen.getByTitle('收起成员'));
    expect(screen.queryByText('能力值 / SP')).toBeNull();
  });

  it('initializes manually added team members with editable blank defaults', async () => {
    const user = await renderApp();
    await openDefaultTeam(user);

    await user.click(screen.getByRole('button', { name: /添加 Pokémon/ }));
    await user.type(await screen.findByPlaceholderText('搜索 Pokémon 名称...'), 'Garchomp');
    await user.click(await screen.findByText('烈咬陆鲨'));

    await waitFor(async () => {
      const state = await repository.loadState();
      const team = state.teams.find((candidate) => candidate.name === 'Luxray test');
      expect(team?.members.some((member) => member.pokemonId === 'garchomp')).toBe(true);
    });

    const state = await repository.loadState();
    const team = state.teams.find((candidate) => candidate.name === 'Luxray test')!;
    const added = team.members.find((member) => member.pokemonId === 'garchomp')!;
    const garchomp = pokemon.find((entry) => entry.id === 'garchomp')!;
    const neutralNature = currentRuleNatureOptions.find((option) => option.neutral)?.id ?? '认真';

    expect(added.formId).toBe('garchomp');
    expect(added.abilityId).toBe(garchomp.abilities[0]);
    expect(added.itemId).toBeUndefined();
    expect(added.moveIds).toEqual([]);
    expect(added.nature).toBe(neutralNature);
    expect(added.statPoints).toEqual({
      hp: 0,
      attack: 0,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 0,
    });

    expect(screen.getByText(/2\/6 成员/)).toBeTruthy();
  });

  it('keeps member editing focused on the selected Pokemon, moves, nature, item, ability, and six SP fields', { timeout: 15000 }, async () => {
    const user = await renderApp();
    await openDefaultTeam(user);

    await user.click(screen.getByText('伦琴猫'));
    await user.click(screen.getByTitle('编辑成员'));

    expect(await screen.findByText('编辑成员')).toBeTruthy();
    expect(screen.queryByLabelText('Pokemon')).toBeNull();
    expect(screen.queryByText('等级')).toBeNull();
    expect(screen.queryByText('备注')).toBeNull();
    const itemSearch = screen.getByPlaceholderText('搜索携带物');
    await user.type(itemSearch, '磁铁');
    expect(screen.getAllByRole('button', { name: /磁铁/ }).length).toBeGreaterThan(0);
    await user.clear(itemSearch);
    await user.type(itemSearch, '突击背心');
    expect(screen.queryByRole('button', { name: /突击背心/ })).toBeNull();
    await user.clear(itemSearch);
    await user.type(itemSearch, '清净坠饰');
    expect(screen.queryByRole('button', { name: /清净坠饰/ })).toBeNull();
    await user.clear(itemSearch);
    expect(screen.queryByLabelText('形态预览')).toBeNull();
    const moveSearch = screen.getAllByPlaceholderText('搜索招式')[0];
    await user.type(moveSearch, '雷电牙');
    await user.click(screen.getAllByRole('button', { name: /雷电牙/ })[0]);
    expect(screen.getByRole('button', { name: /招式 3.*雷电牙/ })).toBeTruthy();

    ['HP SP', '攻击 SP', '防御 SP', '特攻 SP', '特防 SP', '速度 SP'].forEach((label) => {
      expect(screen.getAllByText(label.replace(' SP', '')).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('已用 65/66')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /速度\s*32/ }));
    expect(screen.getByText('速度 SP')).toBeTruthy();
    expect(screen.getByRole('slider', { name: '速度 SP' }).getAttribute('max')).toBe('32');
    expect(screen.getByRole('button', { name: 'min' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'max' })).toBeTruthy();
  });

  it('deletes a compact team member directly from the team grid', async () => {
    const user = await renderApp();
    await openDefaultTeam(user);

    expect(await screen.findByText(/1\/6 成员/)).toBeTruthy();
    await user.click(screen.getAllByTitle('删除成员')[0]);
    expect(await screen.findByText(/0\/6 成员/)).toBeTruthy();
  });

  it('creates a team after all teams have been deleted', async () => {
    installVisualViewport(500, 20);
    const user = await renderApp();
    await openDefaultTeam(user);

    await user.click(screen.getByTitle('删除队伍'));
    const confirmDialog = await screen.findByRole('dialog', { name: '确认删除队伍' });
    await user.click(within(confirmDialog).getByRole('button', { name: '确认删除' }));
    expect(await screen.findByText('还没有队伍')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '新建第一支队伍' }));
    const nameInput = screen.getByRole('textbox') as HTMLInputElement;
    expect(nameInput.value).toBe('队伍1');
    const nameSheet = nameInput.parentElement as HTMLElement;
    expect(nameSheet.style.bottom).toBe('324px');
    expect(nameSheet.style.maxHeight).toBe('460px');
    expect(nameSheet.className).toContain('overflow-y-auto');
    await user.click(screen.getByRole('button', { name: '确认' }));

    expect(await screen.findByText('队伍1')).toBeTruthy();
    expect(screen.getByText(/0\/6 成员/)).toBeTruthy();
  });

  it('opens team detail from the list, renames inline, and keeps delete at the bottom of detail', async () => {
    const user = await renderApp();

    expect(screen.getByRole('heading', { name: '我的队伍' })).toBeTruthy();
    expect(screen.queryByTitle('删除队伍')).toBeNull();

    await openDefaultTeam(user);
    expect(screen.getByRole('button', { name: '返回队伍列表' })).toBeTruthy();
    expect(screen.queryByTitle('编辑名称')).toBeNull();
    expect(screen.getByTitle('删除队伍')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '展开队伍分析' })).toBeNull();
    expect(screen.queryByText('配队分析详情')).toBeNull();

    await user.click(screen.getByTitle('编辑队伍名称'));
    const nameInput = screen.getByLabelText('队伍名称');
    await user.clear(nameInput);
    await user.type(nameInput, '雨天试验队{enter}');
    expect(await screen.findByRole('heading', { name: '雨天试验队' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    expect(await screen.findByLabelText('队伍：雨天试验队')).toBeTruthy();
  });

  it('opens team detail from the list card or compact edit icon without image actions', async () => {
    const user = await renderApp();

    const teamCard = await screen.findByLabelText('队伍：Luxray test');
    expect(within(teamCard).getByRole('button', { name: '编辑 Luxray test' })).toBeTruthy();
    expect(within(teamCard).getByText('Luxray test').parentElement?.parentElement?.classList.contains('pr-14')).toBe(true);
    expect(within(teamCard).queryByRole('button', { name: '编辑配置' })).toBeNull();
    expect(within(teamCard).queryByRole('button', { name: '生成图片' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '队伍分享图' })).toBeNull();

    await user.click(within(teamCard).getByRole('button', { name: '编辑 Luxray test' }));
    expect(await screen.findByRole('heading', { name: 'Luxray test' })).toBeTruthy();
  });

  it('scopes member editor validation to SP limits and duplicate held items', { timeout: 15000 }, async () => {
    await repository.replaceTeams([
      testTeam('重复道具测试队', [garchompMember(), incineroarMember()]),
    ]);
    const user = await renderApp();

    await user.click(await screen.findByLabelText('队伍：重复道具测试队'));
    expect(await screen.findByRole('heading', { name: '重复道具测试队' })).toBeTruthy();
    await user.click(screen.getByText('烈咬陆鲨'));
    await user.click(screen.getByTitle('编辑成员'));

    expect(await screen.findByText('编辑成员')).toBeTruthy();
    expect(screen.queryByText('校验结果')).toBeNull();
    expect(screen.queryByText('合法')).toBeNull();
    expect(screen.queryByText(/数据版本/)).toBeNull();
    expect(screen.queryByText(/当前字段未发现问题|需要完成 Reg M-B 复核/)).toBeNull();
    expect(screen.getByText('当前规则不允许同队重复携带相同道具。')).toBeTruthy();
    expect(screen.getByText('已用 65/66')).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getAllByRole('button', { name: /HP\s*1/ }).at(-1)!);
    fireEvent.change(screen.getByRole('slider', { name: 'HP SP' }), { target: { value: '3' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));

    expect(screen.getByText('已用 67/66')).toBeTruthy();
    expect(screen.getByText('单项最多 32，总量最多 66。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves non-SP non-duplicate legality issues silently while keeping legalityStatus updated', async () => {
    await repository.replaceTeams([
      testTeam('静默校验测试队', [
        garchompMember({
          abilityId: 'intimidate',
          itemId: undefined,
        }),
      ]),
    ]);
    const user = await renderApp();

    await user.click(await screen.findByLabelText('队伍：静默校验测试队'));
    await user.click(screen.getByText('烈咬陆鲨'));
    await user.click(screen.getByTitle('编辑成员'));

    expect(await screen.findByText('编辑成员')).toBeTruthy();
    expect(screen.queryByText('特性与当前 Pokémon 不匹配。')).toBeNull();
    expect(screen.queryByText('校验结果')).toBeNull();
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByText('编辑成员')).toBeNull());
    const state = await repository.loadState();
    expect(state.teams[0].members[0].legalityStatus).toBe('illegal');
  });

  it('keeps imported environment sample metadata on the list without showing a source card in detail', async () => {
    const user = await renderEnvironmentApp();
    const importButton = screen.getAllByRole('button', { name: /导入配置/ })[0];
    const importedSample = findSampleForImportButton(importButton);

    await user.click(importButton);
    await continueFirstImportNotice(user);
    const importedCard = await screen.findByLabelText(`队伍：${importedSample.title}`);
    expect(importedCard.textContent).not.toContain('上位构筑导入');
    expect(importedCard.textContent).not.toContain('当前');
    expect(importedCard.textContent).toContain(`${importedSample.slots.length}/6 成员`);
    expect(within(importedCard).getByRole('button', { name: `编辑 ${importedSample.title}` })).toBeTruthy();
    expect(within(importedCard).queryByRole('button', { name: '编辑配置' })).toBeNull();
    expect(within(importedCard).queryByRole('button', { name: '生成图片' })).toBeNull();

    await user.click(importedCard);
    expect(await screen.findByRole('heading', { name: importedSample.title })).toBeTruthy();
    expect(screen.queryByText('队报链接')).toBeNull();
    expect(screen.queryByText(/来源|原始样本|高分导入|上位构筑导入/)).toBeNull();
  });

  it('imports, displays, and copies VGCPastes replica codes from team detail', { timeout: 20000 }, async () => {
    const user = await renderEnvironmentApp();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { card: sampleCard, sample: replicaCodeSample } = await revealVisibleReplicaCodeSample(user);
    expect(sampleCard).toBeTruthy();
    expect(sampleCard.textContent).toContain('VGCPastes');
    expect(within(sampleCard).getByLabelText('可导入 SP分配')).toBeTruthy();
    expect(within(sampleCard).getByLabelText('可导入 配招')).toBeTruthy();
    expect(within(sampleCard).getByLabelText('可导入 队伍码')).toBeTruthy();

    await user.click(within(sampleCard).getByRole('button', { name: /导入配置/ }));
    const dialog = await screen.findByRole('dialog', { name: '导入配置提示' });
    expect(dialog.textContent).toContain('这份样本可带入Pokémon、道具、SP分配、配招、队伍码');
    expect(dialog.textContent).toContain('公开配置已随队伍带入');
    await user.click(within(dialog).getByRole('button', { name: '继续导入' }));

    const importedCard = await screen.findByLabelText(`队伍：${replicaCodeSample.title}`);
    await user.click(importedCard);
    expect(await screen.findByRole('heading', { name: replicaCodeSample.title })).toBeTruthy();
    expect(screen.getByText(replicaCodeSample.replicaCode!)).toBeTruthy();
    expect(screen.queryByText(/本地队伍|可自由编辑/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '复制队伍码' }));
    expect(writeText).toHaveBeenCalledWith(replicaCodeSample.replicaCode);
    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('队伍码已复制');
    expect(toast.textContent).toContain('分享可能已过期');

    writeText.mockRejectedValueOnce(new Error('clipboard denied'));
    await user.click(screen.getByRole('button', { name: '复制队伍码' }));
    await waitFor(() => {
      const fallbackToast = screen.getByRole('status');
      expect(fallbackToast.textContent).toContain('队伍码复制失败');
      expect(fallbackToast.textContent).toContain('请手动选择队伍码复制');
    });
  });

  it('shows the import coverage notice only before the first upper-build import', async () => {
    const user = await renderEnvironmentApp();
    const firstImportButton = screen.getAllByRole('button', { name: /导入配置/ })[0];
    const firstImportedSample = findSampleForImportButton(firstImportButton);

    await user.click(firstImportButton);
    const dialog = await screen.findByRole('dialog', { name: '导入配置提示' });
    expect(within(dialog).getByRole('button', { name: '队报链接' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '继续导入' }));
    expect(await screen.findByLabelText(`队伍：${firstImportedSample.title}`)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '环境' }));
    const secondImportButton = screen.getAllByRole('button', { name: /导入配置/ })[1];
    const secondImportedSample = findSampleForImportButton(secondImportButton);
    await user.click(secondImportButton);
    expect(screen.queryByRole('dialog', { name: '导入配置提示' })).toBeNull();
    expect(await screen.findByLabelText(`队伍：${secondImportedSample.title}`)).toBeTruthy();
  });

  it('deletes teams directly from the list card', async () => {
    const user = await renderApp();

    expect(screen.getByLabelText('队伍：Luxray test')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '删除 Luxray test' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '确认删除队伍' });
    expect(confirmDialog.textContent).toContain('Luxray test');
    await user.click(within(confirmDialog).getByRole('button', { name: '取消' }));
    expect(screen.getByLabelText('队伍：Luxray test')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '删除 Luxray test' }));
    await user.click(within(await screen.findByRole('dialog', { name: '确认删除队伍' })).getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(screen.queryByLabelText('队伍：Luxray test')).toBeNull());
    const state = await repository.loadState();
    expect(state.teams.some((team) => team.name === 'Luxray test')).toBe(false);
  });

  it('reorders teams by dragging the list card handle', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: /新建/ }));
    const nameInput = screen.getByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, '第二队');
    await user.click(screen.getByRole('button', { name: '确认' }));
    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));

    const secondTeamCard = await screen.findByLabelText('队伍：第二队');
    const dragHandle = within(secondTeamCard).getByRole('button', { name: '拖动排序 第二队' });
    expect(within(secondTeamCard).queryByRole('button', { name: /上移|下移/ })).toBeNull();
    fireEvent.pointerDown(dragHandle, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(dragHandle, { pointerId: 1, clientY: 90 });
    fireEvent.pointerUp(dragHandle, { pointerId: 1, clientY: 90 });

    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.teams.map((team) => team.name).slice(0, 2)).toEqual(['Luxray test', '第二队']);
    });
  });

  it('imports upper-build teams without inventing missing moves, nature, or SP details', async () => {
    const user = await renderEnvironmentApp();
    const sampleCard = await revealEnvironmentSample(user, basicPokeDbSample);

    await user.click(within(sampleCard).getByRole('button', { name: /导入配置/ }));
    await continueFirstImportNotice(user);
    await screen.findByLabelText(`队伍：${basicPokeDbSample.title}`);

    let imported = undefined as Awaited<ReturnType<typeof repository.loadState>>['teams'][number] | undefined;
    await waitFor(async () => {
      const state = await repository.loadState();
      imported = state.teams.find(
        (team) => team.source?.kind === 'environment-sample-import' && team.source.sampleId === basicPokeDbSample.id,
      );
      expect(imported).toBeTruthy();
    });

    const firstMember = imported!.members[0];
    expect(firstMember.pokemonId).toBe(basicPokeDbSample.slots[0].pokemonId);
    expect(firstMember.itemId).toBe(basicPokeDbSample.slots[0].itemId);
    expect(firstMember.formId).toBe(basicPokeDbSample.slots[0].pokemonId);
    expect(firstMember.abilityId).toBeUndefined();
    expect(firstMember.moveIds).toEqual([]);
    expect(firstMember.statPoints).toEqual({});
    expect(firstMember.nature).toBe('浮躁');
  });

  it('allows imported Starminite Starmie to switch to its Champions Mega form', async () => {
    const user = await renderEnvironmentApp();
    const singlesSamples = testEnvironmentState.teamSamples.filter((sample) => sample.battleType === 'singles');
    const starmieSampleIndex = singlesSamples.findIndex((sample) =>
      sample.slots.some((slot) => slot.pokemonId === 'starmie' && slot.itemId === 'starminite'),
    );
    const starmieSample = singlesSamples[starmieSampleIndex];

    expect(starmieSampleIndex).toBeGreaterThanOrEqual(0);
    const starmieSampleCard = await revealEnvironmentSample(user, starmieSample);
    await user.click(within(starmieSampleCard).getByRole('button', { name: /导入配置/ }));
    await continueFirstImportNotice(user);

    const importedCard = await screen.findByLabelText(`队伍：${starmieSample.title}`);
    await user.click(importedCard);
    expect(await screen.findByRole('heading', { name: starmieSample.title })).toBeTruthy();

    await user.click(screen.getByText('宝石海星'));
    await user.click(screen.getByTitle('编辑成员'));
    const formSelect = (await screen.findByLabelText('形态预览')) as HTMLSelectElement;

    expect(Array.from(formSelect.options).map((option) => option.value)).toContain('mega-starmie');
    expect(formSelect.value).toBe('starmie');
    await user.selectOptions(formSelect, 'mega-starmie');
    expect(formSelect.value).toBe('mega-starmie');
  });

  it('shows import success feedback and clears the imported team highlight', async () => {
    const user = await renderEnvironmentApp();
    const importButton = screen.getAllByRole('button', { name: /导入配置/ })[0];
    const importedSample = findSampleForImportButton(importButton);

    await user.click(importButton);
    await continueFirstImportNotice(user);
    expect((await screen.findByRole('status')).textContent).toContain('已导入配置');

    const importedCard = await screen.findByLabelText(`队伍：${importedSample.title}`);
    expect(importedCard.dataset.importHighlighted).toBe('true');

    await waitFor(() => expect(importedCard.dataset.importHighlighted).toBeUndefined(), { timeout: 3500 });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens a dedicated full environment ranking before pokemon environment detail', async () => {
    const user = await renderEnvironmentApp();

    await user.click(screen.getByRole('button', { name: '查看全部宝可梦' }));
    expect(await screen.findByRole('heading', { name: '完整宝可梦榜' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '单打' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '双打' })).toBeTruthy();
    expect(screen.queryByText('热门队伍样本')).toBeNull();

    await user.click(screen.getByRole('button', { name: new RegExp(topSinglesPokemon.chineseName) }));
    expect(await screen.findByRole('heading', { name: topSinglesPokemon.chineseName })).toBeTruthy();
    expect(screen.getByText('常用招式')).toBeTruthy();
    expect(screen.getByText(topSinglesMove.chineseName)).toBeTruthy();
    expect(screen.getByText('携带道具')).toBeTruthy();
    expect(screen.getByText('常见队友')).toBeTruthy();
  });

  it('shows the latest four upper-build samples and opens the full team library', async () => {
    const user = await renderEnvironmentApp();
    const singlesSamples = testEnvironmentState.teamSamples.filter((sample) => sample.battleType === 'singles');
    const expectedLatestTitles = sortTeamSamplesByDate(singlesSamples).slice(0, 4).map((sample) => sample.title);

    expect(screen.getByText('上位构筑')).toBeTruthy();
    const upperBuildSection = screen.getByText('上位构筑').closest('section');
    const visibleSampleTitles = within(upperBuildSection as HTMLElement)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
      .slice(1);
    expect(visibleSampleTitles).toEqual(expectedLatestTitles);
    expect(screen.queryByRole('button', { name: '换一批' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '查看全部队伍' }));
    expect(await screen.findByRole('heading', { name: '队伍一览' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: '搜索队伍或宝可梦' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '试试灵感' })).toBeTruthy();
  });

  it('keeps environment sample labeling lightweight without the bulky seed notice', async () => {
    const user = await renderEnvironmentApp();

    expect(screen.getByText(`${testEnvironmentState.seasonLabel} · 单打`)).toBeTruthy();
    expect(screen.getByText(/源更新/)).toBeTruthy();
    expect(screen.getByText(/抓取/)).toBeTruthy();
    expect(screen.queryByText('在线数据')).toBeNull();
    expect(screen.queryByText('最新')).toBeNull();
    expect(screen.queryByText('可能过期')).toBeNull();
    expect(screen.queryByText('数据源异常')).toBeNull();
    expect(screen.queryByText(testEnvironmentState.sourceLabel)).toBeNull();
    expect(screen.queryByText(/本页使用本地 seed 占位数据/)).toBeNull();
    expect(screen.queryByText(/不代表真实使用率/)).toBeNull();
    expect(screen.queryByText('高分样本')).toBeNull();

    await user.click(screen.getByRole('button', { name: '查看全部宝可梦' }));
    expect(await screen.findByRole('heading', { name: '完整宝可梦榜' })).toBeTruthy();
    expect(screen.getByText(`${testEnvironmentState.seasonLabel} · 单打`)).toBeTruthy();
    expect(screen.queryByText(testEnvironmentState.sourceLabel)).toBeNull();
    expect(screen.queryByText(/本页使用本地 seed 占位数据/)).toBeNull();

    await user.click(screen.getByRole('button', { name: new RegExp(topSinglesPokemon.chineseName) }));
    expect(await screen.findByRole('heading', { name: topSinglesPokemon.chineseName })).toBeTruthy();
    expect(screen.getAllByText(/原作者：/).length).toBeGreaterThan(0);
    expect(screen.queryByText('真实样本')).toBeNull();
    expect(screen.queryByText('PokeDB公开数据')).toBeNull();
    expect(screen.queryByText(/本页使用本地 seed 占位数据/)).toBeNull();
  });

  it('opens environment data methodology with source, sample count, and metric notes', async () => {
    const user = await renderEnvironmentApp();

    await user.click(screen.getByRole('button', { name: '查看数据口径' }));

    expect(await screen.findByRole('heading', { name: '数据口径' })).toBeTruthy();
    expect(screen.getByText('528 队')).toBeTruthy();
    expect(screen.getByText('71 队')).toBeTruthy();
    expect(screen.getByText(/PokeDB 公开统计页（M-1 当季聚合）/)).toBeTruthy();
    expect(screen.getByText('不是全服实时统计')).toBeTruthy();
    expect(screen.getByText(/无总使用率 %，只有名次/)).toBeTruthy();
    expect(screen.getByText(/招式、道具 % 是真实占比；队友仅按搭档排名展示/)).toBeTruthy();
    expect(screen.queryByText(/54\.0% \/ 285 队/)).toBeNull();
    expect(screen.queryByText(/PokeDB 公开的 M-1 上位构筑快照/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '返回环境' }));
    expect(await screen.findByRole('heading', { name: '环境' })).toBeTruthy();
  });

  it('shows related environment sample teams on pokemon environment detail and imports them', async () => {
    const user = await renderEnvironmentApp();

    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));
    expect(await screen.findByRole('heading', { name: '烈咬陆鲨' })).toBeTruthy();
    expect(screen.getByText('相关上位构筑')).toBeTruthy();
    expect(screen.getByText(relatedGarchompSample.title)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: '导入配置' })[0]);
    await continueFirstImportNotice(user);
    expect((await screen.findByRole('status')).textContent).toContain('已导入配置');
    expect(await screen.findByLabelText(relatedGarchompTeamLabel)).toBeTruthy();
  });

  it('opens the damage calculator on a blank state and resets it after leaving', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();
    expect(screen.getAllByText('未配置 Pokemon').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/% -/)).toBeNull();
    expect(screen.getByText('请先选择进攻方、防守方和招式')).toBeTruthy();

    await selectCalculatorPair(user);
    expect(await screen.findByText(/% -/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回工具' }));
    await screen.findByRole('button', { name: /伤害计算/ });
    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();
    expect(screen.getAllByText('未配置 Pokemon').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/% -/)).toBeNull();
  });

  it('allows real editing of temporary config: SP, nature, item, and move changes persist', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();
    await selectCalculatorPair(user);

    // Verify mandatory UI labels
    expect(screen.queryByText(/Champions SP/)).toBeNull();
    expect(screen.queryByText(/Lv.50 固定/)).toBeNull();
    expect(screen.queryByText(/手动临时配置/)).toBeNull();
    expect(screen.getByText(/临时修改不会自动保存/)).toBeTruthy();
    expect(screen.queryByText('努力值')).toBeNull();
    expect(screen.getAllByText('伤害计算').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Gen9').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/公式：Gen9/)).toBeTruthy();
    expect(screen.queryByText(/当前无法|机制待确认|非官方 Champions 正式结论|Champions 伤害公式尚未/)).toBeNull();
    expect(screen.getByText(/% -/)).toBeTruthy();
    expect(screen.queryByText('场地')).toBeNull();
    expect(screen.queryByText('防守方保护')).toBeNull();
    expect(screen.queryByText('进攻方 HP')).toBeNull();
    expect(screen.queryByText('防守方 HP')).toBeNull();
    expect(screen.queryByText('进攻方状态')).toBeNull();
    expect(screen.queryByText('防守方状态')).toBeNull();
    expect(screen.getByLabelText('会心一击')).toBeTruthy();

    // Expand attacker config
    await user.click(screen.getByRole('button', { name: /选择进攻方/ }));
    const editBtns = screen.getAllByTitle('编辑 SP/能力配置');
    await user.click(editBtns[0]);
    expect(await screen.findByText(/HP SP、攻防 SP 可编辑/)).toBeTruthy();
    expect(screen.getByText(/临时修改不会自动保存到队伍/)).toBeTruthy();

    // ── Test SP editing: temporary Pokemon starts at 0 SP, change HP to 8 through the picker ──
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(screen.getByRole('button', { name: /HP\s*0/ }));
    const hpSlider = screen.getByRole('slider', { name: 'HP SP' });
    expect(hpSlider.getAttribute('max')).toBe('32');
    expect(screen.getByRole('button', { name: 'min' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'max' })).toBeTruthy();
    fireEvent.change(hpSlider, { target: { value: '8' } });
    expect((hpSlider as HTMLInputElement).value).toBe('8');
    await user.click(screen.getByTitle('关闭 SP 调整'));
    expect(screen.getAllByText(/已用 8\/66/).length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: /攻击\s*0/ }));
    const attackSlider = screen.getByRole('slider', { name: '攻击 SP' });
    fireEvent.change(attackSlider, { target: { value: '32' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));
    await user.click(screen.getByRole('button', { name: /速度\s*0/ }));
    const speedSlider = screen.getByRole('slider', { name: '速度 SP' });
    fireEvent.change(speedSlider, { target: { value: '32' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));
    expect(screen.getAllByText(/已用 72\/66/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/SP 分配不合法/)).toBeTruthy();
    expect(screen.getByText(/SP 分配需要调整/)).toBeTruthy();

    // ── Test nature editing ──
    const natureSelect = screen.getByLabelText('性格') as HTMLSelectElement;
    expect(natureSelect.tagName).toBe('SELECT');
    expect(Array.from(natureSelect.options).some((option) => option.textContent === '爽朗（+速度 / -特攻）')).toBe(true);
    await user.selectOptions(natureSelect, '固执');
    expect(natureSelect.value).toBe('固执');

    // ── Test item editing: find the select with "无道具" option ──
    const allSelects = screen.getAllByRole('combobox');
    const itemSelect = allSelects.find((s) => (s as HTMLSelectElement).options.length > 1 && (s as HTMLSelectElement).options[0].textContent === '无道具') as HTMLSelectElement;
    expect(itemSelect).toBeTruthy();
    const seedItem = Array.from(itemSelect.options).find((o) => o.value && o.value !== '');
    expect(seedItem).toBeTruthy();
    const testItemId = seedItem!.value;
    await user.selectOptions(itemSelect, testItemId);
    expect(itemSelect.value).toBe(testItemId);

    // ── Test move selection ──
    const moveSelect = allSelects.find((s) => s !== itemSelect && (s as HTMLSelectElement).options.length > 0) as HTMLSelectElement;
    expect(moveSelect).toBeTruthy();
    const currentMoveId = moveSelect.value;
    expect(currentMoveId).toBeTruthy();

    // ── Collapse config and verify edits persist ──
    await user.click(screen.getByTitle('收起配置'));
    expect(screen.getByText(/固执 ·/)).toBeTruthy();

    // ── Switch weather — SP and nature must NOT be reset ──
    const weatherSelect = Array.from(screen.getAllByRole('combobox')).find(
      (s) => (s as HTMLSelectElement).options[0]?.textContent === '无天气',
    ) as HTMLSelectElement;
    expect(weatherSelect).toBeTruthy();
    await user.selectOptions(weatherSelect, '晴天');
    expect(weatherSelect.value).toBe('晴天');
    // Re-expand and verify HP is still 8
    await user.click(screen.getAllByTitle('编辑 SP/能力配置')[0]);
    expect(screen.getByRole('button', { name: /HP\s*8/ })).toBeTruthy();

    // ── Defender gets the same temporary SP picker behavior ──
    await user.click(screen.getByRole('button', { name: /防守方/ }));
    await user.click(screen.getAllByTitle('编辑 SP/能力配置')[0]);
    await user.click(screen.getAllByRole('button', { name: /防御\s*0/ }).at(-1)!);
    const defenderDefenseSlider = screen.getByRole('slider', { name: '防御 SP' });
    fireEvent.change(defenderDefenseSlider, { target: { value: '20' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));
    expect(screen.getAllByText(/已用 20\/66/).length).toBeGreaterThanOrEqual(1);
  });

  it('applies defender HP SP to the displayed damage target HP', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();
    await selectCalculatorPair(user);

    const initialHpText = screen.getByText(/对方 HP:/).textContent ?? '';
    const initialHp = Number(initialHpText.match(/对方 HP: (\d+)/)?.[1]);
    expect(Number.isFinite(initialHp)).toBe(true);
    expect(screen.getByText(/防守方能力值：HP/)).toBeTruthy();
    expect(screen.getAllByText(/SP：HP 0/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: /防守方/ }));
    await user.click(screen.getAllByTitle('编辑 SP/能力配置')[0]);
    expect(await screen.findByText(/HP SP、攻防 SP 可编辑/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /HP\s*0/ }));
    const defenderHpSlider = screen.getByRole('slider', { name: 'HP SP' });
    fireEvent.change(defenderHpSlider, { target: { value: '32' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`对方 HP: ${initialHp + 32}`))).toBeTruthy();
    });
    expect(screen.getAllByText(/SP：HP 32/).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps calculator move search results synced with the selected move', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();

    await user.type(screen.getByPlaceholderText('搜索名称'), 'Incineroar');
    await user.click(await screen.findByText('炽焰咆哮虎'));

    await user.click(screen.getAllByTitle('编辑 SP/能力配置')[0]);
    const moveSearch = await screen.findByPlaceholderText('搜索攻击招式');
    await user.type(moveSearch, 'D');

    const ddOption = await screen.findByRole('option', { name: /ＤＤ金勾臂/ });
    expect(ddOption).toBeTruthy();

    await user.clear(moveSearch);
    await user.type(moveSearch, 'DD');
    const selectedDdOption = await screen.findByRole('option', { name: /ＤＤ金勾臂/ });
    const moveSelect = selectedDdOption.closest('select') as HTMLSelectElement;
    expect(moveSelect.value).toBe('darkest-lariat');
    expect(await screen.findByText(/ＤＤ金勾臂 · 85 威力/)).toBeTruthy();
  });

  it('shows the ability reason chip when Flash Fire prevents damage', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();

    await user.type(screen.getByPlaceholderText('搜索名称'), 'Houndoom');
    await user.click(await screen.findByText('黑鲁加'));
    await user.click(screen.getAllByTitle('编辑 SP/能力配置')[0]);
    const moveSearch = await screen.findByPlaceholderText('搜索攻击招式');
    await user.type(moveSearch, '闪焰冲锋');
    expect(await screen.findByText(/闪焰冲锋 · 120 威力/)).toBeTruthy();
    await user.click(screen.getByTitle('收起配置'));

    await user.click(screen.getByRole('button', { name: /防守方/ }));
    await user.type(screen.getByPlaceholderText('搜索名称'), 'Arcanine');
    const arcanineResult = (await screen.findAllByText('风速狗'))[0].closest('button');
    expect(arcanineResult).toBeTruthy();
    await user.click(arcanineResult!);
    await user.click(screen.getAllByTitle('编辑 SP/能力配置').at(-1)!);
    const flashFireSelect = screen.getAllByRole('combobox').find((select) =>
      Array.from((select as HTMLSelectElement).options).some((option) => option.value === 'flash-fire'),
    ) as HTMLSelectElement;
    expect(flashFireSelect).toBeTruthy();
    await user.selectOptions(flashFireSelect, 'flash-fire');

    expect(await screen.findByText(/无法造成伤害/)).toBeTruthy();
    expect(screen.getByText(/防守特性：引火.*火属性招式无效/)).toBeTruthy();
  });

  it('imports team-member config and preserves original team data after edits', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);

    expect(await screen.findByRole('heading', { name: '伤害计算' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /从队伍选择/ }));
    await user.click(screen.getByRole('button', { name: /伦琴猫/ }));
    const luxrayElements = screen.getAllByText(/伦琴猫/);
    expect(luxrayElements.length).toBeGreaterThanOrEqual(1);

    // Expand the attacker config and edit SP
    const editBtns = screen.getAllByTitle('编辑 SP/能力配置');
    await user.click(editBtns[0]);
    await screen.findByText(/HP SP、攻防 SP 可编辑/);

    await user.click(screen.getByRole('button', { name: /HP\s*\d+/ }));
    const hpSlider = screen.getByRole('slider', { name: 'HP SP' });
    fireEvent.change(hpSlider, { target: { value: '12' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));

    expect(screen.getByRole('button', { name: /HP\s*12/ })).toBeTruthy();

    // Navigate back to team page
    await user.click(screen.getByRole('button', { name: '队伍' }));
    expect(await screen.findByText('我的队伍')).toBeTruthy();
    await openDefaultTeam(user);

    // Expand member again — the team page is functional
    await user.click(screen.getByText('伦琴猫'));
    expect(screen.getByText('能力值 / SP')).toBeTruthy();
    expect(screen.getByText(/已用 65\/66/)).toBeTruthy();
    expect(screen.queryByText(/已用 76\/66/)).toBeNull();
  });

  it('selects both calculator sides from searchable Pokemon and team recommendations', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();
    expect(screen.getByRole('button', { name: /从队伍选择/ })).toBeTruthy();
    expect(screen.queryByText('小顿熊')).toBeNull();
    await pickCalculatorPokemon(user, 'attacker', 'Garchomp', '烈咬陆鲨');

    // Switch to defender and pick from search
    await user.click(screen.getByRole('button', { name: /防守方/ }));
    expect(await screen.findByText('选择防守方')).toBeTruthy();
    const selector = screen.getByText('选择防守方').closest('section');
    expect(selector).toBeTruthy();

    await user.click(within(selector as HTMLElement).getByRole('button', { name: /从队伍选择/ }));
    const luxrayBtn = within(selector as HTMLElement).getByRole('button', { name: /伦琴猫/ });
    await user.click(luxrayBtn);
    await user.type(screen.getByPlaceholderText('搜索名称'), 'Torkoal');
    await user.click(within(selector as HTMLElement).getByText('煤炭龟'));

    // Verify damage result area is calculated with the Gen9 path.
    expect(screen.getAllByText('伤害计算').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Gen9').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/公式：Gen9/)).toBeTruthy();
    expect(screen.getByText(/% -/)).toBeTruthy();
  });

  it('filters the Pokedex Pokemon list by up to two selected types', { timeout: 30000 }, async () => {
    const user = await renderApp();

    await openTool(user, /规则图鉴/);
    expect(await waitForDexPage()).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索名称')).toBeTruthy();
    expect(screen.getByText('超级烈咬陆鲨')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '打开图鉴过滤' }));
    await user.click(screen.getByRole('button', { name: /^火属性$/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getAllByText('炽焰咆哮虎').length).toBeGreaterThan(0);
    expect(screen.getByText('煤炭龟')).toBeTruthy();
    expect(screen.getAllByText('喷火龙').length).toBeGreaterThan(0);
    expect(screen.queryByText('蚊香蛙皇')).toBeNull();

    await user.click(screen.getByRole('button', { name: '打开图鉴过滤' }));
    await user.click(screen.getByRole('button', { name: /^飞行属性$/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getAllByText('喷火龙').length).toBeGreaterThan(0);
    expect(screen.queryByText('炽焰咆哮虎')).toBeNull();
    expect(screen.queryByText('煤炭龟')).toBeNull();

    await user.click(screen.getByRole('button', { name: '清空' }));
    await user.click(screen.getByRole('button', { name: '打开图鉴过滤' }));
    await user.click(screen.getByRole('button', { name: /^地面属性$/ }));
    await user.click(screen.getByRole('button', { name: /^龙属性$/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getAllByText('烈咬陆鲨').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('龙属性').length).toBeGreaterThan(0);

    await user.click(screen.getByText('烈咬陆鲨'));
    expect(await screen.findByText(/Garchomp/)).toBeTruthy();
    expect(screen.getByText(/ガブリアス/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /敬请期待/ })).toBeNull();
    expect(screen.getByRole('button', { name: /加入队伍/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /计算/ })).toBeTruthy();
    const detailAvatarSrc = screen.getAllByAltText('烈咬陆鲨')[0].getAttribute('src');
    expect(detailAvatarSrc).toContain('/assets/pokemon/thumbs/');
    expect(screen.getByText('身高')).toBeTruthy();
    expect(screen.getByText('体重')).toBeTruthy();
    expect(screen.getAllByText('特性').length).toBeGreaterThan(0);
    expect(screen.getByText('种族值')).toBeTruthy();
    expect(screen.getByText('可学会招式')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /查看烈咬陆鲨大图/ }));
    const imageDialog = screen.getByRole('dialog', { name: /烈咬陆鲨大图/ });
    expect(imageDialog).toBeTruthy();
    const artworkSrc = within(imageDialog).getByRole('img', { name: '烈咬陆鲨' }).getAttribute('src');
    expect(artworkSrc).toContain('/assets/pokemon/artwork/');
    expect(detailAvatarSrc?.match(/\/(\d+)\.png$/)?.[1]).toBe(artworkSrc?.match(/\/(\d+)\.png$/)?.[1]);
    await user.click(screen.getByTitle('关闭'));
    expect(screen.queryByText('示例待补齐')).toBeNull();
    expect(screen.getByRole('button', { name: '属性' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '升序' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '威力' }));
    expect(screen.getByText('龙爪')).toBeTruthy();
    expect(screen.getByText('属性关系')).toBeTruthy();
  });

  it('filters Pokedex moves, items, and abilities with the shared search box', { timeout: 30000 }, async () => {
    const user = await renderApp();

    await openTool(user, /规则图鉴/);
    expect(await waitForDexPage()).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '道具' }));
    await user.type(screen.getByPlaceholderText('搜索名称'), '围巾');
    expect(screen.getByText('讲究围巾')).toBeTruthy();
    const choiceScarfCard = screen.getByText('讲究围巾').closest('section')!;
    expect(within(choiceScarfCard).getByAltText('讲究围巾').getAttribute('src')).toContain('/assets/items/choice-scarf.png');
    expect(screen.queryByText('文柚果')).toBeNull();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.click(screen.getByRole('button', { name: '招式' }));
    const firstNormalMoveCard = screen.getByText(/百万吨重踢 Mega Kick/).closest('section')!;
    const firstPoisonMoveCard = screen.getByText(/溶化 Acid Armor/).closest('section')!;
    expect(firstNormalMoveCard.compareDocumentPosition(firstPoisonMoveCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '打开招式属性筛选' }));
    await user.click(screen.getByRole('button', { name: /^毒属性招式$/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getByText('招式属性：毒')).toBeTruthy();
    expect(screen.queryByText(/百万吨重踢 Mega Kick/)).toBeNull();
    expect(screen.getByText(/溶化 Acid Armor/)).toBeTruthy();

    await user.type(screen.getByPlaceholderText('搜索名称'), 'Dragon');
    expect(screen.queryByText(/龙爪 Dragon Claw/)).toBeNull();
    expect(screen.queryByText(/守住 Protect/)).toBeNull();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.click(screen.getByRole('button', { name: '清空' }));
    await user.click(screen.getByRole('button', { name: '特性' }));
    const aftermathCard = screen.getByText(/引爆 Aftermath/).closest('section')!;
    const analyticCard = screen.getByText(/分析 Analytic/).closest('section')!;
    const bigPecksCard = screen.getByText(/健壮胸肌 Big Pecks/).closest('section')!;
    expect(aftermathCard.compareDocumentPosition(analyticCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(analyticCard.compareDocumentPosition(bigPecksCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByPlaceholderText('搜索名称'), '威吓');
    const intimidateCard = screen.getByText(/威吓 Intimidate/).closest('section')!;
    expect(screen.queryByText(/精神力 Inner Focus/)).toBeNull();
    expect(screen.queryByText(/猛火 Blaze/)).toBeNull();
    expect(screen.queryByText('出场时威吓对手，让其退缩，降低对手的攻击。')).toBeNull();
    expect(within(intimidateCard).getByText(/^\+\d+$/)).toBeTruthy();
    expect(within(intimidateCard).queryByText('炽焰咆哮虎')).toBeNull();
    const intimidateExpandButton = within(intimidateCard).getByRole('button', { name: '展开威吓说明' });
    expect(intimidateExpandButton.className).toContain('h-6');
    expect(intimidateExpandButton.className).toContain('w-6');
    expect(intimidateExpandButton.className).not.toContain('border');
    await user.click(intimidateExpandButton);
    expect(within(intimidateCard).getByText('出场时威吓对手，让其退缩，降低对手的攻击。')).toBeTruthy();
    expect(within(intimidateCard).getByText('炽焰咆哮虎')).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.type(screen.getByPlaceholderText('搜索名称'), '引火');
    const flashFireCard = screen.getByText(/引火 Flash Fire/).closest('section')!;
    expect(within(flashFireCard).getByText(/\+\d+/)).toBeTruthy();
    expect(within(flashFireCard).queryByText('火暴兽')).toBeNull();
    await user.click(within(flashFireCard).getByRole('button', { name: '展开引火说明' }));
    expect(within(flashFireCard).getByText('火暴兽')).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.type(screen.getByPlaceholderText('搜索名称'), '厚脂肪');
    const thickFatCard = screen.getByText(/厚脂肪 Thick Fat/).closest('section')!;
    expect(within(thickFatCard).queryByAltText('妙蛙花')).toBeNull();
    await user.click(within(thickFatCard).getByRole('button', { name: '展开厚脂肪说明' }));
    expect(within(thickFatCard).getByText('超级妙蛙花')).toBeTruthy();
    expect(within(thickFatCard).queryByText(/^妙蛙花$/)).toBeNull();
    await user.click(within(thickFatCard).getByRole('button', { name: /超级妙蛙花/ }));
    expect(await screen.findByText(/Mega Venusaur/)).toBeTruthy();
    expect(screen.getByText('种族值')).toBeTruthy();
  });

  it('finds abilities by owner Pokemon names and prioritizes matching owner avatars', { timeout: 30000 }, async () => {
    const user = await renderApp();
    const onboarding = screen.queryByRole('dialog', { name: 'LuxrayKit 引导' });
    if (onboarding) {
      await user.click(screen.getByRole('button', { name: '跳过' }));
      await user.click(screen.getByRole('button', { name: '开始探索' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'LuxrayKit 引导' })).toBeNull());
    }

    await openTool(user, /规则图鉴/);
    expect(await waitForDexPage()).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '特性' }));
    await user.type(screen.getByPlaceholderText('搜索名称'), 'Luxray');

    const intimidateCard = await screen.findByText(/威吓 Intimidate/);
    const card = intimidateCard.closest('section')!;
    const previewImages = within(card).getAllByRole('img');
    expect(previewImages[0].getAttribute('alt')).toBe('伦琴猫');
    expect(screen.queryByText(/厚脂肪 Thick Fat/)).toBeNull();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.type(screen.getByPlaceholderText('搜索名称'), '烈咬陆鲨');
    expect(await screen.findByText(/沙隐 Sand Veil/)).toBeTruthy();
    expect(await screen.findByText(/粗糙皮肤 Rough Skin/)).toBeTruthy();
  });

  it('opens the speed line tool from the tools page', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '工具' }));
    const speedTool = await screen.findByRole('button', { name: /速度线计算/ });
    expect((speedTool as HTMLButtonElement).disabled).toBe(false);
    await user.click(speedTool);

    // SpeedPage is lazy-loaded and gated on the async environment load, so allow the same
    // generous window the other lazy-page waits use (waitForDexPage) to avoid a CI flake.
    expect(await screen.findByRole('heading', { name: '速度线' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('最终速度')).toBeTruthy();
  });
});
