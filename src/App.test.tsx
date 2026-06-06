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
import {
  createEnvironmentStateFromPokeDbSnapshot,
  getEnvironmentMove,
  getEnvironmentPokemon,
} from './data/environment';
import { repository } from './lib/db';

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
const firstSinglesSample = testEnvironmentState.teamSamples.find((sample) => sample.battleType === 'singles')!;
const firstSinglesSampleTeamLabel = `队伍：${firstSinglesSample.title}`;
const topSinglesPokemon = getEnvironmentPokemon(testEnvironmentState.pokemonUsage.singles[0].pokemonId)!;
const topSinglesMove = getEnvironmentMove(testEnvironmentState.pokemonUsage.singles[0].moveStats?.[0]?.id ?? '')!;
const relatedGarchompSample = testEnvironmentState.teamSamples.find(
  (sample) => sample.battleType === 'singles' && sample.slots.some((slot) => slot.pokemonId === 'garchomp'),
)!;
const relatedGarchompTeamLabel = `队伍：${relatedGarchompSample.title}`;

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

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
  await screen.findByText(testEnvironmentState.sourceLabel);
  return user;
};

const continueFirstImportNotice = async (user: ReturnType<typeof userEvent.setup>) => {
  const dialog = await screen.findByRole('dialog', { name: '导入配置提示' });
  expect(dialog.textContent).toContain('目前可稳定带入 Pokémon 和道具');
  expect(dialog.textContent).toContain('队报链接');
  await user.click(within(dialog).getByRole('button', { name: '继续导入' }));
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

const openDefaultTeam = async (user: ReturnType<typeof userEvent.setup>) => {
  const teamCard = await screen.findByLabelText('队伍：M-A 测试队');
  await user.click(within(teamCard).getByRole('button', { name: '编辑配置' }));
  await screen.findByRole('heading', { name: 'M-A 测试队' });
};

describe('App page flows', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(pokedbSnapshot), { status: 200 })),
    );
    await deleteDb();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('labels the loading state as local rule data instead of mock data', async () => {
    render(<App />);

    expect(screen.getByText('正在载入本地缓存与规则数据...')).toBeTruthy();
    expect(screen.queryByText(/模拟数据/)).toBeNull();
    expect(await screen.findByRole('heading', { name: '环境' })).toBeTruthy();
  });

  it('navigates bottom tabs and keeps the teams tab focused on local teams', { timeout: 15000 }, async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByRole('heading', { name: '伤害计算' })).toBeTruthy();

    await openTool(user, /规则图鉴/);
    expect(await screen.findByText('规则内图鉴')).toBeTruthy();
    expect(await screen.findByText('Pokémon / 招式 / 道具 / 特性 · 当前规则数据')).toBeTruthy();
    expect(screen.queryByText(/当前规则模拟数据/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '队伍' }));
    expect(await screen.findByText('我的队伍')).toBeTruthy();
    expect(screen.queryByText('本地缓存可用')).toBeNull();
    expect(screen.queryByText('Regulation Set M-A')).toBeNull();
    expect(screen.queryByText('当前赛季')).toBeNull();
    expect(screen.queryByText('官方数据源状态可追溯')).toBeNull();
  });

  it('keeps the tools landing page as three equal entries without explanatory notes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: '环境' });

    await user.click(screen.getByRole('button', { name: '工具' }));

    expect(await screen.findByRole('heading', { name: '工具' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /伤害计算/ })).toBeTruthy();
    const speedTool = await screen.findByRole('button', { name: /速度线计算/ });
    expect((speedTool as HTMLButtonElement).disabled).toBe(true);
    expect(speedTool.textContent).toContain('敬请期待');
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
    await user.type(screen.getByPlaceholderText(/输入队伍名称/), '测试队');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(await screen.findByRole('heading', { name: '测试队' })).toBeTruthy();
    expect(await screen.findByText(/0\/6 成员/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    await openDefaultTeam(user);
    expect(await screen.findByText(/2\/6 成员/)).toBeTruthy();

    await user.click(screen.getByText('烈咬陆鲨'));
    expect(await screen.findByText('能力值 / SP')).toBeTruthy();
    await user.click(screen.getByTitle('编辑成员'));
    expect(await screen.findByText('编辑成员')).toBeTruthy();
    await user.click(screen.getByTitle('关闭'));

    await user.click(screen.getByTitle('收起成员'));
    expect(screen.queryByText('能力值 / SP')).toBeNull();
  });

  it('keeps member editing focused on the selected Pokemon, moves, nature, item, ability, and six SP fields', { timeout: 15000 }, async () => {
    const user = await renderApp();
    await openDefaultTeam(user);

    await user.click(screen.getByText('烈咬陆鲨'));
    await user.click(screen.getByTitle('编辑成员'));

    expect(await screen.findByText('编辑成员')).toBeTruthy();
    expect(screen.getByText('形态预览只影响能力值 / 属性展示；Mega Stone 作为道具独立配置。')).toBeTruthy();
    expect(screen.queryByLabelText('Pokemon')).toBeNull();
    expect(screen.queryByText('等级')).toBeNull();
    expect(screen.queryByText('备注')).toBeNull();
    const itemSearch = screen.getByPlaceholderText('搜索携带物');
    await user.type(itemSearch, '文柚');
    expect(screen.getAllByRole('button', { name: /文柚果/ }).length).toBeGreaterThan(0);
    await user.clear(itemSearch);
    await user.type(itemSearch, '突击背心');
    expect(screen.queryByRole('button', { name: /突击背心/ })).toBeNull();
    await user.clear(itemSearch);
    await user.type(itemSearch, '清净坠饰');
    expect(screen.queryByRole('button', { name: /清净坠饰/ })).toBeNull();
    await user.clear(itemSearch);
    await user.type(itemSearch, '烈咬陆鲨');
    await user.click(screen.getByRole('button', { name: /烈咬陆鲨进化石/ }));
    expect((screen.getByLabelText('形态预览') as HTMLSelectElement).value).toBe('garchomp');
    await user.selectOptions(screen.getByLabelText('形态预览'), 'mega-garchomp');
    expect(screen.getAllByText('烈咬陆鲨进化石').length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText('形态预览'), 'garchomp');
    expect(screen.getAllByText('烈咬陆鲨进化石').length).toBeGreaterThan(0);
    const moveSearch = screen.getAllByPlaceholderText('搜索招式')[0];
    await user.type(moveSearch, '龙爪');
    await user.click(screen.getAllByRole('button', { name: /龙爪/ })[0]);
    expect(screen.getByRole('button', { name: /招式 3.*龙爪/ })).toBeTruthy();

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

    expect(await screen.findByText(/2\/6 成员/)).toBeTruthy();
    await user.click(screen.getAllByTitle('删除成员')[0]);
    expect(await screen.findByText(/1\/6 成员/)).toBeTruthy();
  });

  it('creates a team after all teams have been deleted', async () => {
    const user = await renderApp();
    await openDefaultTeam(user);

    await user.click(screen.getByTitle('删除队伍'));
    const confirmDialog = await screen.findByRole('dialog', { name: '确认删除队伍' });
    await user.click(within(confirmDialog).getByRole('button', { name: '确认删除' }));
    expect(await screen.findByText('还没有队伍')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '新建第一支队伍' }));
    await user.type(screen.getByPlaceholderText(/输入队伍名称/), '重建队伍');
    await user.click(screen.getByRole('button', { name: '确认' }));

    expect(await screen.findByText('重建队伍')).toBeTruthy();
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

    await user.click(screen.getByTitle('编辑队伍名称'));
    const nameInput = screen.getByLabelText('队伍名称');
    await user.clear(nameInput);
    await user.type(nameInput, '雨天试验队{enter}');
    expect(await screen.findByRole('heading', { name: '雨天试验队' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    expect(await screen.findByLabelText('队伍：雨天试验队')).toBeTruthy();
  });

  it('generates a team image from the list and only offers save', async () => {
    const user = await renderApp();

    const teamCard = await screen.findByLabelText('队伍：M-A 测试队');
    expect(within(teamCard).getByRole('button', { name: '编辑配置' })).toBeTruthy();
    await user.click(within(teamCard).getByRole('button', { name: '生成图片' }));

    const dialog = await screen.findByRole('dialog', { name: '队伍分享图' });
    const image = within(dialog).getByRole('img', { name: 'M-A 测试队 队伍分享图' }) as HTMLImageElement;
    expect(image.src).toContain('data:image/svg+xml');
    expect(within(dialog).getByRole('button', { name: '保存图片' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /分享|取消|关闭/ })).toBeNull();
  });

  it('keeps imported environment sample metadata on the list without showing a source card in detail', async () => {
    const user = await renderEnvironmentApp();

    await user.click(screen.getAllByRole('button', { name: /导入配置/ })[0]);
    await continueFirstImportNotice(user);
    const importedCard = await screen.findByLabelText(firstSinglesSampleTeamLabel);
    expect(importedCard.textContent).not.toContain('上位构筑导入');
    expect(importedCard.textContent).not.toContain('当前');
    expect(importedCard.textContent).toContain(`${firstSinglesSample.slots.length}/6 成员`);
    expect(within(importedCard).getByRole('button', { name: '编辑配置' })).toBeTruthy();
    expect(within(importedCard).getByRole('button', { name: '生成图片' })).toBeTruthy();

    await user.click(within(importedCard).getByRole('button', { name: '编辑配置' }));
    expect(await screen.findByRole('heading', { name: firstSinglesSample.title })).toBeTruthy();
    expect(screen.queryByText('队报链接')).toBeNull();
    expect(screen.queryByText(/来源|原始样本|高分导入|上位构筑导入/)).toBeNull();
  });

  it('shows the import coverage notice only before the first upper-build import', async () => {
    const user = await renderEnvironmentApp();
    const singlesSamples = testEnvironmentState.teamSamples.filter((sample) => sample.battleType === 'singles');

    await user.click(screen.getAllByRole('button', { name: /导入配置/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: '导入配置提示' });
    expect(within(dialog).getByRole('button', { name: '队报链接' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '继续导入' }));
    expect(await screen.findByLabelText(`队伍：${singlesSamples[0].title}`)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '环境' }));
    await user.click(screen.getAllByRole('button', { name: /导入配置/ })[1]);
    expect(screen.queryByRole('dialog', { name: '导入配置提示' })).toBeNull();
    expect(await screen.findByLabelText(`队伍：${singlesSamples[1].title}`)).toBeTruthy();
  });

  it('deletes teams directly from the list card', async () => {
    const user = await renderApp();

    expect(screen.getByLabelText('队伍：M-A 测试队')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '删除 M-A 测试队' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '确认删除队伍' });
    expect(confirmDialog.textContent).toContain('M-A 测试队');
    await user.click(within(confirmDialog).getByRole('button', { name: '取消' }));
    expect(screen.getByLabelText('队伍：M-A 测试队')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '删除 M-A 测试队' }));
    await user.click(within(await screen.findByRole('dialog', { name: '确认删除队伍' })).getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(screen.queryByLabelText('队伍：M-A 测试队')).toBeNull());
    const state = await repository.loadState();
    expect(state.teams.some((team) => team.name === 'M-A 测试队')).toBe(false);
  });

  it('reorders teams by dragging the list card handle', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: /新建/ }));
    await user.type(screen.getByPlaceholderText(/输入队伍名称/), '第二队');
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
      expect(state.teams.map((team) => team.name).slice(0, 2)).toEqual(['M-A 测试队', '第二队']);
    });
  });

  it('imports upper-build teams without inventing missing moves, nature, or SP details', async () => {
    const user = await renderEnvironmentApp();

    await user.click(screen.getAllByRole('button', { name: /导入配置/ })[0]);
    await continueFirstImportNotice(user);
    await screen.findByLabelText(firstSinglesSampleTeamLabel);

    let imported = undefined as Awaited<ReturnType<typeof repository.loadState>>['teams'][number] | undefined;
    await waitFor(async () => {
      const state = await repository.loadState();
      imported = state.teams.find(
        (team) => team.source?.kind === 'environment-sample-import' && team.source.sampleId === firstSinglesSample.id,
      );
      expect(imported).toBeTruthy();
    });

    const firstMember = imported!.members[0];
    expect(firstMember.pokemonId).toBe(firstSinglesSample.slots[0].pokemonId);
    expect(firstMember.itemId).toBe(firstSinglesSample.slots[0].itemId);
    expect(firstMember.formId).toBe(firstSinglesSample.slots[0].pokemonId);
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
    await user.click(screen.getAllByRole('button', { name: /导入配置/ })[starmieSampleIndex]);
    await continueFirstImportNotice(user);

    const importedCard = await screen.findByLabelText(`队伍：${starmieSample.title}`);
    await user.click(within(importedCard).getByRole('button', { name: '编辑配置' }));
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

    await user.click(screen.getAllByRole('button', { name: /导入配置/ })[0]);
    await continueFirstImportNotice(user);
    expect((await screen.findByRole('status')).textContent).toContain('已导入配置');

    const importedCard = await screen.findByLabelText(firstSinglesSampleTeamLabel);
    expect(importedCard.dataset.importHighlighted).toBe('true');

    await waitFor(() => expect(importedCard.dataset.importHighlighted).toBeUndefined(), { timeout: 3500 });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens a dedicated full environment ranking before pokemon environment detail', async () => {
    const user = await renderEnvironmentApp();

    await user.click(screen.getByRole('button', { name: /查看全部/ }));
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

  it('shows upper-build samples in small batches and cycles them', async () => {
    const user = await renderEnvironmentApp();
    const singlesSamples = testEnvironmentState.teamSamples.filter((sample) => sample.battleType === 'singles');

    expect(screen.getByText('上位构筑')).toBeTruthy();
    expect(screen.getByText(singlesSamples[0].title)).toBeTruthy();
    expect(screen.queryByText(singlesSamples[4].title)).toBeNull();

    await user.click(screen.getByRole('button', { name: '换一批' }));

    expect(screen.getByText(singlesSamples[4].title)).toBeTruthy();
    expect(screen.queryByText(singlesSamples[0].title)).toBeNull();
  });

  it('keeps environment sample labeling lightweight without the bulky seed notice', async () => {
    const user = await renderEnvironmentApp();

    expect(screen.getByText(testEnvironmentState.sourceLabel)).toBeTruthy();
    expect(screen.queryByText(/本页使用本地 seed 占位数据/)).toBeNull();
    expect(screen.queryByText(/不代表真实使用率/)).toBeNull();
    expect(screen.queryByText('高分样本')).toBeNull();

    await user.click(screen.getByRole('button', { name: /查看全部/ }));
    expect(await screen.findByRole('heading', { name: '完整宝可梦榜' })).toBeTruthy();
    expect(screen.getByText(testEnvironmentState.sourceLabel)).toBeTruthy();
    expect(screen.queryByText(/本页使用本地 seed 占位数据/)).toBeNull();

    await user.click(screen.getByRole('button', { name: new RegExp(topSinglesPokemon.chineseName) }));
    expect(await screen.findByRole('heading', { name: topSinglesPokemon.chineseName })).toBeTruthy();
    expect(screen.getAllByText('真实样本').length).toBeGreaterThan(0);
    expect(screen.queryByText(/本页使用本地 seed 占位数据/)).toBeNull();
  });

  it('opens environment data methodology with source, sample count, and metric notes', async () => {
    const user = await renderEnvironmentApp();

    await user.click(screen.getByRole('button', { name: '查看数据口径' }));

    expect(await screen.findByRole('heading', { name: '数据口径' })).toBeTruthy();
    expect(screen.getByText('528 队')).toBeTruthy();
    expect(screen.getByText('71 队')).toBeTruthy();
    expect(screen.getByText(/54\.0% \/ 285 队/)).toBeTruthy();
    expect(screen.getByText(/不是全服实时统计/)).toBeTruthy();
    expect(screen.getByText(/常用招式、携带道具、常见队友/)).toBeTruthy();

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

  it('allows real editing of temporary config: SP, nature, item, and move changes persist', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();

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
    const editBtns = screen.getAllByTitle('编辑能力配置');
    await user.click(editBtns[0]);
    expect(await screen.findByText(/Champions SP 分配/)).toBeTruthy();
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
    expect(screen.getByText(/已用 8\/66/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /攻击\s*0/ }));
    const attackSlider = screen.getByRole('slider', { name: '攻击 SP' });
    fireEvent.change(attackSlider, { target: { value: '32' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));
    await user.click(screen.getByRole('button', { name: /速度\s*0/ }));
    const speedSlider = screen.getByRole('slider', { name: '速度 SP' });
    fireEvent.change(speedSlider, { target: { value: '32' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));
    expect(screen.getByText(/已用 72\/66/)).toBeTruthy();
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
    await user.click(screen.getAllByTitle('编辑能力配置')[0]);
    expect(screen.getByRole('button', { name: /HP\s*8/ })).toBeTruthy();

    // ── Defender gets the same temporary SP picker behavior ──
    await user.click(screen.getByRole('button', { name: /防守方/ }));
    await user.click(screen.getAllByTitle('编辑能力配置')[0]);
    await user.click(screen.getAllByRole('button', { name: /防御\s*0/ }).at(-1)!);
    const defenderDefenseSlider = screen.getByRole('slider', { name: '防御 SP' });
    fireEvent.change(defenderDefenseSlider, { target: { value: '20' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));
    expect(screen.getByText(/已用 20\/66/)).toBeTruthy();
  });

  it('keeps calculator move search results synced with the selected move', async () => {
    const user = await renderApp();

    await openTool(user, /伤害计算/);
    expect(await screen.findByText('选择进攻方')).toBeTruthy();

    await user.type(screen.getByPlaceholderText('搜索名称'), 'Incineroar');
    await user.click(await screen.findByText('炽焰咆哮虎'));

    await user.click(screen.getAllByTitle('编辑能力配置')[0]);
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
    await user.click(screen.getAllByTitle('编辑能力配置')[0]);
    const moveSearch = await screen.findByPlaceholderText('搜索攻击招式');
    await user.type(moveSearch, '闪焰冲锋');
    expect(await screen.findByText(/闪焰冲锋 · 120 威力/)).toBeTruthy();
    await user.click(screen.getByTitle('收起配置'));

    await user.click(screen.getByRole('button', { name: /防守方/ }));
    await user.type(screen.getByPlaceholderText('搜索名称'), 'Arcanine');
    const arcanineResult = (await screen.findAllByText('风速狗'))[0].closest('button');
    expect(arcanineResult).toBeTruthy();
    await user.click(arcanineResult!);
    await user.click(screen.getAllByTitle('编辑能力配置').at(-1)!);
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
    await user.click(screen.getByRole('button', { name: /烈咬陆鲨/ }));
    const garchompElements = screen.getAllByText(/烈咬陆鲨/);
    expect(garchompElements.length).toBeGreaterThanOrEqual(1);

    // Expand the attacker config and edit SP
    const editBtns = screen.getAllByTitle('编辑能力配置');
    await user.click(editBtns[0]);
    await screen.findByText(/Champions SP 分配/);

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
    await user.click(screen.getByText('烈咬陆鲨'));
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

    // Switch to defender and pick from search
    await user.click(screen.getByRole('button', { name: /防守方/ }));
    expect(await screen.findByText('选择防守方')).toBeTruthy();
    const selector = screen.getByText('选择防守方').closest('section');
    expect(selector).toBeTruthy();

    await user.click(within(selector as HTMLElement).getByRole('button', { name: /从队伍选择/ }));
    const garchompBtn = within(selector as HTMLElement).getByRole('button', { name: /烈咬陆鲨/ });
    await user.click(garchompBtn);
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
    expect(await screen.findByText('规则内图鉴')).toBeTruthy();
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
    expect((screen.getByRole('button', { name: /敬请期待/ }) as HTMLButtonElement).disabled).toBe(true);
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

  it('filters Pokedex moves, items, and abilities with the shared search box', { timeout: 15000 }, async () => {
    const user = await renderApp();

    await openTool(user, /规则图鉴/);
    expect(await screen.findByText('规则内图鉴')).toBeTruthy();

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

  it('keeps the speed line tool unavailable from the tools page', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '工具' }));
    const speedTool = await screen.findByRole('button', { name: /速度线计算/ });
    expect((speedTool as HTMLButtonElement).disabled).toBe(true);
    await user.click(speedTool);

    expect(screen.getByRole('heading', { name: '工具' })).toBeTruthy();
    expect(screen.queryByText('最终速度')).toBeNull();
  });
});
