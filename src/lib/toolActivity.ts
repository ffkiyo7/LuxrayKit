/**
 * What the tools landing page (04-01) shows about recent work: the dex chips inside the 规则图鉴
 * card and the 「最近用过」 cards under it.
 *
 * This is a throwaway working set, not user content — it never leaves the device, is worthless
 * to back up and must survive a schema it does not control, so it lives in localStorage rather
 * than in IndexedDB next to the teams. Every read is defensive: a corrupt, foreign or
 * unavailable store degrades to "nothing recent", which is a state the page already renders.
 */

import type { PokemonType } from '../types';
// Type-only: keeps the tool store free of the catalog that speedTier pulls in at runtime.
import type { SpeedBuild } from './speedTier';

const DEX_KEY = 'luxraykit.recentDex.v1';
// v2 stores each tool's raw result instead of a pre-rendered caption; v1 payloads simply do not
// validate, which the readers already treat as "nothing recent".
const TOOLS_KEY = 'luxraykit.recentTools.v2';

const DEX_LIMIT = 3;
/** One slot per tool that writes results, so every card can show its own last run. */
const TOOLS_LIMIT = 3;

export type RecentDexEntry = {
  /** Dex tab the entry belongs to, so a chip tap lands back on the right list. */
  kind: 'pokemon' | 'move' | 'item' | 'ability';
  id: string;
  label: string;
  iconRef?: string;
};

/**
 * What a tool hands back after one complete run. Only the raw numbers live here — 04-01 phrases
 * them, so a wording change never has to migrate the store.
 */
export type CalculatorToolResult = {
  tool: 'calculator';
  /** The attacker, which is also what 「最近用过」 shows for this tool. */
  label: string;
  iconRef?: string;
  /** 04-01 redraws the run as 「进攻方 招式 → 防守方」, so the other two sides are stored too. */
  moveLabel: string;
  defenderLabel: string;
  defenderIconRef?: string;
  minDamage: number;
  maxDamage: number;
  minPercent: number;
  maxPercent: number;
  /** `possibleHkoText` verbatim — the conclusion, not a number we could recompute. */
  hko: string;
};

export type SpeedToolResult = {
  tool: 'speed';
  label: string;
  iconRef?: string;
  /** Who the card names — and, on a tap, exactly who the page reopens on, with `build` applied. */
  pokemonId: string;
  formId?: string;
  build: SpeedBuild;
  speed: number;
  /** Nearest tier the member is still slower than, and the speed SP that would clear it. */
  nextTierSpeed?: number;
  nextTierStatPoints?: number;
  /** A short stretch of the axis around the member, drawn as the card's sparkline. */
  window?: number[];
  windowIndex?: number;
};

export type TypeChartToolResult = {
  tool: 'typeChart';
  type: PokemonType;
};

export type ToolResult = CalculatorToolResult | SpeedToolResult | TypeChartToolResult;

const readList = <T>(key: string, isValid: (value: unknown) => value is T): T[] => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
};

const writeList = (key: string, value: unknown[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota. Losing the working set is not worth interrupting the user.
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isDexEntry = (value: unknown): value is RecentDexEntry =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.label === 'string'
  && ['pokemon', 'move', 'item', 'ability'].includes(value.kind as string);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// A v2 speed row carries no build, so it fails here and is dropped — the readers already treat
// that as "nothing recent", and one lost row is cheaper than reopening the page on a half-result.
const isSpeedBuild = (value: unknown): value is SpeedBuild =>
  isRecord(value)
  && isFiniteNumber(value.baseSpeed)
  && isFiniteNumber(value.statPoints)
  && ['decreased', 'neutral', 'increased'].includes(value.nature as string)
  && [value.scarf, value.speedAbility, value.tailwind].every((flag) => typeof flag === 'boolean');

const isToolResult = (value: unknown): value is ToolResult => {
  if (!isRecord(value)) return false;
  switch (value.tool) {
    case 'calculator':
      // A row written before 04-01 drew the matchup line has no move or defender; it fails here
      // and is dropped, the same way a build-less speed row is.
      return typeof value.label === 'string'
        && typeof value.moveLabel === 'string'
        && typeof value.defenderLabel === 'string'
        && typeof value.hko === 'string'
        && [value.minDamage, value.maxDamage, value.minPercent, value.maxPercent].every(isFiniteNumber);
    case 'speed':
      return typeof value.label === 'string'
        && typeof value.pokemonId === 'string'
        && isSpeedBuild(value.build)
        && isFiniteNumber(value.speed);
    case 'typeChart':
      return typeof value.type === 'string';
    default:
      return false;
  }
};

const prepend = <T>(list: T[], entry: T, isSame: (candidate: T) => boolean, limit: number) =>
  [entry, ...list.filter((candidate) => !isSame(candidate))].slice(0, limit);

export const readRecentDexEntries = () => readList(DEX_KEY, isDexEntry);

export const recordDexEntry = (entry: RecentDexEntry) => {
  writeList(
    DEX_KEY,
    prepend(readRecentDexEntries(), entry, (candidate) => candidate.kind === entry.kind && candidate.id === entry.id, DEX_LIMIT),
  );
};

/** Most recent first, at most one entry per tool. */
export const readToolResults = () => readList(TOOLS_KEY, isToolResult);

/** Called by a tool once it has one complete, valid result — not on every keystroke. */
export const recordToolResult = (result: ToolResult) => {
  writeList(
    TOOLS_KEY,
    prepend(readToolResults(), result, (candidate) => candidate.tool === result.tool, TOOLS_LIMIT),
  );
};
