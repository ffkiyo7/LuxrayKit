// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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

  it('marks the active tab for assistive tech', () => {
    render(<BottomNav activeTab="tools" tabs={tabs} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: '工具' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: '队伍' }).getAttribute('aria-current')).toBeNull();
  });
});
