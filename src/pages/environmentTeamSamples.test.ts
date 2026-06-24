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
  it('treats samples without a regulation tag as M-A (legacy default)', () => {
    expect(sampleRegulation(baseSample())).toBe('M-A');
  });

  it('returns the explicit regulation when tagged', () => {
    expect(sampleRegulation(baseSample({ regulation: 'M-B' }))).toBe('M-B');
    expect(sampleRegulation(baseSample({ regulation: 'M-A' }))).toBe('M-A');
  });
});
