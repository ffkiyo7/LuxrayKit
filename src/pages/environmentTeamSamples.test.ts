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
  it('treats samples with neither a tag nor a mappable season as M-A (legacy default)', () => {
    expect(sampleRegulation(baseSample())).toBe('M-A');
    // VGCPastes-style season strings are not PokeDB ladder seasons, so they do not map.
    expect(sampleRegulation(baseSample({ season: 'reg-mb' }))).toBe('M-A');
  });

  it('returns the explicit regulation when tagged, taking precedence over the season', () => {
    expect(sampleRegulation(baseSample({ regulation: 'M-B' }))).toBe('M-B');
    expect(sampleRegulation(baseSample({ regulation: 'M-A', season: 'M-3' }))).toBe('M-A');
  });

  it('derives the regulation from a PokeDB high-score sample ladder season', () => {
    expect(sampleRegulation(baseSample({ season: 'M-2' }))).toBe('M-A');
    expect(sampleRegulation(baseSample({ season: 'M-3' }))).toBe('M-B');
    expect(sampleRegulation(baseSample({ season: 'M-4' }))).toBe('M-B');
  });
});
