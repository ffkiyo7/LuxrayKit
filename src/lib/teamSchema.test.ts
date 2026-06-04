import { describe, expect, it } from 'vitest';
import { currentDataVersion, currentRuleSet, defaultTeams } from '../data';
import { CURRENT_TEAM_EXPORT_SCHEMA_VERSION, migrateTeamExportPayload } from './teamSchema';

describe('team schema migration', () => {
  it('keeps the current schema version explicit', () => {
    expect(CURRENT_TEAM_EXPORT_SCHEMA_VERSION).toBe(2);
  });

  it('normalizes current schema teams', () => {
    const migrated = migrateTeamExportPayload({
      schemaVersion: 2,
      teams: defaultTeams,
    });

    expect(migrated).toEqual(defaultTeams);
  });

  it('preserves high-score import source metadata in current schema teams', () => {
    const migrated = migrateTeamExportPayload({
      schemaVersion: 2,
      teams: [
        {
          ...defaultTeams[0],
          source: {
            kind: 'high-score-import',
            sampleId: 'sample-charizard-2724',
            title: '喷火龙核心',
            author: '作者名',
            score: 2724,
            battleType: 'singles',
            reportUrl: 'https://example.com/report',
            importedAt: '2026-06-03T04:00:00.000Z',
          },
        },
      ],
    });

    expect(migrated[0].source).toEqual({
      kind: 'high-score-import',
      sampleId: 'sample-charizard-2724',
      title: '喷火龙核心',
      author: '作者名',
      score: 2724,
      battleType: 'singles',
      reportUrl: 'https://example.com/report',
      importedAt: '2026-06-03T04:00:00.000Z',
    });
  });

  it('preserves environment sample import source metadata in current schema teams', () => {
    const migrated = migrateTeamExportPayload({
      schemaVersion: 2,
      teams: [
        {
          ...defaultTeams[0],
          source: {
            kind: 'environment-sample-import',
            sampleId: 'sample-sun-charizard',
            title: '喷火龙核心',
            label: '开发样例数据',
            battleType: 'singles',
            reportUrl: 'https://champs.pokedb.tokyo/',
            importedAt: '2026-06-04T04:00:00.000Z',
          },
        },
      ],
    });

    expect(migrated[0].source).toEqual({
      kind: 'environment-sample-import',
      sampleId: 'sample-sun-charizard',
      title: '喷火龙核心',
      label: '开发样例数据',
      battleType: 'singles',
      reportUrl: 'https://champs.pokedb.tokyo/',
      importedAt: '2026-06-04T04:00:00.000Z',
    });
  });

  it('migrates v0 teams by filling optional member defaults', () => {
    const migrated = migrateTeamExportPayload({
      schemaVersion: 0,
      teams: [
        {
          id: 'legacy',
          name: 'Legacy',
          ruleSetId: currentRuleSet.id,
          dataVersionId: currentDataVersion.id,
          members: [{ pokemonId: 'garchomp' }],
        },
      ],
    });

    expect(migrated[0].members[0]).toMatchObject({
      id: 'imported-member-1',
      pokemonId: 'garchomp',
      moveIds: [],
      nature: '爽朗',
      level: 50,
      legalityStatus: 'needs-review',
    });
  });

  it('rejects unsupported future schema versions', () => {
    expect(() => migrateTeamExportPayload({ schemaVersion: 99, teams: defaultTeams })).toThrow('不支持的 schemaVersion: 99');
  });
});
