// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordToolResult } from '../lib/toolActivity';
import { ToolsPage } from './ToolsPage';

const renderPage = () => render(<ToolsPage onOpenDexEntry={vi.fn()} onOpenTool={vi.fn()} />);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe('ToolsPage', () => {
  it('leaves a tool card bare when that tool has no recorded result', () => {
    renderPage();

    expect(screen.getByText('伤害计算')).toBeTruthy();
    expect(screen.queryByText('上次')).toBeNull();
    expect(screen.queryByText('我的成员')).toBeNull();
    expect(screen.queryByRole('heading', { name: '最近用过' })).toBeNull();
  });

  it('phrases the last calculator run from the stored numbers', () => {
    recordToolResult({
      tool: 'calculator',
      label: '喷火龙',
      minDamage: 148,
      maxDamage: 176,
      minPercent: 73.6,
      maxPercent: 87.6,
      hko: '确定两击击杀',
    });
    renderPage();

    expect(screen.getByText('上次')).toBeTruthy();
    expect(screen.getByText(/148/)).toBeTruthy();
    expect(screen.getByText('确定两击击杀 · 87.6%')).toBeTruthy();
    expect(screen.getByText('伤害计算 · 进攻方')).toBeTruthy();
  });

  it('shows the speed line result and drops the tier advice when none was recorded', () => {
    recordToolResult({ tool: 'speed', label: '烈咬陆鲨', speed: 154, window: [160, 154, 150], windowIndex: 1 });
    renderPage();

    expect(screen.getByText('我的成员')).toBeTruthy();
    expect(screen.getByText('154')).toBeTruthy();
    expect(screen.queryByText(/档需/)).toBeNull();
    expect(screen.getByText('速度线 · 154')).toBeTruthy();
  });

  it('reads the type chart headline off the recorded type', () => {
    recordToolResult({ tool: 'typeChart', type: 'Fairy' });
    renderPage();

    expect(screen.getByText(/妖精/).textContent?.replace(/\s+/g, ' ')).toContain('妖精 打 格斗 ×2 · 挨 毒 ×2');
  });
});
