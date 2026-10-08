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
import vgcPastesSamples from './data/external/vgcpastes/reg_mc_champions_mc_team_samples.json';
import { createEnvironmentStateFromPokeDbSnapshot, getEnvironmentPokemon } from './data/environment';
import { currentDataVersion, currentRuleSet } from './data';
import { repository } from './lib/db';
import type { Team, TeamMember } from './types';

/**
 * Cross-page flows only: what the shell wires between pages (tab ↔ hash routing, deep and share
 * links, the upper-build import dialog → team list highlight → toast, environment → team,
 * team member → calculator). A behaviour that lives inside one page belongs in that page's own
 * test, which renders the page directly.
 */

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
const topSinglesPokemon = getEnvironmentPokemon(testEnvironmentState.pokemonUsage.singles[0].pokemonId)!;

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

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });

const waitForDexPage = () => screen.findByText('规则内图鉴', undefined, { timeout: 5000 });
const waitForEnvironmentPage = () => screen.findByRole('heading', { name: '今日环境' }, { timeout: 5000 });

const renderApp = async () => {
  const user = userEvent.setup();
  render(<App />);
  await waitForEnvironmentPage();
  return user;
};

const renderTeamsTab = async () => {
  const user = await renderApp();
  await user.click(screen.getByRole('button', { name: '队伍' }));
  await screen.findByText('我的队伍');
  return user;
};

// The upper-build list is its own pushed page (07-01); the battle type it shows is the one
// picked on the environment home, so callers set that first.
const openUpperBuilds = async (user: ReturnType<typeof userEvent.setup>, battleType: 'singles' | 'doubles') => {
  await user.click(screen.getByRole('button', { name: battleType === 'doubles' ? '双打' : '单打' }));
  await user.click(await screen.findByRole('button', { name: '查看全部上位构筑' }));
  return screen.findByRole('region', { name: '上位构筑列表' });
};

const findSampleForImportButton = (button: HTMLElement) => {
  const card = button.closest('section') as HTMLElement | null;
  const sample = card ? testEnvironmentState.teamSamples.find((candidate) => within(card).queryByText(candidate.title)) : undefined;
  if (!sample) throw new Error('Unable to resolve visible environment sample for import button.');
  return sample;
};

const revealVisibleReplicaCodeSample = async (user: ReturnType<typeof userEvent.setup>) => {
  const region = await openUpperBuilds(user, 'doubles');
  await user.click(screen.getByRole('button', { name: /^有队伍码 / }));

  for (const heading of within(region).getAllByRole('heading', { level: 3 })) {
    const card = heading.closest('section') as HTMLElement | null;
    const sample = vgcPastesTeamSamples.find((candidate) => candidate.title === heading.textContent);
    if (card && sample?.replicaCode) return { card, sample };
  }

  throw new Error('Unable to reveal a VGCPastes sample with replica code.');
};

describe('App cross-page flows', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(pokedbSnapshot), { status: 200 })),
    );
    // Pin the team-sample shuffle seed so re-entering the 环境 page does not re-randomize order
    // between renders. Only getRandomValues is stubbed; createId relies on randomUUID.
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array) new Uint32Array(array.buffer, array.byteOffset, 1)[0] = 0x1234abcd;
      return array;
    });
    // The 数据口径 intro sheet (01-06) shows once per browser; acknowledge it up front so it
    // does not sit over every environment flow here. Its own coverage is in EnvironmentPage.test.
    window.localStorage.setItem('luxraykit.env.methodologySeen', '1');
    await deleteDb();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('boots from the local-data placeholder and drives the tabs and tools through the URL hash', { timeout: 20000 }, async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('正在载入本地数据')).toBeTruthy();
    expect(await waitForEnvironmentPage()).toBeTruthy();
    // 环境 draws its own title; the shell adds no product header.
    expect(screen.queryByText('LuxrayKit')).toBeNull();
    expect(window.location.hash).toBe('#/env');

    await user.click(screen.getByRole('button', { name: '队伍' }));
    await screen.findByText('我的队伍');
    expect(window.location.hash).toBe('#/teams');

    await user.click(screen.getByRole('button', { name: '工具' }));
    await screen.findByRole('heading', { name: '工具' });
    expect(window.location.hash).toBe('#/tools');

    await user.click(screen.getByRole('button', { name: /规则图鉴/ }));
    await waitForDexPage();
    expect(window.location.hash).toBe('#/tools/dex');

    await user.click(screen.getByRole('button', { name: '返回工具' }));
    await user.click(await screen.findByRole('button', { name: /伤害计算/ }));
    expect(await screen.findByRole('heading', { name: '伤害计算' })).toBeTruthy();
    expect(window.location.hash).toBe('#/tools/calculator');

    await user.click(screen.getByRole('button', { name: '返回工具' }));
    await user.click(await screen.findByRole('button', { name: /速度线/ }));
    // SpeedPage is lazy and gated on the async environment load.
    expect(await screen.findByRole('heading', { name: '速度线' }, { timeout: 5000 })).toBeTruthy();
    expect(window.location.hash).toBe('#/tools/speed');

    await user.click(screen.getByRole('button', { name: '我的' }));
    await screen.findByRole('heading', { name: '我的' });
    expect(window.location.hash).toBe('#/profile');
  });

  it('opens a Pokemon environment detail directly from a #/env/pokemon deep link', async () => {
    window.location.hash = '#/env/pokemon/garchomp';
    render(<App />);

    expect(await screen.findByRole('heading', { name: '烈咬陆鲨' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: '返回' })).toBeTruthy();
    // Nothing pushed this entry, so 返回 replaces into the environment home instead of
    // walking off the site.
    expect(screen.queryByRole('heading', { name: '今日环境' })).toBeNull();
  });

  it('routes every 我的 entry to its own screen and applies the theme to the document', { timeout: 15000 }, async () => {
    const user = await renderApp();
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(await screen.findByRole('heading', { name: '我的' })).toBeTruthy();

    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('switch', { name: '切换深色和浅色主题' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('switch', { name: '切换深色和浅色主题' }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: /本地备份/ }));
    expect(window.location.hash).toBe('#/profile/backup');
    expect(await screen.findByRole('button', { name: '导出 JSON' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '返回' }));

    await user.click(await screen.findByRole('button', { name: /关于与数据/ }));
    expect(window.location.hash).toBe('#/profile/about');
    expect(await screen.findByRole('button', { name: '清除本地数据' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '返回' }));

    await user.click(await screen.findByRole('button', { name: /当前规则/ }));
    expect(window.location.hash).toBe('#/profile/rule');
    expect(await screen.findByRole('heading', { name: currentRuleSet.name })).toBeTruthy();
    expect(document.title.startsWith('当前规则 · ')).toBe(true);
    // The copy is still under owner review: these strings must survive the restyle verbatim.
    expect(screen.getByText('规则周期')).toBeTruthy();
    expect(screen.getByText('暂不支持远程刷新')).toBeTruthy();
    expect(screen.getByText('当前版本使用本地 seed 数据，远程官方数据刷新入口将在接入审核流程后开放。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '返回' }));

    await user.click(await screen.findByRole('button', { name: /留言/ }));
    expect(window.location.hash).toBe('#/profile/feedback');
    // FeedbackSheet is lazy-loaded; on the default 1000ms this flaked on a loaded build machine.
    const sheet = await screen.findByRole('dialog', { name: '写留言' }, { timeout: 5000 });
    expect(within(sheet).getByLabelText('留言内容')).toBeTruthy();
    // 返回 closes the sheet without leaving the profile tab.
    await user.click(within(sheet).getAllByRole('button', { name: '关闭留言' })[1]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '写留言' })).toBeNull());
    expect(window.location.hash).toBe('#/profile');
  });

  it('previews a #/t/<code> share link and imports it into the team list', { timeout: 20000 }, async () => {
    const { encodeTeamShare } = await import('./lib/teamShare');
    const shared = testTeam('分享来的队', [garchompMember()]);
    // jsdom has no CompressionStream, so this exercises the uncompressed `p1` path — the
    // decoder accepts either prefix, which is the point of having both.
    window.location.hash = `#/t/${await encodeTeamShare(shared)}`;

    const user = userEvent.setup();
    render(<App />);

    const dialog = await screen.findByRole('dialog', { name: '分享的队伍' }, { timeout: 10000 });
    expect(await within(dialog).findByRole('heading', { name: '分享来的队' })).toBeTruthy();
    expect(within(dialog).getByText('烈咬陆鲨')).toBeTruthy();
    expect(within(dialog).getByText(/粗糙皮肤 · 磁铁 · 爽朗/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: /导入到我的队伍/ }));

    expect(await screen.findByRole('heading', { name: '分享来的队' })).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toContain('已导入分享队伍');
    await waitFor(async () => {
      const state = await repository.loadState();
      const imported = state.teams.find((team) => team.name === '分享来的队');
      expect(imported?.source?.kind).toBe('share-link-import');
      expect(imported?.members[0].pokemonId).toBe('garchomp');
    });

    await user.click(screen.getByRole('button', { name: '返回队伍列表' }));
    expect(await screen.findByLabelText('队伍：分享来的队')).toBeTruthy();
  });

  it('explains a corrupt share link instead of rendering a blank overlay', async () => {
    window.location.hash = '#/t/z1notarealcode';
    render(<App />);

    // 08-10: a link that cannot be decoded has nothing to preview, so it takes the whole screen.
    const dialog = await screen.findByRole('dialog', { name: '分享链接已失效' }, { timeout: 10000 });
    expect(await within(dialog).findByRole('heading', { name: '链接已失效' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /导入到我的队伍/ })).toBeNull();
  });

  it('copies a share URL from a full team when the platform has no share sheet', async () => {
    // Only a 6/6 team can be shared, so seed one rather than using the single-member preset.
    await repository.replaceTeams([
      testTeam(
        '满员队',
        ['garchomp', 'incineroar', 'luxray', 'charizard', 'whimsicott', 'gholdengo'].map((pokemonId) =>
          garchompMember({ id: `member-${pokemonId}`, pokemonId, formId: pokemonId, abilityId: undefined, itemId: undefined, moveIds: [], statPoints: {} }),
        ),
      ),
    ]);
    const user = await renderTeamsTab();
    // userEvent.setup() installs its own clipboard stub, so override it *after* rendering.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(await screen.findByLabelText('队伍：满员队'));
    await screen.findByRole('heading', { name: '满员队' });

    await user.click(screen.getByRole('button', { name: '分享 满员队' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const sharedUrl = writeText.mock.calls[0][0] as string;
    expect(sharedUrl.startsWith(`${window.location.origin}/#/t/`)).toBe(true);
    expect((await screen.findByRole('status')).textContent).toContain('链接已复制');

    const { decodeTeamShare } = await import('./lib/teamShare');
    const decoded = await decodeTeamShare(sharedUrl.split('/#/t/')[1]);
    expect(decoded.name).toBe('满员队');
    expect(decoded.members[0].pokemonId).toBe('garchomp');
  });

  it('asks before an upper-build import, then highlights the new team with a toast', async () => {
    const user = await renderApp();
    // Upper-build defaults to 双打; exercise the singles samples this fixture is rich in.
    const region = await openUpperBuilds(user, 'singles');
    const importButton = within(region).getAllByRole('button', { name: '导入为我的队伍' })[0];
    const importedSample = findSampleForImportButton(importButton);

    // Dismissing the dialog imports nothing.
    await user.click(importButton);
    const cancelled = await screen.findByRole('dialog', { name: '导入确认' });
    await user.click(within(cancelled).getAllByRole('button', { name: '关闭导入确认' })[0]);
    expect(screen.queryByRole('dialog', { name: '导入确认' })).toBeNull();
    expect(screen.queryByLabelText(`队伍：${importedSample.title}`)).toBeNull();

    await user.click(importButton);
    const dialog = await screen.findByRole('dialog', { name: '导入确认' });
    expect(dialog.textContent).toContain('这份样本可带入宝可梦、道具、SP 分配。');
    await user.click(within(dialog).getByRole('button', { name: '继续导入' }));

    expect((await screen.findByRole('status')).textContent).toContain(`已导入「${importedSample.title}」`);
    expect(window.location.hash).toBe('#/teams');
    const importedCard = await screen.findByLabelText(`队伍：${importedSample.title}`);
    expect(importedCard.dataset.importHighlighted).toBe('true');
    expect(importedCard.textContent).toContain(`${importedSample.slots.length}/6 成员`);
    expect(importedCard.textContent).not.toContain('上位构筑导入');

    await waitFor(() => expect(importedCard.dataset.importHighlighted).toBeUndefined(), { timeout: 3500 });
    expect(screen.queryByRole('status')).toBeNull();

    // The detail carries no source card for an imported sample.
    await user.click(importedCard);
    expect(await screen.findByRole('heading', { name: importedSample.title })).toBeTruthy();
    expect(screen.queryByText(/来源|原始样本|高分导入|上位构筑导入/)).toBeNull();
  });

  it('imports a VGCPastes sample and copies its replica code from the team detail', { timeout: 30000 }, async () => {
    const user = await renderApp();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const { card: sampleCard, sample: replicaCodeSample } = await revealVisibleReplicaCodeSample(user);
    await user.click(within(sampleCard).getByRole('button', { name: '导入为我的队伍' }));
    const dialog = await screen.findByRole('dialog', { name: '导入确认' });
    expect(dialog.textContent).toContain(`导入「${replicaCodeSample.title}」`);
    // A fully covered sample lists its counts and nothing else: no 配招未公开, no 无队伍码.
    expect(dialog.textContent).not.toContain('配招未公开');
    expect(dialog.textContent).not.toContain('无队伍码');
    await user.click(within(dialog).getByRole('button', { name: '继续导入' }));

    // The real VGCPastes fixture is large; allow the environment list to unmount first.
    await user.click(await screen.findByLabelText(`队伍：${replicaCodeSample.title}`, undefined, { timeout: 10000 }));
    expect(await screen.findByRole('heading', { name: replicaCodeSample.title })).toBeTruthy();
    expect(screen.getByText(replicaCodeSample.replicaCode!)).toBeTruthy();

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

  it('adds a top-60 Pokemon from its environment detail to a team with its most popular config', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '单打' }));
    await user.click(
      within(screen.getByText('使用排行').closest('section') as HTMLElement).getByRole('button', {
        name: new RegExp(topSinglesPokemon.chineseName),
      }),
    );
    await user.click(await screen.findByRole('button', { name: '按热门配置加入队伍' }));

    // Which team it lands in is always asked; the preset team is the only one here.
    const picker = await screen.findByRole('dialog', { name: `把${topSinglesPokemon.chineseName}加入哪支队伍` });
    await user.click(within(picker).getByRole('button', { name: /Luxray test/ }));
    expect((await screen.findByRole('status')).textContent).toContain('已加入Luxray test');

    await waitFor(async () => {
      const state = await repository.loadState();
      const added = state.teams[0].members.find((member) => member.pokemonId === topSinglesPokemon.id);
      expect(added).toBeTruthy();
      // SP stays blank by design; the popular item comes from the snapshot's rank-1 entry.
      expect(Object.values(added!.statPoints).every((value) => !value)).toBe(true);
      expect(added!.itemId).toBe(testEnvironmentState.pokemonUsage.singles[0].itemStats?.[0]?.id);
    });
  });

  it('takes a team member into the calculator without writing calculator edits back to the team', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '工具' }));
    await user.click(await screen.findByRole('button', { name: /伤害计算/ }));
    expect(await screen.findByRole('heading', { name: '伤害计算' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '选择进攻方' }));
    // 从队伍选择 is the picker's last section, so the saved build is the last match (05-04).
    await user.click((await screen.findAllByRole('button', { name: '伦琴猫' })).at(-1)!);

    await user.click(screen.getByRole('button', { name: '编辑进攻方配置' }));
    await user.click(screen.getByRole('button', { name: '调整HP' }));
    fireEvent.change(screen.getByRole('slider', { name: 'HP SP' }), { target: { value: '12' } });
    await user.click(screen.getByRole('button', { name: '完成' }));

    await user.click(screen.getByRole('button', { name: '队伍' }));
    const presetCard = await screen.findByLabelText('队伍：Luxray test');
    // Until it has been opened once the preset team is 02-02's special card, entered by its CTA.
    await user.click(within(presetCard).getByRole('button', { name: /接着补齐这支/ }));
    await screen.findByRole('heading', { name: 'Luxray test' });

    await user.click(screen.getByRole('button', { name: '展开 伦琴猫' }));
    expect(screen.getByText(/已投 SP 65\/66/)).toBeTruthy();
    const state = await repository.loadState();
    expect(state.teams[0].members[0].statPoints.hp).toBe(1);
  });
});
