// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import singleRankedTeams from '../../data/external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from '../../data/external/pokedb/s1_double_ranked_teams.json';
import { currentDataVersion, currentRuleNatureOptions, currentRuleSet, pokemon } from '../../data';
import { repository } from '../../lib/db';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS } from '../../lib/statPoints';
import { encodeTeamShare, TEAM_SHARE_REQUIRED_MEMBERS } from '../../lib/teamShare';
import type { Team, TeamMember } from '../../types';

/**
 * The team list and detail are the app's core flow. These mount the real <App/> — TeamPage
 * needs AppContext, IndexedDB and hash routing — but every case starts from teams seeded
 * straight into the repository, so they never depend on the shipped preset team.
 */

const DB_NAME = 'pokemon-champions-assistant';

const pokedbSnapshot = {
  retrievedAt: '2026-06-05T06:34:02.661Z',
  battles: { singles: singleRankedTeams, doubles: doubleRankedTeams },
};

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

const member = (patch: Partial<TeamMember> = {}): TeamMember => ({
  id: 'member-garchomp',
  pokemonId: 'garchomp',
  formId: 'garchomp',
  abilityId: 'rough-skin',
  itemId: 'focus-sash',
  moveIds: ['earthquake', 'protect'],
  nature: '爽朗',
  statPoints: { attack: 32, speed: 32 },
  level: 50,
  notes: '',
  legalityStatus: 'legal',
  ...patch,
});

const team = (id: string, name: string, members: TeamMember[] = []): Team => ({
  id,
  name,
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  createdAt: '2026-06-16T00:00:00.000Z',
  updatedAt: '2026-06-16T00:00:00.000Z',
  notes: '',
  members,
});

const luxrayMember = (): TeamMember =>
  member({ id: 'member-luxray', pokemonId: 'luxray', formId: 'luxray', abilityId: 'intimidate', itemId: 'magnet', moveIds: ['wild-charge', 'protect'] });

/** Six distinct members — the threshold a team has to reach before it can be shared. */
const fullRoster = (): TeamMember[] =>
  ['garchomp', 'incineroar', 'luxray', 'charizard', 'whimsicott', 'gholdengo'].map((pokemonId) =>
    member({ id: `member-${pokemonId}`, pokemonId, formId: pokemonId, abilityId: undefined, itemId: undefined, moveIds: [], statPoints: {} }),
  );

/** Render the app already on the teams tab (list view). */
const renderTeamList = async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: '今日环境' }, { timeout: 5000 });
  await user.click(screen.getByRole('button', { name: '队伍' }));
  await screen.findByRole('heading', { name: '我的队伍' });
  return user;
};

/** Render the app deep-linked at a team's detail route, the way a bookmark or reload does. */
const renderTeamDetail = async (teamId: string) => {
  const user = userEvent.setup();
  window.history.replaceState(null, '', `#/teams/${teamId}`);
  render(<App />);
  return user;
};

/** Expand a member tile, then open the editor page from 「编辑配置」 (02-05 / N02-19 → 03-01). */
const openMemberEditor = async (user: ReturnType<typeof userEvent.setup>, memberName: string) => {
  await user.click(await screen.findByRole('button', { name: `展开 ${memberName}` }));
  await user.click(await screen.findByRole('button', { name: '编辑配置' }));
  await screen.findByRole('heading', { name: '编辑配置' });
};

const openTeamMenu = async (user: ReturnType<typeof userEvent.setup>, teamName: string) => {
  await user.click(await screen.findByRole('button', { name: `${teamName} 的更多操作` }));
  return screen.findByRole('dialog', { name: `${teamName} 的更多操作` });
};

const saveButton = () => screen.getByRole('button', { name: /^保存配置/ }) as HTMLButtonElement;

describe('TeamPage', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(pokedbSnapshot), { status: 200 })));
    await deleteDb();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists the saved teams with their member counts', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()]), team('team-beta', '乙队')]);
    await renderTeamList();

    expect(await screen.findByLabelText('队伍：甲队')).toBeTruthy();
    expect(within(screen.getByLabelText('队伍：甲队')).getByText(/1\/6 成员/)).toBeTruthy();
    expect(within(screen.getByLabelText('队伍：乙队')).getByText(/0\/6 成员/)).toBeTruthy();
  });

  it('creates a team through the 新建队伍 sheet and opens its detail', async () => {
    // clearAll (not replaceTeams([])) — it also marks the DB initialized, so loadState does
    // not re-seed the shipped preset team underneath us.
    await repository.clearAll();
    const user = await renderTeamList();

    expect(await screen.findByText('还没有队伍。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /从空白开始/ }));

    // The sheet pre-fills a name so a user can just confirm; overwrite it to prove the input works.
    const nameInput = await screen.findByLabelText('队伍名称');
    expect((nameInput as HTMLInputElement).value).toBe('队伍1');
    await user.clear(nameInput);
    await user.type(nameInput, '新生代');
    await user.click(screen.getByRole('button', { name: '建立' }));

    expect(await screen.findByRole('heading', { name: '新生代' })).toBeTruthy();
    expect(screen.getByText(/0\/6 成员/)).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams.map((entry) => entry.name)).toContain('新生代');
  });

  it('refuses to confirm an all-whitespace team name', async () => {
    await repository.clearAll();
    const user = await renderTeamList();

    await user.click(await screen.findByRole('button', { name: /从空白开始/ }));
    const nameInput = await screen.findByLabelText('队伍名称');
    await user.clear(nameInput);
    await user.type(nameInput, '   ');

    expect((screen.getByRole('button', { name: '建立' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens a team detail straight from the #/teams/:teamId route', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()]), team('team-beta', '乙队')]);
    await renderTeamDetail('team-beta');

    expect(await screen.findByRole('heading', { name: '乙队' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText(/0\/6 成员/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '甲队' })).toBeNull();
  });

  it('adds a member through an empty slot with blank, editable defaults', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队')]);
    const user = await renderTeamDetail('team-alpha');

    await user.click((await screen.findAllByRole('button', { name: '添加成员' }, { timeout: 5000 }))[0]);
    await user.type(await screen.findByLabelText('搜索宝可梦'), 'Garchomp');
    await user.click(await screen.findByText('烈咬陆鲨'));

    expect(await screen.findByText(/1\/6 成员/)).toBeTruthy();
    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.teams[0].members.map((entry) => entry.pokemonId)).toEqual(['garchomp']);
    });

    const added = (await repository.loadState()).teams[0].members[0];
    const garchomp = pokemon.find((entry) => entry.id === 'garchomp')!;
    expect(added).toMatchObject({
      formId: 'garchomp',
      abilityId: garchomp.abilities[0],
      moveIds: [],
      nature: currentRuleNatureOptions.find((option) => option.neutral)?.id ?? '认真',
      statPoints: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    });
    expect(added.itemId).toBeUndefined();
  });

  it('keeps the editor to the four config rows, the SP wheel and four move slots', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [luxrayMember()])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '伦琴猫');

    // 03-01 carries no level, notes or species field — the species is 「换宝可梦」.
    expect(screen.queryByText('等级')).toBeNull();
    expect(screen.queryByText('备注')).toBeNull();
    expect(screen.getByRole('button', { name: '换宝可梦' })).toBeTruthy();
    ['道具', '特性', '性格'].forEach((label) => {
      expect(screen.getByRole('button', { name: `选择${label}` })).toBeTruthy();
    });
    // 形态 only exists for a species with a Mega (N03-14); 伦琴猫 has none.
    expect(screen.queryByRole('button', { name: '选择形态' })).toBeNull();

    // The item picker only offers what the current rule allows this Pokemon to hold.
    await user.click(screen.getByRole('button', { name: '选择道具' }));
    await user.type(await screen.findByLabelText('搜索道具名'), '突击背心');
    expect(screen.queryByRole('button', { name: '突击背心' })).toBeNull();
    expect(await screen.findByText('没有匹配的道具')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '返回编辑配置' }));

    // 03-02: a move slot is its own page, and the picked move lands back on the slot row.
    await user.click(await screen.findByRole('button', { name: '招式 3' }));
    await user.type(await screen.findByLabelText('搜索招式名'), '雷电牙');
    await user.click(await screen.findByRole('button', { name: '雷电牙' }));
    expect(await screen.findByRole('button', { name: '招式 3 雷电牙' })).toBeTruthy();

    // 03-01's wheel: one stat at a time, one rail, no ± keys.
    expect(screen.getByRole('button', { name: '调整速度' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: '速度 SP' }).getAttribute('max')).toBe(String(MAX_STAT_POINTS_PER_STAT));
    expect(screen.queryByRole('button', { name: 'min' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'max' })).toBeNull();
  });

  it('switches a Mega stone holder to its Mega form on the 形态 page', async () => {
    await repository.replaceTeams([
      team('team-alpha', '甲队', [
        member({ id: 'member-starmie', pokemonId: 'starmie', formId: 'starmie', abilityId: undefined, itemId: 'starminite', moveIds: [], statPoints: {} }),
      ]),
    ]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '宝石海星');

    // N03-14 is a page of its own, and only exists for a species that has a Mega.
    await user.click(screen.getByRole('button', { name: '选择形态' }));
    expect(await screen.findByRole('heading', { name: '形态' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '超级宝石海星 MEGA' }));

    expect(await screen.findByRole('heading', { name: '编辑配置' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '选择形态' }).textContent).toContain('超级宝石海星');
    await waitFor(() => expect(saveButton().textContent).toContain('项改动'));
  });

  it('saves non-SP legality issues silently while keeping legalityStatus updated', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member({ abilityId: 'intimidate', itemId: undefined })])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    expect(screen.queryByText('特性与当前 Pokémon 不匹配。')).toBeNull();
    expect(screen.queryByText('校验结果')).toBeNull();
    expect(saveButton().disabled).toBe(false);

    await user.click(saveButton());
    await waitFor(() => expect(screen.queryByRole('heading', { name: '编辑配置' })).toBeNull());
    const state = await repository.loadState();
    expect(state.teams[0].members[0].legalityStatus).toBe('illegal');
  });

  it('opens the editor on its own route and leaves it again through 返回', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    expect(window.location.hash).toBe('#/teams/team-alpha/members/member-garchomp');
    // 03-01's subtitle names the roster slot, not the Pokemon.
    expect(screen.getByText('甲队 的第 1 位成员')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回队伍详情' }));
    expect(await screen.findByRole('heading', { name: '甲队' })).toBeTruthy();

    // The detail page's own 返回 must reach the list, not walk back into the editor (the editor
    // used to push the detail page again, so the two looped).
    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    expect(await screen.findByRole('heading', { name: '我的队伍' })).toBeTruthy();
    expect(window.location.hash).toBe('#/teams');
  });

  it('blocks saving while a single stat is over the per-stat SP cap', async () => {
    // Over-cap values cannot be dialled in — the rail clamps — but they do arrive from older
    // local data, so the editor has to refuse the save rather than silently truncate (N03-15).
    await repository.replaceTeams([
      team('team-alpha', '甲队', [member({ statPoints: { attack: MAX_STAT_POINTS_PER_STAT + 1 } })]),
    ]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    expect(screen.getByText(`攻击 ${MAX_STAT_POINTS_PER_STAT + 1} 超过单项上限 ${MAX_STAT_POINTS_PER_STAT}`)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('blocks saving once the SP total passes the team-wide cap, and on nothing else', async () => {
    await repository.replaceTeams([
      team('team-alpha', '甲队', [
        member({ statPoints: { attack: 32, speed: 32, hp: 1 } }),
        // A duplicate item already in local data is not a block: 03-09 turns it into a transfer.
        member({ id: 'member-incineroar', pokemonId: 'incineroar', formId: 'incineroar', abilityId: 'intimidate', moveIds: [], statPoints: {} }),
      ]),
    ]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    // The old legality panel is gone from the editor.
    expect(screen.queryByText('校验结果')).toBeNull();
    expect(screen.queryByText(/数据版本/)).toBeNull();
    expect(screen.getByText(`${MAX_TOTAL_STAT_POINTS - 1} / ${MAX_TOTAL_STAT_POINTS}`)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);

    await user.click(screen.getByRole('button', { name: '调整HP' }));
    fireEvent.change(screen.getByRole('slider', { name: 'HP SP' }), { target: { value: '3' } });

    expect(screen.getByText(`${MAX_TOTAL_STAT_POINTS + 1} / ${MAX_TOTAL_STAT_POINTS}`)).toBeTruthy();
    expect(screen.getByText('总计超了 1 点，得从任意一项减 1')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('transfers a held item off the teammate that carried it, but only on save', async () => {
    await repository.replaceTeams([
      team('team-alpha', '甲队', [
        member(),
        member({ id: 'member-incineroar', pokemonId: 'incineroar', formId: 'incineroar', abilityId: 'intimidate', itemId: undefined, moveIds: ['flare-blitz'], nature: '固执', statPoints: {} }),
      ]),
    ]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '炽焰咆哮虎');

    await user.click(screen.getByRole('button', { name: '选择道具' }));
    await user.type(await screen.findByLabelText('搜索道具名'), '气势披带');
    await user.click(await screen.findByRole('button', { name: '气势披带' }));

    // 03-09: the conflict is a confirmation, not a refusal.
    expect(screen.getByText('将从烈咬陆鲨身上移除「气势披带」')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '移除并给炽焰咆哮虎' }));
    await screen.findByRole('heading', { name: '编辑配置' });

    // Staged only — nothing has reached IndexedDB yet.
    let state = await repository.loadState();
    expect(state.teams[0].members.map((entry) => entry.itemId)).toEqual(['focus-sash', undefined]);

    await user.click(saveButton());
    await waitFor(async () => {
      state = await repository.loadState();
      expect(state.teams[0].members.map((entry) => entry.itemId)).toEqual([undefined, 'focus-sash']);
    });
  });

  it('asks once before throwing unsaved changes away', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    fireEvent.change(screen.getByRole('slider', { name: '速度 SP' }), { target: { value: '8' } });
    await user.click(screen.getByRole('button', { name: '返回队伍详情' }));

    const discard = await screen.findByRole('dialog', { name: '放弃改动确认' });
    expect(within(discard).getByText('速度 32 → 8')).toBeTruthy();
    await user.click(within(discard).getByRole('button', { name: '继续编辑' }));
    expect(screen.getByRole('heading', { name: '编辑配置' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回队伍详情' }));
    await user.click(within(await screen.findByRole('dialog', { name: '放弃改动确认' })).getByRole('button', { name: '放弃' }));

    expect(await screen.findByRole('heading', { name: '甲队' })).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams[0].members[0].statPoints.speed).toBe(32);
  });

  it('asks before the hardware back button throws a draft away, and keeps asking', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');
    fireEvent.change(screen.getByRole('slider', { name: '速度 SP' }), { target: { value: '8' } });

    act(() => window.history.back());
    const discard = await screen.findByRole('dialog', { name: '放弃改动确认' });
    expect(window.location.hash).toBe('#/teams/team-alpha/members/member-garchomp');
    await user.click(within(discard).getByRole('button', { name: '继续编辑' }));

    // A second press asks again rather than leaving: the guard entry went back on.
    act(() => window.history.back());
    await user.click(within(await screen.findByRole('dialog', { name: '放弃改动确认' })).getByRole('button', { name: '放弃' }));
    expect(await screen.findByRole('heading', { name: '甲队' })).toBeTruthy();
    expect(window.location.hash).toBe('#/teams/team-alpha');
  });

  it('closes a picker on hardware back and keeps what was already changed', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');
    fireEvent.change(screen.getByRole('slider', { name: '速度 SP' }), { target: { value: '8' } });

    await user.click(screen.getByRole('button', { name: '选择道具' }));
    await screen.findByLabelText('搜索道具名');
    act(() => window.history.back());

    expect(await screen.findByRole('heading', { name: '编辑配置' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '放弃改动确认' })).toBeNull();
    expect((screen.getByRole('slider', { name: '速度 SP' }) as HTMLInputElement).value).toBe('8');
  });

  it('leaves at once on hardware back when nothing changed', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    act(() => window.history.back());
    expect(await screen.findByRole('heading', { name: '甲队' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '放弃改动确认' })).toBeNull();
  });

  it('removes a member only after 02-14 confirms it', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByRole('menuitem', { name: '删除这个成员' }));
    const confirm = await screen.findByRole('dialog', { name: '确认移除成员' });
    expect(within(confirm).getByText('这支队伍会变成 0/6。')).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: '移除成员' }));

    expect(await screen.findByText(/0\/6 成员/)).toBeTruthy();
    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.teams[0].members).toEqual([]);
    });
    // The editor's entry is popped, not covered by a pushed detail page; history.back() is async,
    // so wait for it rather than let its popstate reach the next test.
    await waitFor(() => expect((window.history.state as { lkDepth?: number } | null)?.lkDepth ?? 0).toBe(0));
  });

  it('lists the moves on the expanded card and keeps the tool entries in the editor ⋯ menu', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');

    await user.click(await screen.findByRole('button', { name: '展开 烈咬陆鲨' }));
    const moveList = screen.getByRole('list', { name: '烈咬陆鲨 的招式' });
    expect(within(moveList).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['地震', '守住']);
    expect(screen.queryByRole('button', { name: '速度线' })).toBeNull();
    expect(screen.queryByRole('button', { name: '伤害计算' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '收起 烈咬陆鲨' }));
    expect(screen.queryByRole('list', { name: '烈咬陆鲨 的招式' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '展开 烈咬陆鲨' }));

    await user.click(screen.getByRole('button', { name: '编辑配置' }));
    await screen.findByRole('heading', { name: '编辑配置' });
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('menuitem', { name: '伤害计算' })).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: '速度线' }));

    expect(await screen.findByRole('heading', { name: '速度线' })).toBeTruthy();
  });

  it('deletes a team from the ⋯ menu only after the confirmation sheet', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()]), team('team-beta', '乙队')]);
    const user = await renderTeamList();

    await user.click(within(await openTeamMenu(user, '甲队')).getByRole('button', { name: '删除队伍' }));
    const confirm = await screen.findByRole('dialog', { name: '确认删除队伍' });
    expect(within(confirm).getByText('删除后无法恢复。')).toBeTruthy();

    // Cancelling leaves the team alone.
    await user.click(within(confirm).getByRole('button', { name: '取消' }));
    expect(await screen.findByLabelText('队伍：甲队')).toBeTruthy();

    await user.click(within(await openTeamMenu(user, '甲队')).getByRole('button', { name: '删除队伍' }));
    await user.click(within(await screen.findByRole('dialog', { name: '确认删除队伍' })).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(screen.queryByLabelText('队伍：甲队')).toBeNull());
    expect(screen.getByLabelText('队伍：乙队')).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams.map((entry) => entry.name)).toEqual(['乙队']);
  });

  it('opens a team by tapping its list card and renames it through the ⋯ menu', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamList();

    await user.click(await screen.findByLabelText('队伍：甲队'));
    expect(await screen.findByRole('heading', { name: '甲队' })).toBeTruthy();

    await user.click(within(await openTeamMenu(user, '甲队')).getByRole('button', { name: '重命名' }));
    const nameInput = screen.getByLabelText('队伍名称');
    await user.clear(nameInput);
    await user.type(nameInput, '雨天试验队{enter}');
    expect(await screen.findByRole('heading', { name: '雨天试验队' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    expect(await screen.findByLabelText('队伍：雨天试验队')).toBeTruthy();
  });

  // The preset card keeps a direct 删除 (02-02); every other card routes through the ⋯ menu.
  it('deletes the preset team from its own card after confirming', async () => {
    // A fresh database seeds the shipped preset team.
    const user = await renderTeamList();

    const presetCard = await screen.findByLabelText('队伍：Luxray test');
    await user.click(within(presetCard).getByRole('button', { name: /删除/ }));
    const confirm = await screen.findByRole('dialog', { name: '确认删除队伍' });
    expect(confirm.textContent).toContain('Luxray test');
    await user.click(within(confirm).getByRole('button', { name: '取消' }));
    expect(screen.getByLabelText('队伍：Luxray test')).toBeTruthy();

    await user.click(within(screen.getByLabelText('队伍：Luxray test')).getByRole('button', { name: /删除/ }));
    await user.click(within(await screen.findByRole('dialog', { name: '确认删除队伍' })).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(screen.queryByLabelText('队伍：Luxray test')).toBeNull());
    const state = await repository.loadState();
    expect(state.teams.some((entry) => entry.name === 'Luxray test')).toBe(false);
  });

  // The drag handle is gone (owner call, 2026-09); 移至首位 in the ⋯ menu writes the same order.
  it('moves a team to the top of the list from the ⋯ menu', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队'), team('team-beta', '乙队')]);
    const user = await renderTeamList();

    // The team already heading the list does not offer the no-op.
    expect(within(await openTeamMenu(user, '甲队')).queryByRole('button', { name: '移至首位' })).toBeNull();
    await user.click(within(screen.getByRole('dialog', { name: '甲队 的更多操作' })).getAllByRole('button', { name: '关闭' })[0]);

    await user.click(within(await openTeamMenu(user, '乙队')).getByRole('button', { name: '移至首位' }));

    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.teams.map((entry) => entry.name)).toEqual(['乙队', '甲队']);
    });
  });

  it('keeps a sheet with a field above the software keyboard', async () => {
    // The keyboard shrinks the *visual* viewport only, so a sheet pinned to the layout viewport's
    // bottom would open behind it. Every kit Sheet rides the visual viewport — the one place a
    // unit test reads inline styles (CONTRIBUTING.md).
    vi.stubGlobal('visualViewport', {
      width: 390,
      height: 500,
      offsetLeft: 0,
      offsetTop: 20,
      pageLeft: 0,
      pageTop: 20,
      scale: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as VisualViewport);
    vi.stubGlobal('innerHeight', 844);
    await repository.clearAll();
    const user = await renderTeamList();

    await user.click(await screen.findByRole('button', { name: /从空白开始/ }));
    const sheet = (await screen.findByLabelText('队伍名称')).closest('section') as HTMLElement;

    // innerHeight 844 − height 500 − offsetTop 20.
    expect(sheet.style.bottom).toBe('324px');
    expect(sheet.style.maxHeight).toBe('430px');
  });

  it(`only allows sharing once a team reaches ${TEAM_SHARE_REQUIRED_MEMBERS} members`, async () => {
    await repository.replaceTeams([team('team-partial', '半队', [member()]), team('team-full', '满队', fullRoster())]);

    await renderTeamDetail('team-partial');
    const sharePartial = (await screen.findByRole('button', { name: '分享 半队' }, { timeout: 5000 })) as HTMLButtonElement;
    expect(sharePartial.disabled).toBe(true);
    expect(screen.getByText(`还差 ${TEAM_SHARE_REQUIRED_MEMBERS - 1} 只才能分享`)).toBeTruthy();

    cleanup();

    await renderTeamDetail('team-full');
    const shareFull = (await screen.findByRole('button', { name: '分享 满队' }, { timeout: 5000 })) as HTMLButtonElement;
    expect(shareFull.disabled).toBe(false);
    expect(screen.queryByText(/才能分享/)).toBeNull();
  });

  it('hides 分享链接 from the ⋯ menu of an under-strength team', async () => {
    await repository.replaceTeams([team('team-partial', '半队', [member()]), team('team-full', '满队', fullRoster())]);
    const user = await renderTeamDetail('team-full');
    await screen.findByRole('heading', { name: '满队' }, { timeout: 5000 });

    expect(within(await openTeamMenu(user, '满队')).getByRole('button', { name: '分享链接' })).toBeTruthy();
    await user.click(within(screen.getByRole('dialog', { name: '满队 的更多操作' })).getAllByRole('button', { name: '关闭' })[0]);

    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    await user.click(await screen.findByLabelText('队伍：半队'));
    expect(within(await openTeamMenu(user, '半队')).queryByRole('button', { name: '分享链接' })).toBeNull();
  });

  it('copies a team into a new one from the ⋯ menu', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamList();

    await user.click(within(await openTeamMenu(user, '甲队')).getByRole('button', { name: '复制为新队伍' }));

    expect(await screen.findByLabelText('队伍：甲队 副本')).toBeTruthy();
    const state = await repository.loadState();
    const copy = state.teams.find((entry) => entry.name === '甲队 副本')!;
    expect(copy.id).not.toBe('team-alpha');
    expect(copy.members.map((entry) => entry.pokemonId)).toEqual(['garchomp']);
    // Fresh member ids, so editing the copy cannot write through to the original.
    expect(copy.members[0].id).not.toBe('member-garchomp');
  });

  it('imports a team from a pasted share link', async () => {
    await repository.clearAll();
    const user = await renderTeamList();
    const code = await encodeTeamShare({ name: '别人的队', members: [member()] });

    await user.click(await screen.findByRole('button', { name: /粘贴分享链接/ }));
    await user.type(await screen.findByLabelText('分享链接或分享码'), `https://example.test/#/t/${code}`);

    await screen.findByText(/识别到 1 个成员/, undefined, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: '导入' }));

    expect(await screen.findByRole('heading', { name: '别人的队' }, { timeout: 5000 })).toBeTruthy();
    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.teams.map((entry) => entry.name)).toContain('别人的队');
    });
  });

  it('will not add a second copy of a species already on the roster', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()])]);
    const user = await renderTeamDetail('team-alpha');

    await user.click((await screen.findAllByRole('button', { name: '添加成员' }, { timeout: 5000 }))[0]);
    await user.type(await screen.findByLabelText('搜索宝可梦'), 'Garchomp');

    // The row is still legible, but inert and marked.
    const picker = await screen.findByRole('dialog', { name: '添加成员' });
    expect(within(picker).getByText('已在队伍中')).toBeTruthy();
    await user.click(within(picker).getByText('烈咬陆鲨'));

    expect(screen.getByLabelText('搜索宝可梦')).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams[0].members.map((entry) => entry.pokemonId)).toEqual(['garchomp']);
  });

  it('reports a team that already breaks the composition rules instead of repairing it', async () => {
    // Exactly the 「五只轰雷金刚猩」 shape: written by an older build, never rewritten by this one.
    await repository.replaceTeams([
      team('team-dupes', '重复队', [
        member({ id: 'member-1', itemId: undefined }),
        member({ id: 'member-2', itemId: undefined }),
      ]),
    ]);
    await renderTeamDetail('team-dupes');

    expect(await screen.findByText('这支队伍有 1 处不合规', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('烈咬陆鲨在队伍里出现了不止一次。')).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams[0].members).toHaveLength(2);
  });

  it('refuses to share a full team that breaks the composition rules', async () => {
    const duplicated = fullRoster().map((entry, index) =>
      index === 0 ? entry : { ...entry, pokemonId: 'garchomp', formId: 'garchomp' },
    );
    await repository.replaceTeams([team('team-broken', '重复满队', duplicated)]);
    await renderTeamDetail('team-broken');

    const share = (await screen.findByRole('button', { name: '分享 重复满队' }, { timeout: 5000 })) as HTMLButtonElement;
    expect(share.disabled).toBe(true);
  });

  it('offers 02-01 two routes before naming a new team', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队')]);
    const user = await renderTeamList();

    await user.click(screen.getByRole('button', { name: '新建队伍' }));
    const sheet = await screen.findByRole('dialog', { name: '新建队伍' });
    // 02-01's third route — 输入队伍码 — is not one the app has.
    expect(within(sheet).queryByText(/队伍码/)).toBeNull();

    await user.click(within(sheet).getByRole('button', { name: /从空白开始/ }));
    expect(await screen.findByLabelText('队伍名称')).toBeTruthy();
  });

  it('sends 从上位构筑抄一套 to the upper-build list', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队')]);
    const user = await renderTeamList();

    await user.click(screen.getByRole('button', { name: '新建队伍' }));
    await user.click(within(await screen.findByRole('dialog', { name: '新建队伍' })).getByRole('button', { name: /从上位构筑抄一套/ }));

    expect(window.location.hash).toBe('#/env/teams');
    expect(screen.queryByRole('dialog', { name: '新建队伍' })).toBeNull();
  });

  it('honours the pre-rename preference key so the preset card does not come back', async () => {
    // Stored records written before hasSeenLuxrayEasterEgg → hasOpenedPresetTeam carry only the
    // old key; reading it as false would show the special card to every existing user again.
    const state = await repository.loadState();
    await repository.savePreferences({
      ...state.preferences,
      hasOpenedPresetTeam: undefined as unknown as boolean,
      hasSeenLuxrayEasterEgg: true,
    });
    await renderTeamList();

    const card = await screen.findByLabelText('队伍：Luxray test');
    expect(within(card).queryByText('预设')).toBeNull();
  });

  it('draws the preset team as the special card until it is opened once', async () => {
    // A fresh database seeds the shipped preset team.
    const user = await renderTeamList();

    const presetCard = await screen.findByLabelText('队伍：Luxray test');
    expect(within(presetCard).getByText('预设')).toBeTruthy();
    await user.click(within(presetCard).getByRole('button', { name: /接着补齐这支/ }));

    await screen.findByRole('heading', { name: 'Luxray test' });
    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));

    const degraded = await screen.findByLabelText('队伍：Luxray test');
    expect(within(degraded).queryByText('预设')).toBeNull();
    expect(within(degraded).queryByRole('button', { name: /接着补齐这支/ })).toBeNull();
    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.preferences.hasOpenedPresetTeam).toBe(true);
    });
  });
});
