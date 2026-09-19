// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readToolResults } from '../lib/toolActivity';
import { environmentFallbackState, type EnvironmentState } from '../data/environment';
import { currentDataVersion, currentRuleSet } from '../data';
import type { Team } from '../types';
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

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const teamWithFastLeadoff = (): Team => ({
  id: 'team-speed-bug',
  name: '速度线回归队',
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  createdAt: '2026-06-24T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
  notes: '',
  members: [
    {
      id: 'member-garchomp',
      pokemonId: 'garchomp',
      formId: 'garchomp',
      abilityId: 'rough-skin',
      itemId: 'choice-scarf',
      moveIds: [],
      nature: '爽朗',
      statPoints: { speed: 4 },
      level: 50,
      notes: '',
      legalityStatus: 'legal',
    },
  ],
});

describe('SpeedPage', () => {
  it('opens on a neutral default instead of inheriting the active team first member', () => {
    // Regression: opening the tool used to seed SP/nature/scarf from activeTeam.members[0].
    render(<SpeedPage environment={environment} activeTeam={teamWithFastLeadoff()} />);

    // Neutral default (max SP, no speed nature), not the member's 4 SP / 爽朗 / choice-scarf.
    expect(screen.getByRole('slider', { name: '速度 SP' }).getAttribute('value')).toBe('32');
    expect(screen.getByRole('button', { name: '＋ 速度性格' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('switch', { name: '讲究围巾' }).getAttribute('aria-checked')).toBe('false');
  });

  it('updates the final speed and the axis marker from SP and nature controls', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} />);

    expect(screen.getByRole('heading', { name: '速度线' })).toBeTruthy();
    const slider = screen.getByRole('slider', { name: '速度 SP' });
    expect(slider.getAttribute('value')).toBe('32');
    const marker = document.querySelector('[data-speed-marker]') as HTMLElement;
    const initialSpeed = marker.textContent;

    fireEvent.change(slider, { target: { value: '0' } });
    expect(slider.getAttribute('value')).toBe('0');
    expect((document.querySelector('[data-speed-marker]') as HTMLElement).textContent).not.toBe(initialSpeed);

    await user.click(screen.getByRole('button', { name: '＋ 速度性格' }));
    expect(screen.getByRole('button', { name: '＋ 速度性格' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('applies a speed-up toggle to the final speed', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} />);

    const before = Number((document.querySelector('[data-speed-marker]') as HTMLElement).textContent?.match(/\d+/)?.[0]);
    await user.click(screen.getByRole('switch', { name: '顺风' }));
    const after = Number((document.querySelector('[data-speed-marker]') as HTMLElement).textContent?.match(/\d+/)?.[0]);

    expect(after).toBe(before * 2);
  });

  it('searches by English name and opens an outspeed plan from a reference tier', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} />);

    await user.type(screen.getByRole('textbox', { name: '搜索宝可梦' }), 'Staraptor');
    await user.click(screen.getByRole('button', { name: '姆克鹰 Staraptor' }));
    expect(screen.queryByText(/个结果/)).toBeNull();

    const tierButton = screen.getAllByRole('button', { name: /^超速 / }).find((button) => button.textContent?.includes('153'));
    expect(tierButton).toBeTruthy();
    await user.click(tierButton!);
    expect(screen.getByRole('dialog', { name: /^超速 / })).toBeTruthy();
    const applyButtons = screen.getAllByRole('button', { name: '应用此方案' });
    expect(applyButtons.length).toBeGreaterThan(0);
    await user.click(applyButtons[0]);
    expect(screen.queryByRole('dialog', { name: /^超速 / })).toBeNull();
    expect(screen.getByRole('button', { name: '＋ 速度性格' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('records the chosen member for the tools landing, but not the neutral default', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} />);

    expect(readToolResults()).toEqual([]);

    await user.type(screen.getByRole('textbox', { name: '搜索宝可梦' }), 'Staraptor');
    await user.click(screen.getByRole('button', { name: '姆克鹰 Staraptor' }));

    await waitFor(
      () => {
        const [result] = readToolResults();
        expect(result).toMatchObject({ tool: 'speed', label: '姆克鹰' });
        expect(result.tool === 'speed' && result.window?.length).toBeGreaterThan(1);
      },
      { timeout: 3000 },
    );
  });

  it('explains a name that is outside the current rule instead of showing an empty list', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} onOpenDex={vi.fn()} />);

    await user.type(screen.getByRole('textbox', { name: '搜索宝可梦' }), '不存在的宝可梦');

    expect(screen.getByText('0 个结果')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '当前规则里没有这只' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /显示全部/ }));
    expect((screen.getByRole('textbox', { name: '搜索宝可梦' }) as HTMLInputElement).value).toBe('');
  });

  it('does not render the Mega Z placeholder 151-family tier on either axis', async () => {
    const user = userEvent.setup();
    render(<SpeedPage environment={environment} />);

    expect(screen.queryByRole('button', { name: /种族151/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '单打' }));
    expect(screen.queryByRole('button', { name: /种族151/ })).toBeNull();
  });
});
