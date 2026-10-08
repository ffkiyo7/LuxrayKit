import { describe, expect, it } from 'vitest';
import { routeTransitionKind } from './routeTransition';

describe('routeTransitionKind', () => {
  it('pushes into a child screen and pops back to its parent', () => {
    expect(routeTransitionKind('#/env', '#/env/ranking', 0, 1)).toBe('push');
    expect(routeTransitionKind('#/env/ranking', '#/env', 1, 0)).toBe('pop');
    expect(routeTransitionKind('#/teams/a', '#/teams/a/members/b', 1, 2)).toBe('push');
  });

  it('treats going up the hierarchy as a pop even when it pushes or replaces', () => {
    expect(routeTransitionKind('#/teams/a/members/b', '#/teams/a', 2, 3)).toBe('pop');
    expect(routeTransitionKind('#/profile/about', '#/profile', 0, 0)).toBe('pop');
  });

  it('never animates tab switches or same-screen changes', () => {
    expect(routeTransitionKind('#/env', '#/teams', 0, 1)).toBeNull();
    expect(routeTransitionKind('#/env/ranking', '#/tools/dex', 1, 2)).toBeNull();
    expect(routeTransitionKind('#/teams/a', '#/teams/a', 1, 2)).toBeNull();
  });

  it('falls back to history depth between siblings', () => {
    expect(routeTransitionKind('#/env/pokemon/x', '#/env/pokemon/y', 1, 2)).toBe('push');
    expect(routeTransitionKind('#/env/pokemon/y', '#/env/pokemon/x', 2, 1)).toBe('pop');
    expect(routeTransitionKind('#/env/pokemon/x', '#/env/pokemon/y', 1, 1)).toBeNull();
  });
});
