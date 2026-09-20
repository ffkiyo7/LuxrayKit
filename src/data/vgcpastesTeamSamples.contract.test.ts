import { describe, expect, it } from 'vitest';
import mbAudit from './external/vgcpastes/reg_mb_champions_mb_audit.json';
import mbSamples from './external/vgcpastes/reg_mb_champions_mb_team_samples.json';
import mcAudit from './external/vgcpastes/reg_mc_champions_mc_audit.json';
import mcSamples from './external/vgcpastes/reg_mc_champions_mc_team_samples.json';

// The curation runbook owns raising these floors as the curated library grows.
const MIN_MB_TEAMS = 20;
// M-C opened 2026-09-09; the named-event curation only has the first weeks of online
// events to draw from, so the floor starts low and rises as offline results land.
const MIN_MC_TEAMS = 20;

type TeamSample = (typeof mbSamples)[number] | (typeof mcSamples)[number];

const expectValidSample = (
  sample: TeamSample,
  expectedSeason: 'reg-mb' | 'reg-mc',
  expectedRegulation: 'M-B' | 'M-C',
) => {
  expect(sample.id).toEqual(expect.any(String));
  expect(sample.id.trim()).not.toBe('');
  expect(sample.dataKind).toBe('external-snapshot');
  expect(sample.battleType).toBe('doubles');
  expect(sample.title).toEqual(expect.any(String));
  expect(sample.title.trim()).not.toBe('');
  expect(sample.season).toBe(expectedSeason);
  // Every remaining set stamps its regulation. The one set that did not (M-A, which relied on
  // being the implicit default) was dropped on 2026-09-20, so `undefined` is no longer valid.
  expect(sample.regulation).toBe(expectedRegulation);
  expect(sample.hasMoves).toEqual(expect.any(Boolean));
  expect(sample.hasSpread).toEqual(expect.any(Boolean));
  expect(sample.slots).toHaveLength(6);

  sample.slots.forEach((slot) => {
    expect(slot.pokemonId).toEqual(expect.any(String));
    expect(slot.pokemonId.trim()).not.toBe('');
  });
};

describe('VGCPastes team sample contract', () => {
  it('keeps the curated M-B and M-C sample sets healthy and structurally valid', () => {
    expect(Array.isArray(mbSamples)).toBe(true);
    expect(Array.isArray(mcSamples)).toBe(true);
    expect(mbSamples.length).toBeGreaterThanOrEqual(MIN_MB_TEAMS);
    expect(mcSamples.length).toBeGreaterThanOrEqual(MIN_MC_TEAMS);

    mbSamples.forEach((sample) => expectValidSample(sample, 'reg-mb', 'M-B'));
    mcSamples.forEach((sample) => expectValidSample(sample, 'reg-mc', 'M-C'));

    const allIds = [...mbSamples, ...mcSamples].map((sample) => sample.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it.each([
    ['M-B', mbAudit, mbSamples],
    ['M-C', mcAudit, mcSamples],
  ] as const)('keeps the %s audit aligned with its generated samples', (_label, audit, samples) => {
    expect(audit.importedTeams).toBe(samples.length);
    expect(Array.isArray(audit.issues)).toBe(true);
    expect(Number.isNaN(Date.parse(audit.retrievedAt))).toBe(false);
  });
});
