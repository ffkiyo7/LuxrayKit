// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypeChartPage } from './TypeChartPage';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now() + 250), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TypeChartPage', () => {
  it('opens on the single-type tab and lists only the shelves that carry a multiplier', async () => {
    const user = userEvent.setup();
    render(<TypeChartPage environment={null} />);

    expect(screen.getByRole('heading', { name: '属性速查' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '单属性' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: '龙 · 进攻时' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '龙 · 防守时' })).toBeTruthy();

    await user.click(within(screen.getByRole('group', { name: '选择属性' })).getByRole('button', { name: '一般' }));
    expect(screen.getByRole('heading', { name: '一般 · 进攻时' })).toBeTruthy();
    expect(screen.queryByText('效果绝佳')).toBeNull();
    expect(screen.queryByText('抵抗')).toBeNull();
    expect(screen.getByText('没有效果')).toBeTruthy();
    expect(screen.getByText('免疫')).toBeTruthy();
  });

  it('groups the dual-type answer by multiplier once the second slot is filled', async () => {
    const user = userEvent.setup();
    render(<TypeChartPage environment={null} />);

    await user.click(screen.getByRole('button', { name: '双属性' }));
    // The empty secondary slot opens the rail on itself.
    expect(screen.getByText('正在选副属性')).toBeTruthy();

    await user.click(within(screen.getByRole('group', { name: '选择属性' })).getByRole('button', { name: '飞行' }));
    expect(screen.queryByText('正在选副属性')).toBeNull();
    expect(screen.getAllByText('弱点')).toHaveLength(2);
    expect(screen.getByText('×4')).toBeTruthy();
    expect(screen.getByText('×¼')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '清空副属性' }));
    expect(screen.getByText('正在选副属性')).toBeTruthy();
    expect(screen.queryByText('×4')).toBeNull();
  });

  it('shows the matrix legend until a cell is picked, then the spotlight result', async () => {
    const user = userEvent.setup();
    render(<TypeChartPage environment={null} />);

    await user.click(screen.getByRole('button', { name: '完整矩阵' }));
    expect(document.querySelectorAll('.lk-type-matrix__cell')).toHaveLength(18 * 18);
    expect(screen.getByText('效果绝佳 ×2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '火攻击水，效果不佳，×½' }));
    expect(screen.queryByText('效果绝佳 ×2')).toBeNull();
    const result = () => within(document.querySelector('section[aria-live="polite"]') as HTMLElement);
    expect(result().getByText('效果不佳')).toBeTruthy();
    expect(result().getByText('×½')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '交换攻击方与防御方' }));
    expect(result().getByText('效果绝佳')).toBeTruthy();
    expect(result().getByText('×2')).toBeTruthy();
  });
});
