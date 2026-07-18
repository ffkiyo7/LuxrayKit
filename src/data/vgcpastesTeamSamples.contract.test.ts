import { describe, expect, it } from 'vitest';
import maAudit from './external/vgcpastes/reg_ma_champions_ma_audit.json';
import maSamples from './external/vgcpastes/reg_ma_champions_ma_team_samples.json';
import mbAudit from './external/vgcpastes/reg_mb_champions_mb_audit.json';
import mbSamples from './external/vgcpastes/reg_mb_champions_mb_team_samples.json';

// The curation runbook owns raising these floors as the curated library grows.
const MIN_MA_TEAMS = 90;
const MIN_MB_TEAMS = 20;

type TeamSample = (typeof maSamples)[number] | (typeof mbSamples)[number];

const expectValidSample = (
  sample: TeamSample,
  expectedSeason: 'reg-ma' | 'reg-mb',
  expectedRegulation: 'M-B' | undefined,
) => {
  expect(sample.id).toEqual(expect.any(String));
  expect(sample.id.trim()).not.toBe('');
  expect(sample.dataKind).toBe('external-snapshot');
  expect(sample.battleType).toBe('doubles');
  expect(sample.title).toEqual(expect.any(String));
  expect(sample.title.trim()).not.toBe('');
  expect(sample.season).toBe(expectedSeason);
  expect('regulation' in sample ? sample.regulation : undefined).toBe(expectedRegulation);
  expect(sample.hasMoves).toEqual(expect.any(Boolean));
  expect(sample.hasSpread).toEqual(expect.any(Boolean));
  expect(sample.slots).toHaveLength(6);

  sample.slots.forEach((slot) => {
    expect(slot.pokemonId).toEqual(expect.any(String));
    expect(slot.pokemonId.trim()).not.toBe('');
  });
};

describe('VGCPastes team sample contract', () => {
  it('keeps the curated M-A and M-B sample sets healthy and structurally valid', () => {
    expect(Array.isArray(maSamples)).toBe(true);
    expect(Array.isArray(mbSamples)).toBe(true);
    expect(maSamples.length).toBeGreaterThanOrEqual(MIN_MA_TEAMS);
    expect(mbSamples.length).toBeGreaterThanOrEqual(MIN_MB_TEAMS);

    maSamples.forEach((sample) => expectValidSample(sample, 'reg-ma', undefined));
    mbSamples.forEach((sample) => expectValidSample(sample, 'reg-mb', 'M-B'));

    const allIds = [...maSamples, ...mbSamples].map((sample) => sample.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it.each([
    ['M-A', maAudit, maSamples],
    ['M-B', mbAudit, mbSamples],
  ] as const)('keeps the %s audit aligned with its generated samples', (_label, audit, samples) => {
    expect(audit.importedTeams).toBe(samples.length);
    expect(Array.isArray(audit.issues)).toBe(true);
    expect(Number.isNaN(Date.parse(audit.retrievedAt))).toBe(false);
  });
});
