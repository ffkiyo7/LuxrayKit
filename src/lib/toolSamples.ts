/**
 * What 04-01's tool cards show before the user has run anything: a worked example per card,
 * labelled 「示例」, so a first-time tools page reads as "this is what this tool tells you"
 * instead of three empty panels.
 *
 * The damage figures are **frozen numbers, not a live calculation**: running the real adapter
 * here would drag `calc-engine` (479 KB of @smogon/calc) into the tools chunk, which
 * `tests/pwa/first-paint-budget.spec.ts` exists to prevent. `toolSamples.test.ts` recomputes
 * them with `computeDamage` on every run, so a data or formula change turns the suite red
 * rather than letting the sample quietly drift out of date.
 *
 * Only ids and the move's name live here. Labels and sprites are resolved from the Pokémon
 * catalog at render time — that catalog is already on the page.
 */

import type { PokemonType } from '../types';

export const DAMAGE_SAMPLE = {
  attackerPokemonId: 'garchomp',
  /** The move catalog is a chunk of its own; the tools page may not load it for one label. */
  moveId: 'earthquake',
  moveLabel: '地震',
  defenderPokemonId: 'incineroar',
  /** Singles, no weather, both sides 0 SP, neutral nature, no item — see the test. */
  minPercent: 91.8,
  maxPercent: 109.4,
} as const;

/** 04-01 draws 妖精 for the 属性速查 card; both matchup halves are computed off this type. */
export const TYPE_CHART_SAMPLE_TYPE: PokemonType = 'Fairy';

/** The speed card's sample build: nothing invested, nothing that shifts speed. */
export const SPEED_SAMPLE_CAPTION = '未分配 SP';
