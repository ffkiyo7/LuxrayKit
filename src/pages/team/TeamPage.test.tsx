// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import singleRankedTeams from '../../data/external/pokedb/s1_single_ranked_teams.json';
import doubleRankedTeams from '../../data/external/pokedb/s1_double_ranked_teams.json';
import { currentDataVersion, currentRuleSet } from '../../data';
import { repository } from '../../lib/db';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS } from '../../lib/statPoints';
import type { Team, TeamMember } from '../../types';

/**
 * The team editor is the app's core flow and had no test file of its own (App.test.tsx covers
 * a few slices of it end-to-end). These mount the real <App/> — TeamPage needs AppContext,
 * IndexedDB and hash routing — but every case starts from teams seeded straight into the
 * repository, so they never depend on the shipped starter team.
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

/** Render the app already on the teams tab (list view). */
const renderTeamList = async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: '环境' }, { timeout: 5000 });
  await user.click(screen.getByRole('button', { name: '队伍' }));
  await screen.findByText('我的队伍');
  return user;
};

/** Render the app deep-linked at a team's detail route, the way a bookmark or reload does. */
const renderTeamDetail = async (teamId: string) => {
  const user = userEvent.setup();
  window.history.replaceState(null, '', `#/teams/${teamId}`);
  render(<App />);
  return user;
};

const openMemberEditor = async (user: ReturnType<typeof userEvent.setup>, memberName: string) => {
  await user.click(await screen.findByText(memberName));
  await user.click(await screen.findByTitle('编辑成员'));
  await screen.findByText('编辑成员');
};

const saveButton = () => screen.getByRole('button', { name: '保存' }) as HTMLButtonElement;

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
    expect(within(screen.getByLabelText('队伍：甲队')).getByText('1/6 成员')).toBeTruthy();
    expect(within(screen.getByLabelText('队伍：乙队')).getByText('0/6 成员')).toBeTruthy();
  });

  it('creates a team through the 新建 modal and opens its detail', async () => {
    // clearAll (not replaceTeams([])) — it also marks the DB initialized, so loadState does
    // not re-seed the shipped starter team underneath us.
    await repository.clearAll();
    const user = await renderTeamList();

    expect(await screen.findByText('还没有队伍')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /新建第一支队伍/ }));

    // The modal pre-fills a name so a user can just confirm; overwrite it to prove the input works.
    const nameInput = await screen.findByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, '新生代');
    await user.click(screen.getByRole('button', { name: '确认' }));

    expect(await screen.findByRole('heading', { name: '新生代' })).toBeTruthy();
    expect(screen.getByText('0/6 成员')).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams.map((entry) => entry.name)).toContain('新生代');
  });

  it('refuses to confirm an all-whitespace team name', async () => {
    await repository.clearAll();
    const user = await renderTeamList();

    await user.click(await screen.findByRole('button', { name: /新建第一支队伍/ }));
    const nameInput = await screen.findByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, '   ');

    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens a team detail straight from the #/teams/:teamId route', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()]), team('team-beta', '乙队')]);
    await renderTeamDetail('team-beta');

    expect(await screen.findByRole('heading', { name: '乙队' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('0/6 成员')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '甲队' })).toBeNull();
  });

  it('adds a member through 添加 Pokémon and shows it on the team', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队')]);
    const user = await renderTeamDetail('team-alpha');

    await user.click(await screen.findByRole('button', { name: /添加 Pokémon/ }, { timeout: 5000 }));
    await user.type(await screen.findByPlaceholderText('搜索 Pokémon 名称...'), 'Garchomp');
    await user.click(await screen.findByText('烈咬陆鲨'));

    expect(await screen.findByText('1/6 成员')).toBeTruthy();
    await waitFor(async () => {
      const state = await repository.loadState();
      expect(state.teams[0].members.map((entry) => entry.pokemonId)).toEqual(['garchomp']);
    });
  });

  it('blocks saving while a single stat is over the per-stat SP cap', async () => {
    // Over-cap values cannot be typed in — the picker clamps — but they do arrive from older
    // local data, so the editor has to refuse the save rather than silently truncate.
    await repository.replaceTeams([
      team('team-alpha', '甲队', [member({ statPoints: { attack: MAX_STAT_POINTS_PER_STAT + 1 } })]),
    ]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    expect(screen.getByText(`攻击 SP 不能超过 ${MAX_STAT_POINTS_PER_STAT}。`)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('blocks saving once the SP total passes the team-wide cap', async () => {
    await repository.replaceTeams([
      team('team-alpha', '甲队', [member({ statPoints: { attack: 32, speed: 32, hp: 1 } })]),
    ]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    expect(screen.getByText(`已用 ${MAX_TOTAL_STAT_POINTS - 1}/${MAX_TOTAL_STAT_POINTS}`)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);

    await user.click(screen.getAllByRole('button', { name: /HP\s*1/ }).at(-1)!);
    fireEvent.change(screen.getByRole('slider', { name: 'HP SP' }), { target: { value: '3' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));

    expect(screen.getByText(`已用 ${MAX_TOTAL_STAT_POINTS + 1}/${MAX_TOTAL_STAT_POINTS}`)).toBeTruthy();
    expect(screen.getByText(`单项最多 ${MAX_STAT_POINTS_PER_STAT}，总量最多 ${MAX_TOTAL_STAT_POINTS}。`)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('flags a held item another member of the same team already carries', async () => {
    await repository.replaceTeams([
      team('team-alpha', '甲队', [
        member(),
        member({ id: 'member-incineroar', pokemonId: 'incineroar', formId: 'incineroar', abilityId: 'intimidate', moveIds: ['flare-blitz'], nature: '固执', statPoints: {} }),
      ]),
    ]);
    const user = await renderTeamDetail('team-alpha');
    await openMemberEditor(user, '烈咬陆鲨');

    expect(screen.getByText('当前规则不允许同队重复携带相同道具。')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('deletes a team only after the confirmation dialog', async () => {
    await repository.replaceTeams([team('team-alpha', '甲队', [member()]), team('team-beta', '乙队')]);
    const user = await renderTeamList();

    await user.click(within(await screen.findByLabelText('队伍：甲队')).getByRole('button', { name: '删除 甲队' }));
    const dialog = await screen.findByRole('dialog', { name: '确认删除队伍' });
    expect(within(dialog).getByText(/确定删除「甲队」吗/)).toBeTruthy();

    // Cancelling leaves the team alone.
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(await screen.findByLabelText('队伍：甲队')).toBeTruthy();

    await user.click(within(screen.getByLabelText('队伍：甲队')).getByRole('button', { name: '删除 甲队' }));
    await user.click(within(await screen.findByRole('dialog', { name: '确认删除队伍' })).getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(screen.queryByLabelText('队伍：甲队')).toBeNull());
    expect(screen.getByLabelText('队伍：乙队')).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams.map((entry) => entry.name)).toEqual(['乙队']);
  });

  it('disables 分享 for an empty team and enables it once a member exists', async () => {
    await repository.replaceTeams([team('team-empty', '空队'), team('team-alpha', '甲队', [member()])]);

    await renderTeamDetail('team-empty');
    const shareEmpty = (await screen.findByRole('button', { name: '分享 空队' }, { timeout: 5000 })) as HTMLButtonElement;
    expect(shareEmpty.disabled).toBe(true);
    expect(shareEmpty.title).toBe('空队伍无法分享');

    cleanup();

    await renderTeamDetail('team-alpha');
    const shareFilled = (await screen.findByRole('button', { name: '分享 甲队' }, { timeout: 5000 })) as HTMLButtonElement;
    expect(shareFilled.disabled).toBe(false);
    expect(shareFilled.title).toBe('分享队伍');
  });
});
