import { buildHash, parentRoute, parseHashRoute, tabForRoute, type Route } from './hashRoute';

/**
 * Which page-change animation a route change gets (HIG review item 13). `push` slides the new
 * screen in from the right, `pop` slides the current one back out; anything else — a tab switch,
 * a same-screen history layer, a jump sideways — swaps instantly, like iOS does for tabs.
 */
export type RouteTransitionKind = 'push' | 'pop' | null;

const isAncestor = (ancestor: Route, route: Route) => {
  const target = buildHash(ancestor);
  let current = route;
  // The hierarchy is at most three levels deep (team → detail → member editor).
  for (let step = 0; step < 4; step += 1) {
    const parent = parentRoute(current);
    if (parent.name === current.name) return false;
    if (buildHash(parent) === target) return true;
    current = parent;
  }
  return false;
};

/**
 * The route hierarchy decides when it can (going up to an ancestor always reads as 返回, even
 * through a push), and the history depth stamped by useHashRoute covers the rest — the browser
 * back button popping to a sibling screen, say.
 */
export function routeTransitionKind(prevHash: string, nextHash: string, prevDepth: number, nextDepth: number): RouteTransitionKind {
  const prev = parseHashRoute(prevHash);
  const next = parseHashRoute(nextHash);
  if (buildHash(prev) === buildHash(next)) return null;
  if (tabForRoute(prev) !== tabForRoute(next)) return null;
  if (isAncestor(next, prev)) return 'pop';
  if (isAncestor(prev, next)) return 'push';
  if (nextDepth > prevDepth) return 'push';
  if (nextDepth < prevDepth) return 'pop';
  return null;
}
