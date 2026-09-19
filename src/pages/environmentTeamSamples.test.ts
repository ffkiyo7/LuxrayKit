import { describe, expect, it } from 'vitest';
import type { EnvironmentTeamSample } from '../data/environment';
import {
  sampleRegulation,
  sortTeamSamplesByScore,
  teamSampleLadderScore,
  teamSamplePlacementLabel,
} from './environmentTeamSamples';

const baseSample = (overrides: Partial<EnvironmentTeamSample> = {}): EnvironmentTeamSample => ({
  id: 'sample-1',
  dataKind: 'external-snapshot',
  author: 'Trainer',
  score: 0,
  title: 'Team',
  battleType: 'doubles',
  reportUrl: 'https://example.com',
  slots: [],
  ...overrides,
});

describe('event placement vs ladder score', () => {
  const event = (overrides: Partial<EnvironmentTeamSample>) =>
    baseSample({ sourceId: 'vgcpastes-champions-mb', ...overrides });

  it('never prints an event placement as a score', () => {
    // VGCPastes stamps 「6th」 into both rank and score.
    const top8 = event({ id: 'vgcpastes-a', rank: 6, score: 6, eventRank: '6th' });
    expect(teamSampleLadderScore(top8)).toBeUndefined();
    expect(teamSamplePlacementLabel(top8)).toBe('第 6 名');
    expect(teamSampleLadderScore(baseSample({ id: 'pokedb-doubles-rank-3', rank: 3, score: 2651 }))).toBe(2651);
  });

  it('labels the placements the source actually uses', () => {
    expect(teamSamplePlacementLabel(event({ eventRank: 'Champion' }))).toBe('冠军');
    expect(teamSamplePlacementLabel(event({ eventRank: 'Runner Up' }))).toBe('亚军');
    expect(teamSamplePlacementLabel(event({ eventRank: 'Top 8', rank: 8 }))).toBe('8 强');
    expect(teamSamplePlacementLabel(event({ eventRank: '21st', rank: 21 }))).toBe('第 21 名');
    expect(teamSamplePlacementLabel(event({}))).toBeUndefined();
    expect(teamSamplePlacementLabel(baseSample({ rank: 2 }))).toBe('第 2 名');
  });

  it('orders ladder samples first, then event teams by placement and recency', () => {
    const sorted = sortTeamSamplesByScore([
      event({ id: 'vgcpastes-3rd', eventRank: '3rd', rank: 3, score: 3 }),
      event({ id: 'vgcpastes-champ-old', eventRank: 'Champion', dateShared: '2026-07-01' }),
      baseSample({ id: 'pokedb-doubles-rank-5', rank: 5, score: 2600 }),
      event({ id: 'vgcpastes-champ-new', eventRank: 'Champion', dateShared: '2026-08-01' }),
      baseSample({ id: 'pokedb-doubles-rank-1', rank: 1, score: 2724 }),
    ]);
    expect(sorted.map((sample) => sample.id)).toEqual([
      'pokedb-doubles-rank-1',
      'pokedb-doubles-rank-5',
      'vgcpastes-champ-new',
      'vgcpastes-champ-old',
      'vgcpastes-3rd',
    ]);
  });
});

describe('sampleRegulation', () => {
  it('leaves samples with neither a tag nor a mappable season unclassified', () => {
    expect(sampleRegulation(baseSample())).toBeUndefined();
    // VGCPastes-style season strings are not PokeDB ladder seasons, so they do not map.
    expect(sampleRegulation(baseSample({ season: 'reg-mb' }))).toBeUndefined();
    // A ladder season the schedule does not know yet must not be guessed into an existing
    // regulation. (M-6 used to stand in here; it is now an announced M-C season, so this uses a
    // label that is still unannounced.)
    expect(sampleRegulation(baseSample({ season: 'M-9' }))).toBeUndefined();
  });

  it('returns the explicit regulation when tagged, taking precedence over the season', () => {
    expect(sampleRegulation(baseSample({ regulation: 'M-B' }))).toBe('M-B');
    expect(sampleRegulation(baseSample({ regulation: 'M-A', season: 'M-3' }))).toBe('M-A');
  });

  it('derives the regulation from a PokeDB high-score sample ladder season', () => {
    expect(sampleRegulation(baseSample({ season: 'M-2' }))).toBe('M-A');
    expect(sampleRegulation(baseSample({ season: 'M-3' }))).toBe('M-B');
    expect(sampleRegulation(baseSample({ season: 'M-4' }))).toBe('M-B');
    expect(sampleRegulation(baseSample({ season: 'M-5' }))).toBe('M-B');
    expect(sampleRegulation(baseSample({ season: 'M-6' }))).toBe('M-C');
  });

  it('keeps unclassified samples out of every concrete regulation filter', () => {
    const samples = [
      baseSample({ id: 'tagged-mb', regulation: 'M-B' }),
      baseSample({ id: 'season-ma', season: 'M-2' }),
      baseSample({ id: 'unknown', season: 'M-9' }),
    ];
    for (const regulation of ['M-A', 'M-B', 'M-C'] as const) {
      expect(samples.filter((sample) => sampleRegulation(sample) === regulation).map((s) => s.id)).not.toContain(
        'unknown',
      );
    }
    // ...but it is still reachable through the "all regulations" view.
    expect(samples).toHaveLength(3);
  });
});
