import { describe, expect, it } from 'vitest';
import type { EnvironmentTeamSample } from '../data/environment';
import { sampleRegulation } from './environmentTeamSamples';

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

describe('sampleRegulation', () => {
  it('leaves samples with neither a tag nor a mappable season unclassified', () => {
    expect(sampleRegulation(baseSample())).toBeUndefined();
    // VGCPastes-style season strings are not PokeDB ladder seasons, so they do not map.
    expect(sampleRegulation(baseSample({ season: 'reg-mb' }))).toBeUndefined();
    // A ladder season the schedule does not know yet (next regulation's first season) must not
    // be guessed into an existing regulation.
    expect(sampleRegulation(baseSample({ season: 'M-6' }))).toBeUndefined();
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
  });

  it('keeps unclassified samples out of every concrete regulation filter', () => {
    const samples = [
      baseSample({ id: 'tagged-mb', regulation: 'M-B' }),
      baseSample({ id: 'season-ma', season: 'M-2' }),
      baseSample({ id: 'unknown', season: 'M-6' }),
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
