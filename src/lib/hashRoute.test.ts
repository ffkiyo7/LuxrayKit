import { describe, expect, it } from 'vitest';
import {
  buildHash,
  defaultRoute,
  parentRoute,
  parseHashRoute,
  routeForTab,
  routePattern,
  routePatterns,
  tabForRoute,
  type Route,
} from './hashRoute';

const roundtrip = (route: Route) => parseHashRoute(buildHash(route));

describe('parseHashRoute', () => {
  it('maps every documented path onto its route', () => {
    expect(parseHashRoute('#/env')).toEqual({ name: 'env' });
    expect(parseHashRoute('#/env/ranking')).toEqual({ name: 'env-ranking' });
    expect(parseHashRoute('#/env/methodology')).toEqual({ name: 'env-methodology' });
    expect(parseHashRoute('#/env/teams')).toEqual({ name: 'env-teams' });
    expect(parseHashRoute('#/env/pokemon/garchomp')).toEqual({ name: 'env-pokemon', pokemonId: 'garchomp' });
    expect(parseHashRoute('#/teams')).toEqual({ name: 'teams' });
    expect(parseHashRoute('#/teams/team-1')).toEqual({ name: 'team-detail', teamId: 'team-1' });
    expect(parseHashRoute('#/tools')).toEqual({ name: 'tools' });
    expect(parseHashRoute('#/tools/calculator')).toEqual({ name: 'tool', tool: 'calculator' });
    expect(parseHashRoute('#/tools/dex')).toEqual({ name: 'tool', tool: 'dex' });
    expect(parseHashRoute('#/tools/dex/mega-starmie')).toEqual({ name: 'dex-pokemon', pokemonId: 'mega-starmie' });
    expect(parseHashRoute('#/tools/speed')).toEqual({ name: 'tool', tool: 'speed' });
    expect(parseHashRoute('#/tools/typechart')).toEqual({ name: 'tool', tool: 'typechart' });
    expect(parseHashRoute('#/profile')).toEqual({ name: 'profile' });
    expect(parseHashRoute('#/t/z1abc')).toEqual({ name: 'share', code: 'z1abc' });
  });

  it('tolerates a missing hash prefix, trailing slashes and a query suffix', () => {
    expect(parseHashRoute('/env/ranking')).toEqual({ name: 'env-ranking' });
    expect(parseHashRoute('#/env/ranking/')).toEqual({ name: 'env-ranking' });
    expect(parseHashRoute('#/teams/team-1?from=share')).toEqual({ name: 'team-detail', teamId: 'team-1' });
  });

  it('falls back to the home route for empty and unknown hashes', () => {
    expect(parseHashRoute('')).toEqual(defaultRoute);
    expect(parseHashRoute(undefined)).toEqual(defaultRoute);
    expect(parseHashRoute('#')).toEqual(defaultRoute);
    expect(parseHashRoute('#/')).toEqual(defaultRoute);
    expect(parseHashRoute('#/nope')).toEqual(defaultRoute);
    expect(parseHashRoute('#/env/nope')).toEqual(defaultRoute);
    expect(parseHashRoute('#/env/pokemon')).toEqual(defaultRoute);
    expect(parseHashRoute('#/env/ranking/extra')).toEqual(defaultRoute);
    expect(parseHashRoute('#/tools/nope')).toEqual(defaultRoute);
    expect(parseHashRoute('#/tools/speed/extra')).toEqual(defaultRoute);
    expect(parseHashRoute('#/teams/a/b')).toEqual(defaultRoute);
    expect(parseHashRoute('#/profile/extra')).toEqual(defaultRoute);
    expect(parseHashRoute('#/t')).toEqual(defaultRoute);
  });
});

describe('buildHash', () => {
  it('round-trips ids that need percent-encoding', () => {
    const ids = ['garchomp', 'team-中文 名', 'a/b', 'a?b#c', 'a%2Fb', '100%'];
    ids.forEach((id) => {
      expect(roundtrip({ name: 'env-pokemon', pokemonId: id })).toEqual({ name: 'env-pokemon', pokemonId: id });
      expect(roundtrip({ name: 'team-detail', teamId: id })).toEqual({ name: 'team-detail', teamId: id });
      expect(roundtrip({ name: 'dex-pokemon', pokemonId: id })).toEqual({ name: 'dex-pokemon', pokemonId: id });
    });
  });

  it('keeps a share code intact through encode/decode', () => {
    const code = 'z1AbC-_09xyz';
    expect(buildHash({ name: 'share', code })).toBe(`#/t/${code}`);
    expect(roundtrip({ name: 'share', code })).toEqual({ name: 'share', code });
  });

  it('always emits a #/-prefixed path', () => {
    const routes: Route[] = [
      { name: 'env' },
      { name: 'env-ranking' },
      { name: 'env-methodology' },
      { name: 'env-teams' },
      { name: 'env-pokemon', pokemonId: 'x' },
      { name: 'teams' },
      { name: 'team-detail', teamId: 'x' },
      { name: 'tools' },
      { name: 'tool', tool: 'typechart' },
      { name: 'dex-pokemon', pokemonId: 'x' },
      { name: 'profile' },
      { name: 'share', code: 'x' },
    ];
    routes.forEach((route) => {
      expect(buildHash(route).startsWith('#/')).toBe(true);
      expect(parseHashRoute(buildHash(route))).toEqual(route);
    });
  });
});

describe('parentRoute', () => {
  it('walks second-level screens back to their tab root', () => {
    expect(parentRoute({ name: 'env-ranking' })).toEqual({ name: 'env' });
    expect(parentRoute({ name: 'env-pokemon', pokemonId: 'x' })).toEqual({ name: 'env' });
    expect(parentRoute({ name: 'team-detail', teamId: 'x' })).toEqual({ name: 'teams' });
    expect(parentRoute({ name: 'tool', tool: 'speed' })).toEqual({ name: 'tools' });
    expect(parentRoute({ name: 'dex-pokemon', pokemonId: 'x' })).toEqual({ name: 'tool', tool: 'dex' });
  });

  it('sends a cold-opened share link to the team list', () => {
    expect(parentRoute({ name: 'share', code: 'z1abc' })).toEqual({ name: 'teams' });
  });

  it('leaves tab roots where they are', () => {
    expect(parentRoute({ name: 'env' })).toEqual({ name: 'env' });
    expect(parentRoute({ name: 'profile' })).toEqual({ name: 'profile' });
  });
});

describe('tabForRoute / routeForTab', () => {
  it('groups routes under the right bottom tab', () => {
    expect(tabForRoute({ name: 'env-pokemon', pokemonId: 'x' })).toBe('environment');
    expect(tabForRoute({ name: 'team-detail', teamId: 'x' })).toBe('teams');
    expect(tabForRoute({ name: 'share', code: 'x' })).toBe('teams');
    expect(tabForRoute({ name: 'dex-pokemon', pokemonId: 'x' })).toBe('tools');
    expect(tabForRoute({ name: 'profile' })).toBe('profile');
  });

  it('round-trips a tab through its root route', () => {
    (['environment', 'teams', 'tools', 'profile'] as const).forEach((tab) => {
      expect(tabForRoute(routeForTab(tab))).toBe(tab);
    });
  });
});

describe('routePattern', () => {
  it('strips ids so analytics never sees a team id or share code', () => {
    expect(routePattern({ name: 'env-pokemon', pokemonId: 'garchomp' })).toBe('/env/pokemon/:id');
    expect(routePattern({ name: 'team-detail', teamId: 'team-secret' })).toBe('/teams/:id');
    expect(routePattern({ name: 'dex-pokemon', pokemonId: 'garchomp' })).toBe('/tools/dex/:id');
    expect(routePattern({ name: 'share', code: 'z1payload' })).toBe('/t/:code');
    expect(routePattern({ name: 'tool', tool: 'typechart' })).toBe('/tools/typechart');
  });

  it('only emits patterns the Worker allowlist knows', () => {
    const routes: Route[] = [
      { name: 'env' },
      { name: 'env-ranking' },
      { name: 'env-methodology' },
      { name: 'env-teams' },
      { name: 'env-pokemon', pokemonId: 'x' },
      { name: 'teams' },
      { name: 'team-detail', teamId: 'x' },
      { name: 'tools' },
      { name: 'tool', tool: 'calculator' },
      { name: 'tool', tool: 'dex' },
      { name: 'tool', tool: 'speed' },
      { name: 'tool', tool: 'typechart' },
      { name: 'dex-pokemon', pokemonId: 'x' },
      { name: 'profile' },
      { name: 'share', code: 'x' },
    ];
    const emitted = new Set(routes.map(routePattern));
    expect([...emitted].sort()).toEqual([...routePatterns].sort());
  });
});
