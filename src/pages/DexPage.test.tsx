// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { primeKeyboard } from '../lib/keyboardHandoff';
import { getDexFormEntries } from '../lib/pokemonForms';
import { AppProvider } from '../state/AppContext';
import { DexPage } from './DexPage';

const first = getDexFormEntries()[0];

beforeEach(() => {
  window.location.hash = '#/tools/dex';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DexPage scroll position', () => {
  it('opens a detail at the top and returns to the row it was opened from', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(
      <AppProvider>
        <DexPage onOpenCalculator={vi.fn()} />
      </AppProvider>,
    );

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1840 });
    await user.click(screen.getAllByRole('button', { name: new RegExp(first.chineseName) })[0]);

    await screen.findByRole('button', { name: '返回图鉴列表' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0 });

    await user.click(screen.getByRole('button', { name: '返回图鉴列表' }));
    await screen.findByRole('button', { name: new RegExp(first.chineseName) });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1840, left: 0 });
  });
});

describe('DexPage search focus', () => {
  const renderDex = () =>
    render(
      <AppProvider>
        <DexPage onOpenCalculator={vi.fn()} />
      </AppProvider>,
    );

  it('takes the keyboard over from the stand-in input a tap on 工具 raised', () => {
    primeKeyboard();
    const standIn = document.activeElement;
    expect(standIn?.tagName).toBe('INPUT');

    renderDex();

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '搜索图鉴' }));
    expect(standIn?.isConnected).toBe(false);
  });

  it('leaves the search field alone when opened any other way', () => {
    renderDex();
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: '搜索图鉴' }));
  });
});

describe('DexPage lists and filters', () => {
  const renderDex = async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <DexPage onOpenCalculator={vi.fn()} />
      </AppProvider>,
    );
    await screen.findByText('规则内图鉴');
    return user;
  };

  it('filters the Pokemon list by up to two selected types and opens a detail', { timeout: 30000 }, async () => {
    const user = await renderDex();

    expect(screen.getByText(/规则数据 · 宝可梦 \d+ · 招式 \d+ · 道具 \d+ · 特性 \d+/)).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索名称')).toBeTruthy();
    expect(screen.getByText('超级烈咬陆鲨')).toBeTruthy();

    // The inline filter panel (N04-05) stays open while you pick, and the list updates live.
    await user.click(screen.getByRole('button', { name: '属性' }));
    await user.click(screen.getByRole('button', { name: /^火属性$/ }));
    expect(screen.getAllByText('炽焰咆哮虎').length).toBeGreaterThan(0);
    expect(screen.getByText('煤炭龟')).toBeTruthy();
    expect(screen.getAllByText('喷火龙').length).toBeGreaterThan(0);
    expect(screen.queryByText('蚊香蛙皇')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^飞行属性$/ }));
    expect(screen.getAllByText('喷火龙').length).toBeGreaterThan(0);
    expect(screen.queryByText('炽焰咆哮虎')).toBeNull();
    expect(screen.queryByText('煤炭龟')).toBeNull();

    // N04-06: each active filter is a removable chip above the panel.
    await user.click(screen.getByRole('button', { name: '移除火属性筛选' }));
    await user.click(screen.getByRole('button', { name: '移除飞行属性筛选' }));
    await user.click(screen.getByRole('button', { name: /^地面属性$/ }));
    await user.click(screen.getByRole('button', { name: /^龙属性$/ }));
    expect(screen.getAllByText('烈咬陆鲨').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '收起筛选' }));
    expect(screen.queryByRole('button', { name: /^龙属性$/ })).toBeNull();

    await user.click(screen.getByText('烈咬陆鲨'));
    expect(await screen.findByText(/ガブリアス/)).toBeTruthy();
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
    const artworkSrc = within(imageDialog).getByRole('img', { name: '烈咬陆鲨' }).getAttribute('src');
    expect(artworkSrc).toContain('/assets/pokemon/artwork/');
    expect(detailAvatarSrc?.match(/\/(\d+)\.png$/)?.[1]).toBe(artworkSrc?.match(/\/(\d+)\.png$/)?.[1]);
    await user.click(screen.getByRole('button', { name: '关闭大图' }));
    expect(screen.getByRole('button', { name: '属性' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '威力 ↑' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '威力 ↓' }));
    // The learnset opens on its first 8 rows; 龙爪 sits further down until the list is unfolded.
    expect(screen.queryByText('龙爪')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^展开.+说明$/ })).toHaveLength(8);
    await user.click(screen.getByRole('button', { name: /^展开全部 \d+ 个$/ }));
    expect(screen.getByText('龙爪')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.queryByText('龙爪')).toBeNull();
    // A search shows every hit, folded or not.
    await user.type(screen.getByLabelText('搜索当前宝可梦招式'), '龙爪');
    expect(screen.getByText('龙爪')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^展开全部/ })).toBeNull();
    expect(screen.getByText('属性关系')).toBeTruthy();
  });

  it('filters moves, items, and abilities with the shared search box', { timeout: 30000 }, async () => {
    const user = await renderDex();

    await user.click(screen.getByRole('button', { name: '道具' }));
    await user.type(screen.getByPlaceholderText('搜索名称'), '围巾');
    expect(screen.getByText('讲究围巾')).toBeTruthy();
    expect(screen.getByAltText('讲究围巾').getAttribute('src')).toContain('/assets/items/choice-scarf.png');
    expect(screen.queryByText('文柚果')).toBeNull();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.click(screen.getByRole('button', { name: '类别' }));
    // 04-07 draws six categories and a row of 「效果」 chips; the catalog only carries these three.
    expect(['常规道具', '树果', 'Mega 进化石'].map((label) => screen.getByRole('button', { name: label }).textContent)).toEqual([
      '常规道具57',
      '树果28',
      'Mega 进化石81',
    ]);
    await user.click(screen.getByRole('button', { name: '树果' }));
    expect(screen.getByText('文柚果')).toBeTruthy();
    expect(screen.queryByText('讲究围巾')).toBeNull();
    expect(screen.queryByText('烈咬陆鲨进化石')).toBeNull();

    await user.type(screen.getByPlaceholderText('搜索名称'), 'HP');
    expect(screen.getByText('文柚果')).toBeTruthy();
    expect(screen.queryByText('大根茎')).toBeNull();
    await user.clear(screen.getByPlaceholderText('搜索名称'));

    await user.click(screen.getByRole('button', { name: '常规道具' }));
    expect(screen.getByText('讲究围巾')).toBeTruthy();
    expect(screen.getByText('文柚果')).toBeTruthy();
    expect(screen.queryByText('烈咬陆鲨进化石')).toBeNull();
    await user.click(screen.getByRole('button', { name: '移除树果筛选' }));
    await user.click(screen.getByRole('button', { name: '移除常规道具筛选' }));
    expect(screen.getByText('烈咬陆鲨进化石')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '招式' }));
    const firstNormalMoveRow = screen.getByText('百万吨重踢').closest('button')!;
    const firstPoisonMoveRow = screen.getByText('溶化').closest('button')!;
    expect(firstNormalMoveRow.compareDocumentPosition(firstPoisonMoveRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '筛选' }));
    await user.click(screen.getByRole('button', { name: /^毒属性招式$/ }));
    expect(screen.queryByText('百万吨重踢')).toBeNull();
    expect(screen.getByText('溶化')).toBeTruthy();
    // The category filter counts within the picked type.
    await user.click(screen.getByRole('button', { name: '变化招式' }));
    expect(screen.getByText('溶化')).toBeTruthy();
    expect(screen.queryByText('污泥炸弹')).toBeNull();
    await user.click(screen.getByRole('button', { name: '移除变化分类筛选' }));

    await user.type(screen.getByPlaceholderText('搜索名称'), 'Dragon');
    expect(screen.queryByText('龙爪')).toBeNull();
    expect(screen.queryByText('守住')).toBeNull();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.click(screen.getByRole('button', { name: '移除毒属性筛选' }));
    await user.click(screen.getByRole('button', { name: '特性' }));
    const aftermathRow = screen.getByText('引爆').closest('button')!;
    const analyticRow = screen.getByText('分析').closest('button')!;
    const bigPecksRow = screen.getByText('健壮胸肌').closest('button')!;
    expect(aftermathRow.compareDocumentPosition(analyticRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(analyticRow.compareDocumentPosition(bigPecksRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByPlaceholderText('搜索名称'), '威吓');
    expect(screen.queryByText('精神力')).toBeNull();
    expect(screen.queryByText('猛火')).toBeNull();
    expect(screen.queryByText('出场时威吓对手，让其退缩，降低对手的攻击。')).toBeNull();
    // 04-08 previews a single owner until the row is opened.
    expect(screen.queryByText('炽焰咆哮虎')).toBeNull();
    await user.click(screen.getByRole('button', { name: '展开威吓说明' }));
    const intimidateRow = screen.getByRole('button', { name: '收起威吓说明' }).parentElement!;
    expect(within(intimidateRow).getByText('出场时威吓对手，让其退缩，降低对手的攻击。')).toBeTruthy();
    expect(within(intimidateRow).getByText('炽焰咆哮虎')).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.type(screen.getByPlaceholderText('搜索名称'), '引火');
    expect(screen.queryByText('火暴兽')).toBeNull();
    await user.click(screen.getByRole('button', { name: '展开引火说明' }));
    const flashFireRow = screen.getByRole('button', { name: '收起引火说明' }).parentElement!;
    expect(within(flashFireRow).getByText('火暴兽')).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.type(screen.getByPlaceholderText('搜索名称'), '厚脂肪');
    await user.click(screen.getByRole('button', { name: '展开厚脂肪说明' }));
    const thickFatRow = screen.getByRole('button', { name: '收起厚脂肪说明' }).parentElement!;
    expect(within(thickFatRow).getByText('超级妙蛙花')).toBeTruthy();
    expect(within(thickFatRow).queryByText(/^妙蛙花$/)).toBeNull();
    await user.click(within(thickFatRow).getByRole('button', { name: /超级妙蛙花/ }));
    expect(await screen.findByText('超级妙蛙花')).toBeTruthy();
    expect(screen.getByText('种族值')).toBeTruthy();
  });

  it('finds abilities by owner Pokemon names and leads with the matching owner avatar', { timeout: 30000 }, async () => {
    const user = await renderDex();

    await user.click(screen.getByRole('button', { name: '特性' }));
    await user.type(screen.getByPlaceholderText('搜索名称'), 'Luxray');

    const intimidateRow = await screen.findByRole('button', { name: '展开威吓说明' });
    // The collapsed row stacks up to three owners; the one that matched the search leads.
    expect(within(intimidateRow).getAllByRole('img')[0].getAttribute('alt')).toBe('伦琴猫');
    expect(screen.queryByText('厚脂肪')).toBeNull();

    await user.clear(screen.getByPlaceholderText('搜索名称'));
    await user.type(screen.getByPlaceholderText('搜索名称'), '烈咬陆鲨');
    expect(await screen.findByText('沙隐')).toBeTruthy();
    expect(await screen.findByText('粗糙皮肤')).toBeTruthy();
  });
});
