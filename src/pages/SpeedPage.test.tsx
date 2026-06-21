// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { environmentFallbackState, type EnvironmentState } from '../data/environment';
import { SpeedPage } from './SpeedPage';

const environment: EnvironmentState = {
  ...environmentFallbackState,
  pokemonUsage: {
    singles: environmentFallbackState.pokemonUsage.singles,
    doubles: [
      ...environmentFallbackState.pokemonUsage.doubles.filter((usage) => usage.pokemonId !== 'staraptor'),
      {
        pokemonId: 'staraptor',
        usageRate: 20,
        teamCount: 20,
        moveIds: [],
        itemIds: ['choice-scarf'],
        teammateIds: [],
        itemStats: [{ id: 'choice-scarf', usageRate: 18, teamCount: 10 }],
      },
    ],
  },
};

afterEach(cleanup);

describe('SpeedPage', () => {
  it('updates the real axis marker from SP and nature controls', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} />);

    expect(screen.getByRole('heading', { name: '速度线' })).toBeTruthy();
    const slider = screen.getByRole('slider', { name: '速度 SP' });
    expect(slider.getAttribute('value')).toBe('32');
    const marker = document.querySelector('[data-speed-marker]') as HTMLElement;
    const initialTop = marker.style.top;

    fireEvent.change(slider, { target: { value: '0' } });
    expect(slider.getAttribute('value')).toBe('0');
    expect(marker.style.top).not.toBe(initialTop);

    await user.click(screen.getByRole('button', { name: '+ 速度性格' }));
    expect(screen.getByRole('button', { name: '+ 速度性格' }).getAttribute('aria-pressed')).toBe('true');

    const axis = document.querySelector('[data-speed-axis]') as HTMLElement;
    Object.defineProperty(axis, 'clientHeight', { configurable: true, value: 340 });
    axis.scrollTop = 0;
    fireEvent.scroll(axis);
    expect(screen.getByRole('button', { name: '跳回我那只，位于下方' })).toBeTruthy();
  });

  it('searches by English name and opens an outspeed plan from a reference tier', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} />);

    await user.click(screen.getByRole('button', { name: '搜索宝可梦' }));
    await user.type(screen.getByRole('textbox', { name: '搜索宝可梦' }), 'Staraptor');
    const staraptorResult = screen.getByText('Staraptor').closest('button');
    expect(staraptorResult).toBeTruthy();
    await user.click(staraptorResult!);

    const tierButton = screen.getAllByRole('button', { name: /^超速 / }).find((button) => button.textContent?.includes('153'));
    expect(tierButton).toBeTruthy();
    await user.click(tierButton!);
    expect(screen.getByRole('dialog', { name: /^超速 / })).toBeTruthy();
    const applyButtons = screen.getAllByRole('button', { name: '应用此方案' });
    expect(applyButtons.length).toBeGreaterThan(0);
    await user.click(applyButtons[0]);
    expect(screen.queryByRole('dialog', { name: /^超速 / })).toBeNull();
    expect(screen.getByRole('button', { name: '+ 速度性格' }).getAttribute('aria-pressed')).toBe('true');
  });
});
