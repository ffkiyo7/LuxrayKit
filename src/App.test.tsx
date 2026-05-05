// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

const DB_NAME = 'pokemon-champions-assistant';

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
  await screen.findByText('我的队伍');
  return user;
};

describe('App page flows', () => {
  beforeEach(async () => {
    await deleteDb();
  });

  afterEach(() => {
    cleanup();
  });

  it('navigates bottom tabs and opens the rule detail page', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '计算' }));
    expect(await screen.findByText('伤害计算')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '图鉴' }));
    expect(await screen.findByText('规则内图鉴')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '组队' }));
    await user.click(screen.getByText('官方数据源状态可追溯'));
    expect(await screen.findByText('规则周期')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /返回/ }));
    expect(await screen.findByText('我的队伍')).toBeTruthy();
  });

  it('creates and switches teams, then expands and collapses a member card', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: /新建/ }));
    await user.type(screen.getByPlaceholderText(/输入队伍名称/), '测试队');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(await screen.findByText(/0\/6 成员/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'M-A 测试队' }));
    expect(await screen.findByText(/2\/6 成员/)).toBeTruthy();

    await user.click(screen.getByText('烈咬陆鲨'));
    expect(await screen.findByText('示例能力值')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /能力配置/ }));
    expect(await screen.findByText('编辑成员')).toBeTruthy();
    await user.click(screen.getByTitle('关闭'));

    await user.click(screen.getByTitle('收起成员'));
    expect(screen.queryByText('示例能力值')).toBeNull();
  });

  it('keeps member editing focused on the selected Pokemon, moves, nature, item, ability, and six SP fields', { timeout: 15000 }, async () => {
    const user = await renderApp();

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

    expect(await screen.findByText(/2\/6 成员/)).toBeTruthy();
    await user.click(screen.getAllByTitle('删除成员')[0]);
    expect(await screen.findByText(/1\/6 成员/)).toBeTruthy();
  });

  it('creates a team after all teams have been deleted', async () => {
    const user = await renderApp();

    await user.click(screen.getByTitle('删除队伍'));
    expect(await screen.findByText('还没有队伍')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '新建第一支队伍' }));
    await user.type(screen.getByPlaceholderText(/输入队伍名称/), '重建队伍');
    await user.click(screen.getByRole('button', { name: '确认' }));

    expect(await screen.findByText('重建队伍')).toBeTruthy();
    expect(screen.getByText(/0\/6 成员/)).toBeTruthy();
  });

  it('allows real editing of temporary config: SP, nature, item, and move changes persist', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '计算' }));
    expect(await screen.findByText('选择进攻方')).toBeTruthy();

    // Verify mandatory UI labels
    expect(screen.getAllByText(/Champions SP/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Lv.50 固定/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/手动临时配置/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/临时修改不会自动保存/)).toBeTruthy();
    expect(screen.queryByText('努力值')).toBeNull();
    expect(screen.getByText('实验性伤害计算')).toBeTruthy();
    expect(screen.getAllByText(/非官方 Champions 正式结论/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/实验性计算说明/)).toBeTruthy();
    expect(screen.getByText(/Champions 伤害公式尚未/)).toBeTruthy();
    expect(screen.queryByText(/% -/)).toBeNull();

    // Expand attacker config
    const editBtns = screen.getAllByTitle('编辑能力配置');
    await user.click(editBtns[0]);
    expect(await screen.findByText(/Champions SP 分配/)).toBeTruthy();
    expect(screen.getByText(/临时修改不会自动保存到队伍/)).toBeTruthy();

    // ── Test SP editing: HP was 2, change to 8 through the picker ──
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(screen.getByRole('button', { name: /HP\s*2/ }));
    const hpSlider = screen.getByRole('slider', { name: 'HP SP' });
    expect(hpSlider.getAttribute('max')).toBe('32');
    expect(screen.getByRole('button', { name: 'min' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'max' })).toBeTruthy();
    fireEvent.change(hpSlider, { target: { value: '8' } });
    expect((hpSlider as HTMLInputElement).value).toBe('8');
    await user.click(screen.getByTitle('关闭 SP 调整'));
    expect(screen.getByText(/Champions SP 已用 72\/66/)).toBeTruthy();
    expect(screen.getByText(/SP 分配不合法/)).toBeTruthy();
    expect(screen.getByText(/当前组合无法进行实验性计算/)).toBeTruthy();

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
    await user.click(screen.getByRole('button', { name: /防御\s*17/ }));
    const defenderDefenseSlider = screen.getByRole('slider', { name: '防御 SP' });
    fireEvent.change(defenderDefenseSlider, { target: { value: '20' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));
    expect(screen.getByText(/Champions SP 已用 69\/66/)).toBeTruthy();
  });

  it('shows team-member config source and preserves original team data after edits', async () => {
    const user = await renderApp();

    // Expand Garchomp member card on the team page
    await user.click(screen.getByText('烈咬陆鲨'));

    // Click "→ 伤害计算" button to open calculator with this team member
    const calcBtn = screen.getByRole('button', { name: /伤害计算/ });
    await user.click(calcBtn);

    // Now on calculator page — should show garchomp and team-member config
    expect(await screen.findByText('伤害计算')).toBeTruthy();
    // The attacker card should reference Garchomp (team member Pokemon)
    const garchompElements = screen.getAllByText(/烈咬陆鲨/);
    expect(garchompElements.length).toBeGreaterThanOrEqual(1);

    // The config source should eventually show team-member source
    // (useEffect applies it after mount; wait for it)
    await screen.findByText(/来自队伍配置/);

    // Expand the attacker config and edit SP
    const editBtns = screen.getAllByTitle('编辑能力配置');
    await user.click(editBtns[0]);
    await screen.findByText(/Champions SP 分配/);

    await user.click(screen.getByRole('button', { name: /HP\s*\d+/ }));
    const hpSlider = screen.getByRole('slider', { name: 'HP SP' });
    fireEvent.change(hpSlider, { target: { value: '12' } });
    await user.click(screen.getByTitle('关闭 SP 调整'));

    // Should now show "已修改未保存"
    expect(screen.getByText(/已修改未保存/)).toBeTruthy();

    // Navigate back to team page
    await user.click(screen.getByRole('button', { name: '组队' }));
    expect(await screen.findByText('我的队伍')).toBeTruthy();

    // Expand member again — the team page is functional
    await user.click(screen.getByText('烈咬陆鲨'));
    expect(screen.getByText(/能力配置/)).toBeTruthy();
    expect(screen.getByText(/HP\+1/)).toBeTruthy();
    expect(screen.queryByText(/HP\+12/)).toBeNull();
  });

  it('selects both calculator sides from searchable Pokemon and team recommendations', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '计算' }));
    expect(await screen.findByText('选择进攻方')).toBeTruthy();
    expect(screen.getByText('当前队伍推荐')).toBeTruthy();
    expect(screen.queryByText('小顿熊')).toBeNull();

    // Switch to defender and pick from search
    await user.click(screen.getByRole('button', { name: /防守方/ }));
    expect(await screen.findByText('选择防守方')).toBeTruthy();
    const selector = screen.getByText('选择防守方').closest('section');
    expect(selector).toBeTruthy();

    const garchompBtn = within(selector as HTMLElement).getByRole('button', { name: /烈咬陆鲨/ });
    await user.click(garchompBtn);
    await user.type(screen.getByPlaceholderText('搜索名称'), 'Torkoal');
    await user.click(within(selector as HTMLElement).getByText('煤炭龟'));

    // Verify damage is gated instead of showing untrusted ranges.
    expect(screen.getByText('实验性伤害计算')).toBeTruthy();
    expect(screen.getByText(/Champions 伤害公式尚未/)).toBeTruthy();
    expect(screen.queryByText(/% -/)).toBeNull();
  });

  it('filters the Pokedex Pokemon list by up to two selected types', { timeout: 15000 }, async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '图鉴' }));
    expect(await screen.findByText('规则内图鉴')).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索名称')).toBeTruthy();
    expect(screen.getByText('超级烈咬陆鲨')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /属性：全部/ }));
    await user.click(screen.getByRole('button', { name: /^火属性$/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getAllByText('炽焰咆哮虎').length).toBeGreaterThan(0);
    expect(screen.getByText('煤炭龟')).toBeTruthy();
    expect(screen.getAllByText('喷火龙').length).toBeGreaterThan(0);
    expect(screen.queryByText('蚊香蛙皇')).toBeNull();

    await user.click(screen.getByRole('button', { name: /属性：火/ }));
    await user.click(screen.getByRole('button', { name: /^飞行属性$/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getAllByText('喷火龙').length).toBeGreaterThan(0);
    expect(screen.queryByText('炽焰咆哮虎')).toBeNull();
    expect(screen.queryByText('煤炭龟')).toBeNull();

    await user.click(screen.getByRole('button', { name: '清空' }));
    await user.click(screen.getByRole('button', { name: /属性：全部/ }));
    await user.click(screen.getByRole('button', { name: /^地面属性$/ }));
    await user.click(screen.getByRole('button', { name: /^龙属性$/ }));
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getAllByText('烈咬陆鲨').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('龙属性').length).toBeGreaterThan(0);

    await user.click(screen.getByText('烈咬陆鲨'));
    expect(await screen.findByText('Garchomp')).toBeTruthy();
    const detailAvatarSrc = screen.getAllByAltText('烈咬陆鲨')[0].getAttribute('src');
    expect(detailAvatarSrc).toContain('/assets/pokemon/thumbs/');
    await user.click(screen.getByRole('button', { name: '切日文' }));
    expect(await screen.findByText('ガブリアス')).toBeTruthy();
    expect(screen.getAllByText('特性').length).toBeGreaterThan(0);
    expect(screen.getByText('种族值')).toBeTruthy();
    expect(screen.getByText('当前规则可学会招式')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /查看烈咬陆鲨大图/ }));
    const imageDialog = screen.getByRole('dialog', { name: /烈咬陆鲨大图/ });
    expect(imageDialog).toBeTruthy();
    const artworkSrc = within(imageDialog).getByRole('img', { name: '烈咬陆鲨' }).getAttribute('src');
    expect(artworkSrc).toContain('/assets/pokemon/artwork/');
    expect(detailAvatarSrc?.match(/\/(\d+)\.png$/)?.[1]).toBe(artworkSrc?.match(/\/(\d+)\.png$/)?.[1]);
    await user.click(screen.getByTitle('关闭'));
    await user.click(screen.getByRole('button', { name: /当前规则可学会招式/ }));
    expect(screen.queryByText('示例待补齐')).toBeNull();
    expect(screen.getByRole('button', { name: '属性' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '性质' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '威力' }));
    expect(screen.getByText('龙爪')).toBeTruthy();
    expect(screen.getByText('属性相克')).toBeTruthy();
  });

  it('filters Pokedex moves, items, and abilities with the shared search box', { timeout: 15000 }, async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '图鉴' }));
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

    await user.type(screen.getByPlaceholderText('搜索名称'), 'Dragon');
    expect(screen.getByText(/龙爪 Dragon Claw/)).toBeTruthy();
    expect(screen.queryByText(/守住 Protect/)).toBeNull();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
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
    expect(await screen.findByText('Mega Venusaur')).toBeTruthy();
    expect(screen.getByText('种族值')).toBeTruthy();
  });

  it('uses Mega form stats on the speed line when selected', async () => {
    const user = await renderApp();

    await user.click(screen.getByRole('button', { name: '速度线' }));
    expect(await screen.findByText('最终速度')).toBeTruthy();
    await user.selectOptions(screen.getByDisplayValue('原始形态'), 'mega-garchomp');

    expect(screen.getByText('Mega 形态')).toBeTruthy();
    expect(screen.getByText('基础速度 92 · 性格×1.1 · SP+32')).toBeTruthy();
    expect(screen.getAllByText('158').length).toBeGreaterThan(0);
  });
});
