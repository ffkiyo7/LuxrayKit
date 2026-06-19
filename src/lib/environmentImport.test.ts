import { describe, expect, it } from 'vitest';
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
});
