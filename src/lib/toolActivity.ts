/**
 * What the tools landing page (04-01) shows about recent work: the dex chips inside the 规则图鉴
 * card and the 「最近用过」 cards under it.
 *
 * This is a throwaway working set, not user content — it never leaves the device, is worthless
 * to back up and must survive a schema it does not control, so it lives in localStorage rather
 * than in IndexedDB next to the teams. Every read is defensive: a corrupt, foreign or
 * unavailable store degrades to "nothing recent", which is a state the page already renders.
 */

const DEX_KEY = 'luxraykit.recentDex.v1';
const TOOLS_KEY = 'luxraykit.recentTools.v1';

const DEX_LIMIT = 3;
const TOOLS_LIMIT = 2;

export type RecentDexEntry = {
  /** Dex tab the entry belongs to, so a chip tap lands back on the right list. */
  kind: 'pokemon' | 'move' | 'item' | 'ability';
  id: string;
  label: string;
  iconRef?: string;
};

export type RecentToolUse = {
  /** Route id of the tool that produced it — `speed`, `calculator`, `typechart`. */
  tool: string;
  label: string;
  /** The line under the name, e.g. 「速度线 · 154」. Written by the tool, shown verbatim. */
  caption: string;
  iconRef?: string;
};

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

const isToolUse = (value: unknown): value is RecentToolUse =>
  isRecord(value) && typeof value.tool === 'string' && typeof value.label === 'string' && typeof value.caption === 'string';

const prepend = <T>(list: T[], entry: T, isSame: (candidate: T) => boolean, limit: number) =>
  [entry, ...list.filter((candidate) => !isSame(candidate))].slice(0, limit);

export const readRecentDexEntries = () => readList(DEX_KEY, isDexEntry);

export const recordDexEntry = (entry: RecentDexEntry) => {
  writeList(
    DEX_KEY,
    prepend(readRecentDexEntries(), entry, (candidate) => candidate.kind === entry.kind && candidate.id === entry.id, DEX_LIMIT),
  );
};

export const readRecentToolUses = () => readList(TOOLS_KEY, isToolUse);

/**
 * Called by a tool once it has a result worth coming back to. Nothing calls it yet — the
 * calculator and the speed line own that moment, and 04-01 stays blank until they do.
 */
export const recordToolUse = (use: RecentToolUse) => {
  writeList(
    TOOLS_KEY,
    prepend(readRecentToolUses(), use, (candidate) => candidate.tool === use.tool, TOOLS_LIMIT),
  );
};
