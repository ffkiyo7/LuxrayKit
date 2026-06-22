// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Wrench } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav';

const tabs = [{ id: 'tools' as const, label: '工具', icon: Wrench }];

describe('BottomNav', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty('--lk-bottom-nav-offset');
  });

  it('keeps shown and hidden positions independent of visual viewport offsets', () => {
    const rendered = render(
      <BottomNav activeTab="tools" tabs={tabs} onChange={() => {}} />,
    );
    const nav = screen.getByRole('navigation');

    expect(nav.style.bottom).toBe('0px');
    expect(nav.style.transform).toBe('translate3d(0, 0, 0)');

    rendered.rerender(
      <BottomNav activeTab="tools" tabs={tabs} onChange={() => {}} hidden />,
    );

    expect(nav.style.transform).toBe('translate3d(0, 100%, 0)');
    expect(document.documentElement.style.getPropertyValue('--lk-bottom-nav-offset')).toBe('');
  });
});
