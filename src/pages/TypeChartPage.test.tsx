// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypeChartPage, placeOnArc } from './TypeChartPage';

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
  it('opens in quick mode on fire with only the two group titles', () => {
    render(<TypeChartPage />);

    expect(screen.getByRole('heading', { name: '属性速查' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '速查' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('slider', { name: '选择属性' }).getAttribute('aria-valuetext')).toBe('火属性');
    expect(screen.getByRole('heading', { name: '进攻' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '防守' })).toBeTruthy();
    expect(screen.queryByText('攻击视角')).toBeNull();
    expect(screen.queryByText('受到攻击时')).toBeNull();
  });

  it('omits empty shelves for normal type', () => {
    render(<TypeChartPage />);
    fireEvent.keyDown(screen.getByRole('slider', { name: '选择属性' }), { key: 'Home' });

    expect(screen.getByRole('slider', { name: '选择属性' }).getAttribute('aria-valuetext')).toBe('一般属性');
    expect(screen.queryByText('效果绝佳')).toBeNull();
    expect(screen.queryByText('抵抗')).toBeNull();
    expect(screen.getByText('没有效果')).toBeTruthy();
    expect(screen.getByText('免疫')).toBeTruthy();
  });

  it('uses relationship badges and keyboard arrows to navigate the shared quick selection', async () => {
    const user = userEvent.setup();
    render(<TypeChartPage />);

    await user.click(screen.getAllByRole('button', { name: '查看水属性速查' })[0]);
    expect(screen.getByRole('slider', { name: '选择属性' }).getAttribute('aria-valuetext')).toBe('水属性');

    fireEvent.keyDown(screen.getByRole('slider', { name: '选择属性' }), { key: 'ArrowRight' });
    expect(screen.getByRole('slider', { name: '选择属性' }).getAttribute('aria-valuetext')).toBe('电属性');
  });

  it('renders the full matrix without the prototype position track or legend and updates the result', async () => {
    const user = userEvent.setup();
    render(<TypeChartPage />);

    await user.click(screen.getByRole('button', { name: '完整矩阵' }));
    expect(document.querySelectorAll('.lk-type-matrix__cell')).toHaveLength(18 * 18);
    expect(screen.queryByText(/\/ 18/)).toBeNull();
    expect(screen.queryByLabelText('倍率说明')).toBeNull();

    await user.click(screen.getByRole('button', { name: '火攻击水，效果不佳，×½' }));
    expect(screen.getByText(/效果不佳 ×½/)).toBeTruthy();
  });
});

describe('placeOnArc', () => {
  it('places the zero-degree item at the apex and hides items past the visible boundary', () => {
    const apex = placeOnArc(0, 380);
    expect(apex.x).toBeCloseTo(0);
    expect(apex.y).toBeCloseTo(36);
    expect(apex.opacity).toBe(1);

    expect(placeOnArc(30, 380).opacity).toBe(0);
    expect(placeOnArc(31, 380).visible).toBe(false);
  });
});
