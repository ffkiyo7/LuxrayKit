import { describe, expect, it } from 'vitest';
import { currentDataVersion, currentRuleSet, items, moves, pokemon } from '../data';
import {
  auditEnvironmentDataset,
  type EnvironmentDataset,
  type EnvironmentDatasetCatalog,
} from './environmentDataset';
import {
  environmentDatasetAuditIssues,
  environmentPokemonUsage,
  environmentSourceLabel,
  environmentTeamSamples,
} from '../data/environment';

const catalog: EnvironmentDatasetCatalog = {
  pokemonIds: pokemon.map((entry) => entry.id),
  moveIds: moves.map((entry) => entry.id),
  itemIds: items.map((entry) => entry.id),
};

const makeDataset = (overrides: Partial<EnvironmentDataset> = {}): EnvironmentDataset => ({
  id: 'test-environment-dataset',
  ruleSetId: currentRuleSet.id,
  dataVersionId: currentDataVersion.id,
  sourceLabel: `${currentRuleSet.name} · ${currentDataVersion.versionName} · 测试`,
  statusLabel: '开发样例数据',
  updatedAt: '2026-05-27T10:00:00.000+08:00',
  source: {
    kind: 'development-seed',
    name: 'Vitest fixture',
    retrievedAt: '2026-05-27T10:00:00.000+08:00',
  },
  battles: {
    singles: {
      pokemonUsage: [
        {
          pokemonId: 'charizard',
          usageRate: 34.8,
          teamCount: 184,
          moveIds: ['flare-blitz', 'dragon-claw'],
          itemIds: ['charizardite-x'],
          teammateIds: ['garchomp'],
        },
      ],
      teamSamples: [
        {
          id: 'sample-charizard',
          dataKind: 'development-sample',
          author: '样例作者',
          score: 2724,
          title: '喷火龙核心',
          battleType: 'singles',
          reportUrl: 'https://champs.pokedb.tokyo/',
          slots: [
            {
              pokemonId: 'charizard',
              itemId: 'charizardite-x',
              moveIds: ['flare-blitz', 'dragon-claw'],
            },
          ],
        },
      ],
    },
    doubles: {
      pokemonUsage: [],
      teamSamples: [],
    },
  },
  ...overrides,
});

describe('environment dataset audit', () => {
  it('keeps a valid dataset unchanged and tied to the active rule/data version', () => {
    const result = auditEnvironmentDataset(makeDataset(), catalog, {
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
    });

    expect(result.issues).toEqual([]);
    expect(result.dataset.battles.singles.pokemonUsage[0]).toMatchObject({
      pokemonId: 'charizard',
      usageRate: 34.8,
      teamCount: 184,
      moveIds: ['flare-blitz', 'dragon-claw'],
      itemIds: ['charizardite-x'],
      teammateIds: ['garchomp'],
    });
    expect(result.dataset.battles.singles.teamSamples[0].slots[0]).toEqual({
      pokemonId: 'charizard',
      itemId: 'charizardite-x',
      moveIds: ['flare-blitz', 'dragon-claw'],
    });
  });

  it('filters unresolved nested refs while reporting audit issues', () => {
    const dirtyDataset = makeDataset({
      battles: {
        singles: {
          pokemonUsage: [
            {
              pokemonId: 'charizard',
              usageRate: 34.8,
              teamCount: 184,
              moveIds: ['flare-blitz', 'missing-move'],
              itemIds: ['charizardite-x', 'missing-item'],
              teammateIds: ['garchomp', 'missing-pokemon'],
            },
            {
              pokemonId: 'missing-pokemon',
              usageRate: 12,
              teamCount: 3,
              moveIds: [],
              itemIds: [],
              teammateIds: [],
            },
          ],
          teamSamples: [
            {
              id: 'sample-dirty',
              dataKind: 'development-sample',
              author: '样例作者',
              score: 1000,
              title: '脏数据样例',
              battleType: 'singles',
              reportUrl: 'https://champs.pokedb.tokyo/',
              slots: [
                { pokemonId: 'charizard', itemId: 'missing-item', moveIds: ['flare-blitz', 'missing-move'] },
                { pokemonId: 'missing-pokemon', itemId: 'charizardite-x', moveIds: ['flare-blitz'] },
              ],
            },
          ],
        },
        doubles: {
          pokemonUsage: [],
          teamSamples: [],
        },
      },
    });

    const result = auditEnvironmentDataset(dirtyDataset, catalog, {
      ruleSetId: currentRuleSet.id,
      dataVersionId: currentDataVersion.id,
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['missing-move-ref', 'missing-item-ref', 'missing-pokemon-ref']),
    );
    expect(result.dataset.battles.singles.pokemonUsage).toHaveLength(1);
    expect(result.dataset.battles.singles.pokemonUsage[0]).toMatchObject({
      pokemonId: 'charizard',
      moveIds: ['flare-blitz'],
      itemIds: ['charizardite-x'],
      teammateIds: ['garchomp'],
    });
    expect(result.dataset.battles.singles.teamSamples[0].slots).toEqual([
      {
        pokemonId: 'charizard',
        moveIds: ['flare-blitz'],
      },
    ]);
  });

  it('reports blocking metadata and numeric issues instead of silently accepting them', () => {
    const result = auditEnvironmentDataset(
      makeDataset({
        ruleSetId: 'wrong-rule',
        dataVersionId: 'wrong-data-version',
        battles: {
          singles: {
            pokemonUsage: [
              {
                pokemonId: 'charizard',
                usageRate: 120,
                teamCount: -1,
                moveIds: [],
                itemIds: [],
                teammateIds: [],
              },
            ],
            teamSamples: [],
          },
          doubles: {
            pokemonUsage: [],
            teamSamples: [],
          },
        },
      }),
      catalog,
      { ruleSetId: currentRuleSet.id, dataVersionId: currentDataVersion.id },
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['rule-set-mismatch', 'data-version-mismatch', 'invalid-usage-rate', 'invalid-team-count']),
    );
    expect(result.dataset.battles.singles.pokemonUsage).toEqual([]);
  });

  it('keeps the current environment fixture audited before UI exports read it', () => {
    expect(environmentDatasetAuditIssues).toEqual([]);
    expect(environmentSourceLabel).toContain('PokeDB');
    expect(environmentPokemonUsage.singles.length).toBeGreaterThanOrEqual(20);
    expect(environmentPokemonUsage.doubles.length).toBeGreaterThanOrEqual(20);
    expect(environmentPokemonUsage.doubles[0]).toMatchObject({
      pokemonId: 'basculegion-male',
    });
    expect(environmentPokemonUsage.doubles[0].moveIds.slice(0, 3)).toEqual(['last-respects', 'aqua-jet', 'wave-crash']);
    expect(environmentPokemonUsage.singles.find((usage) => usage.pokemonId === 'garchomp')?.moveStats?.[0]).toEqual({
      id: 'earthquake',
      usageRate: 99,
      teamCount: 282,
    });
    expect(environmentTeamSamples.some((sample) => sample.dataKind === 'external-snapshot' && sample.reportUrl.startsWith('https://'))).toBe(true);
  });
});
