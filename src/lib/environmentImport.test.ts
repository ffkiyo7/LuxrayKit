import { describe, expect, it } from 'vitest';
import { currentRuleNatureOptions } from '../data';
import type { EnvironmentTeamSample } from '../data/environment';
import { createImportedTeamFromEnvironmentSample } from './environmentImport';

describe('environmentImport', () => {
  it('preserves complete environment sample config when present', () => {
    const sample: EnvironmentTeamSample = {
      id: 'vgcpastes-champions-ma-example',
      dataKind: 'external-snapshot',
      sourceId: 'vgcpastes-champions-ma',
      author: 'VGCPastes',
      season: 'reg-ma',
      score: 1,
      title: 'Complete paste team',
      battleType: 'doubles',
      reportUrl: 'https://pokepast.es/example',
      replicaCode: 'BVUSEPP67B',
      hasMoves: true,
      hasSpread: true,
      slots: [
        {
          pokemonId: 'garchomp',
          abilityId: 'rough-skin',
          itemId: 'focus-sash',
          nature: '爽朗',
          statPoints: { attack: 32, specialDefense: 1, speed: 32 },
          moveIds: ['earthquake', 'dragon-claw', 'swords-dance', 'rock-slide'],
        },
      ],
    };

    const team = createImportedTeamFromEnvironmentSample(sample, 'VGCPastes');

    expect(team.replicaCode).toBe('BVUSEPP67B');
    expect(team.members[0]).toMatchObject({
      pokemonId: 'garchomp',
      formId: 'garchomp',
      abilityId: 'rough-skin',
      itemId: 'focus-sash',
      nature: '爽朗',
      statPoints: { attack: 32, specialDefense: 1, speed: 32 },
      moveIds: ['earthquake', 'dragon-claw', 'swords-dance', 'rock-slide'],
    });
    expect(team.members[0].notes).toContain('已带入公开的性格 / SP / 配招配置');
  });

  it('does not invent moves, nature, SP or an ambiguous ability the sample never published', () => {
    // The PokeDB shape: Pokémon and item only.
    const sample: EnvironmentTeamSample = {
      id: 'pokedb-singles-rank-1',
      dataKind: 'external-snapshot',
      sourceId: 'pokedb',
      author: 'PokeDB',
      season: 'reg-ma',
      score: 1,
      title: 'Bare PokeDB team',
      battleType: 'singles',
      hasMoves: false,
      hasSpread: false,
      slots: [{ pokemonId: 'garchomp', itemId: 'focus-sash', moveIds: [] }],
    };

    const team = createImportedTeamFromEnvironmentSample(sample, 'PokeDB');

    expect(team.source).toMatchObject({ kind: 'environment-sample-import', sampleId: 'pokedb-singles-rank-1' });
    expect(team.members[0]).toMatchObject({ pokemonId: 'garchomp', formId: 'garchomp', itemId: 'focus-sash', moveIds: [], statPoints: {} });
    // 烈咬陆鲨 has more than one ability, so none is guessed; the nature falls back to the neutral one.
    expect(team.members[0].abilityId).toBeUndefined();
    expect(team.members[0].nature).toBe(currentRuleNatureOptions.find((option) => option.neutral)?.id);
    expect(team.members[0].notes).toContain('性格 / SP / 配招需手动确认');
  });
});
