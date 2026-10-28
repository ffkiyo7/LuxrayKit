// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Users, Wrench } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from './BottomNav';

const tabs = [
  { id: 'teams' as const, label: '队伍', icon: Users },
  { id: 'tools' as const, label: '工具', icon: Wrench },
];

describe('BottomNav', () => {
  afterEach(cleanup);

  it('collapses in place instead of leaving the screen, and stays tappable while collapsed', () => {
    const onChange = vi.fn();
    const rendered = render(<BottomNav activeTab="tools" tabs={tabs} onChange={onChange} />);
    const nav = screen.getByRole('navigation');

    expect(nav.dataset.collapsed).toBe('false');
    // Positioning is pure CSS: no inline transform that could push the bar off-screen.
    expect(nav.style.transform).toBe('');

    rendered.rerender(<BottomNav activeTab="tools" tabs={tabs} onChange={onChange} collapsed />);

    expect(nav.dataset.collapsed).toBe('true');
    // Labels fade out visually when collapsed, so the accessible name must not depend on them.
    screen.getByRole('button', { name: '队伍' }).click();
    expect(onChange).toHaveBeenCalledWith('teams');
  });

  it('selects the tab the capsule is dragged to, without the release counting as a tap', () => {
    const onChange = vi.fn();
    render(<BottomNav activeTab="teams" tabs={tabs} onChange={onChange} />);
    const nav = screen.getByRole('navigation');
    // 204px wide: 2px padding + two 100px slots, so slot centres sit at x=52 and x=152.
    nav.getBoundingClientRect = () => ({ left: 0, width: 204 }) as DOMRect;
    const teams = screen.getByRole('button', { name: '队伍' });

    fireEvent.pointerDown(teams, { pointerId: 1, isPrimary: true, button: 0, clientX: 52 });
    fireEvent.pointerMove(nav, { pointerId: 1, isPrimary: true, clientX: 102 });
    expect(nav.dataset.dragging).toBe('true');
    expect(nav.style.getPropertyValue('--lk-nav-index')).toBe('0.5');

    fireEvent.pointerMove(nav, { pointerId: 1, isPrimary: true, clientX: 140 });
    fireEvent.pointerUp(nav, { pointerId: 1, isPrimary: true, clientX: 140 });
    fireEvent.click(teams);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('tools');
    expect(nav.dataset.dragging).toBe('false');
  });

  it('treats a press that barely moves as a tap', () => {
    const onChange = vi.fn();
    render(<BottomNav activeTab="teams" tabs={tabs} onChange={onChange} />);
    const nav = screen.getByRole('navigation');
    nav.getBoundingClientRect = () => ({ left: 0, width: 204 }) as DOMRect;
    const tools = screen.getByRole('button', { name: '工具' });

    fireEvent.pointerDown(tools, { pointerId: 1, isPrimary: true, button: 0, clientX: 152 });
    fireEvent.pointerMove(tools, { pointerId: 1, isPrimary: true, clientX: 155 });
    fireEvent.pointerUp(tools, { pointerId: 1, isPrimary: true, clientX: 155 });
    fireEvent.click(tools);

    expect(nav.dataset.dragging).toBe('false');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('tools');
  });

  it('marks the active tab for assistive tech', () => {
    render(<BottomNav activeTab="tools" tabs={tabs} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: '工具' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: '队伍' }).getAttribute('aria-current')).toBeNull();
  });
});
