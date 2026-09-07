/**
 * Hash routing — pure parse/build helpers.
 *
 * The app deliberately avoids react-router: the whole surface is four bottom tabs plus a
 * handful of second-level screens, so a discriminated union plus two pure functions covers
 * it without the bundle cost. Everything URL-shaped lives here; `hooks/useHashRoute.ts`
 * owns the browser wiring.
 *
 * Only *navigational* state belongs in a Route. Filters, search boxes, battle-type toggles
 * and member-editor overlays stay local component state — they are cheap to re-pick and
 * would otherwise turn every keystroke into a history entry.
 */

export type ToolRouteId = 'calculator' | 'dex' | 'speed' | 'typechart';

export type Route =
  | { name: 'env' }
  | { name: 'env-ranking' }
  | { name: 'env-methodology' }
  | { name: 'env-teams' }
  | { name: 'env-pokemon'; pokemonId: string }
  | { name: 'teams' }
  | { name: 'team-detail'; teamId: string }
  | { name: 'tools' }
  | { name: 'tool'; tool: ToolRouteId }
  | { name: 'dex-pokemon'; pokemonId: string }
  | { name: 'profile' }
  | { name: 'profile-feedback' }
  | { name: 'share'; code: string };

export type RouteTabId = 'environment' | 'teams' | 'tools' | 'profile';

export const defaultRoute: Route = { name: 'env' };

const toolRouteIds: ToolRouteId[] = ['calculator', 'dex', 'speed', 'typechart'];

const isToolRouteId = (value: string): value is ToolRouteId => (toolRouteIds as string[]).includes(value);

// Ids reach us percent-encoded, so decode *after* splitting on "/" — an id that itself
// contains a slash stays inside its own segment instead of forking the path.
const decodeSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const encodeSegment = (value: string) => encodeURIComponent(value);

/** Parse a `location.hash` value into a Route. Anything unknown falls back to the home route. */
export function parseHashRoute(hash: string | undefined | null): Route {
  const raw = (hash ?? '').replace(/^#/, '');
  const [pathname = ''] = raw.split('?');
  const segments = pathname.split('/').filter(Boolean).map(decodeSegment);

  if (segments.length === 0) return defaultRoute;

  const [first, second, third] = segments;

  if (first === 'env') {
    if (!second) return { name: 'env' };
    if (second === 'ranking' && !third) return { name: 'env-ranking' };
    if (second === 'methodology' && !third) return { name: 'env-methodology' };
    if (second === 'teams' && !third) return { name: 'env-teams' };
    if (second === 'pokemon' && third) return { name: 'env-pokemon', pokemonId: third };
    return defaultRoute;
  }

  if (first === 'teams') {
    if (!second) return { name: 'teams' };
    if (!third) return { name: 'team-detail', teamId: second };
    return defaultRoute;
  }

  if (first === 'tools') {
    if (!second) return { name: 'tools' };
    if (second === 'dex' && third) return { name: 'dex-pokemon', pokemonId: third };
    if (isToolRouteId(second) && !third) return { name: 'tool', tool: second };
    return defaultRoute;
  }

  if (first === 'profile') {
    if (!second) return { name: 'profile' };
    if (second === 'feedback' && !third) return { name: 'profile-feedback' };
    return defaultRoute;
  }

  if (first === 't' && second && !third) return { name: 'share', code: second };

  return defaultRoute;
}

/** Serialize a Route back into a `location.hash` value (always `#/`-prefixed). */
export function buildHash(route: Route): string {
  switch (route.name) {
    case 'env':
      return '#/env';
    case 'env-ranking':
      return '#/env/ranking';
    case 'env-methodology':
      return '#/env/methodology';
    case 'env-teams':
      return '#/env/teams';
    case 'env-pokemon':
      return `#/env/pokemon/${encodeSegment(route.pokemonId)}`;
    case 'teams':
      return '#/teams';
    case 'team-detail':
      return `#/teams/${encodeSegment(route.teamId)}`;
    case 'tools':
      return '#/tools';
    case 'tool':
      return `#/tools/${route.tool}`;
    case 'dex-pokemon':
      return `#/tools/dex/${encodeSegment(route.pokemonId)}`;
    case 'profile':
      return '#/profile';
    case 'profile-feedback':
      return '#/profile/feedback';
    case 'share':
      return `#/t/${encodeSegment(route.code)}`;
  }
}

/**
 * Where a 「返回」 button lands when there is no in-app history to pop (deep link / share
 * link opened cold). Keeps the back affordance from throwing the user off the site.
 */
export function parentRoute(route: Route): Route {
  switch (route.name) {
    case 'env-ranking':
    case 'env-methodology':
    case 'env-teams':
    case 'env-pokemon':
      return { name: 'env' };
    case 'team-detail':
    case 'share':
      return { name: 'teams' };
    case 'tool':
      return { name: 'tools' };
    case 'dex-pokemon':
      return { name: 'tool', tool: 'dex' };
    case 'profile-feedback':
      return { name: 'profile' };
    default:
      return route;
  }
}

/** Which bottom tab a route belongs to. Share links live under 队伍. */
export function tabForRoute(route: Route): RouteTabId {
  switch (route.name) {
    case 'env':
    case 'env-ranking':
    case 'env-methodology':
    case 'env-teams':
    case 'env-pokemon':
      return 'environment';
    case 'teams':
    case 'team-detail':
    case 'share':
      return 'teams';
    case 'tools':
    case 'tool':
    case 'dex-pokemon':
      return 'tools';
    case 'profile':
    case 'profile-feedback':
      return 'profile';
  }
}

/** Root route for a bottom tab. */
export function routeForTab(tab: RouteTabId): Route {
  switch (tab) {
    case 'environment':
      return { name: 'env' };
    case 'teams':
      return { name: 'teams' };
    case 'tools':
      return { name: 'tools' };
    case 'profile':
      return { name: 'profile' };
  }
}

/**
 * Parameter-free shape of a route, e.g. `/env/pokemon/:id`. This — and only this — is what
 * the anonymous page-view ping reports; concrete ids (team ids, share codes) never leave
 * the device.
 */
export function routePattern(route: Route): string {
  switch (route.name) {
    case 'env':
      return '/env';
    case 'env-ranking':
      return '/env/ranking';
    case 'env-methodology':
      return '/env/methodology';
    case 'env-teams':
      return '/env/teams';
    case 'env-pokemon':
      return '/env/pokemon/:id';
    case 'teams':
      return '/teams';
    case 'team-detail':
      return '/teams/:id';
    case 'tools':
      return '/tools';
    case 'tool':
      return `/tools/${route.tool}`;
    case 'dex-pokemon':
      return '/tools/dex/:id';
    case 'profile':
      return '/profile';
    case 'profile-feedback':
      return '/profile/feedback';
    case 'share':
      return '/t/:code';
  }
}

/** Every pattern `routePattern` can emit — the Worker validates `/api/ping` against this. */
export const routePatterns: string[] = [
  '/env',
  '/env/ranking',
  '/env/methodology',
  '/env/teams',
  '/env/pokemon/:id',
  '/teams',
  '/teams/:id',
  '/tools',
  ...toolRouteIds.map((tool) => `/tools/${tool}`),
  '/tools/dex/:id',
  '/profile',
  '/profile/feedback',
  '/t/:code',
];
