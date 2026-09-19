import type { EnvironmentTeamSample, RegulationId } from '../data/environment';
import { seasonToRegulation } from '../data/schedule';

export const DEFAULT_TEAM_SAMPLE_SHUFFLE_SEED = 0x9e3779b9;

// A sample's regulation, in priority order:
//  1. its explicit tag (VGCPastes champion samples are stamped at load time);
//  2. otherwise derived from its PokeDB ladder season via the schedule
//     (M-1/M-2 -> M-A, M-3/M-4/M-5 -> M-B, M-6 -> M-C), which is how high-score teams get tagged without
//     baking regulation into the scraped snapshot;
//  3. otherwise `undefined` — unknown, never guessed. A season the schedule does not know yet
//     (e.g. the first season of the next regulation, before its announcement is transcribed)
//     must not be mis-filed under a concrete regulation; such samples stay visible only in the
//     "all regulations" view until `seasonSchedule` is extended.
export const sampleRegulation = (sample: EnvironmentTeamSample): RegulationId | undefined =>
  sample.regulation ?? seasonToRegulation(sample.season ?? '');

export const isVgcPastesSample = (sample: EnvironmentTeamSample) =>
  Boolean(sample.sourceId?.includes('vgcpastes') || sample.id.startsWith('vgcpastes-'));

/**
 * Only a PokeDB ladder sample carries a rating. VGCPastes stamps an event team's placement into
 * both `rank` and `score` (「6th」 → rank 6, score 6), so reading `score` there prints 「6 分」.
 */
export const teamSampleLadderScore = (sample: EnvironmentTeamSample) =>
  !isVgcPastesSample(sample) && sample.score > 0 ? sample.score : undefined;

const eventPlacement = (sample: EnvironmentTeamSample): { order: number; label: string } | undefined => {
  const text = sample.eventRank?.trim();
  if (!text) return undefined;
  if (/^champion$/i.test(text)) return { order: 1, label: '冠军' };
  if (/^runner[\s-]?up$/i.test(text)) return { order: 2, label: '亚军' };
  const top = /^top\s*(\d+)$/i.exec(text);
  if (top) return { order: Number(top[1]), label: `${top[1]} 强` };
  const nth = /^(\d+)(?:st|nd|rd|th)$/i.exec(text);
  if (nth) return { order: Number(nth[1]), label: `第 ${nth[1]} 名` };
  return { order: Number.POSITIVE_INFINITY, label: text };
};

/** 「第 3 名」 for a ladder sample, 「冠军」/「8 强」/「第 6 名」 for an event one. */
export const teamSamplePlacementLabel = (sample: EnvironmentTeamSample) => {
  if (isVgcPastesSample(sample)) return eventPlacement(sample)?.label;
  return sample.rank ? `第 ${sample.rank} 名` : undefined;
};

const teamSampleDateValue =(sample: EnvironmentTeamSample) => {
  if (!sample.dateShared) return null;
  const value = Date.parse(sample.dateShared);
  return Number.isNaN(value) ? null : value;
};

const compareUnknownDateSamples = (left: EnvironmentTeamSample, right: EnvironmentTeamSample) =>
  (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY) ||
  right.score - left.score ||
  left.id.localeCompare(right.id);

export const sortTeamSamplesByDate = (
  samples: EnvironmentTeamSample[],
  direction: 'newest' | 'oldest' = 'newest',
) =>
  [...samples].sort((left, right) => {
    const leftDate = teamSampleDateValue(left);
    const rightDate = teamSampleDateValue(right);

    if (leftDate === null && rightDate === null) return compareUnknownDateSamples(left, right);
    if (leftDate === null) return 1;
    if (rightDate === null) return -1;
    if (leftDate !== rightDate) return direction === 'newest' ? rightDate - leftDate : leftDate - rightDate;
    return compareUnknownDateSamples(left, right);
  });

/**
 * 07-01's default order (「按分数」). Ladder samples lead, by rank then rating — they are the only
 * ones with a score. Event teams follow by placement (冠军 → 亚军 → 第 N 名), newest first within
 * a placement; their `rank` is not comparable with a ladder rank, and a 冠军 has none at all.
 */
export const sortTeamSamplesByScore = (samples: EnvironmentTeamSample[]) =>
  [...samples].sort((left, right) => {
    const leftEvent = isVgcPastesSample(left);
    const rightEvent = isVgcPastesSample(right);
    if (leftEvent !== rightEvent) return leftEvent ? 1 : -1;
    if (!leftEvent) return compareUnknownDateSamples(left, right);
    return (
      (eventPlacement(left)?.order ?? Number.POSITIVE_INFINITY) - (eventPlacement(right)?.order ?? Number.POSITIVE_INFINITY) ||
      (teamSampleDateValue(right) ?? 0) - (teamSampleDateValue(left) ?? 0) ||
      left.id.localeCompare(right.id)
    );
  });

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffleTeamSamples = (samples: EnvironmentTeamSample[], seed: number) => {
  const nextSamples = [...samples];
  const random = seededRandom(seed);
  for (let index = nextSamples.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextSamples[index], nextSamples[swapIndex]] = [nextSamples[swapIndex], nextSamples[index]];
  }
  return nextSamples;
};

export const nextTeamSampleShuffleSeed = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] || DEFAULT_TEAM_SAMPLE_SHUFFLE_SEED;
  }
  return Math.floor(Math.random() * 0xffffffff) || DEFAULT_TEAM_SAMPLE_SHUFFLE_SEED;
};
