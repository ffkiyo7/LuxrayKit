import { describe, expect, it } from 'vitest';
import { evaluateMemberLegality } from './legality';
import { MAX_STAT_POINTS_PER_STAT } from './statPoints';
import { canShareTeam } from './teamShare';
import { checkMemberWrite, rosterSpeciesIds, teamCompositionIssues } from './teamComposition';
import type { Team, TeamMember } from '../types';

const member = (patch: Partial<TeamMember> & { id: string }): TeamMember => ({
  pokemonId: 'garchomp',
  formId: 'garchomp',
  abilityId: 'rough-skin',
  moveIds: ['earthquake'],
  nature: '爽朗',
  statPoints: {},
  level: 50,
  notes: '',
  legalityStatus: 'legal',
  ...patch,
});

const team = (members: TeamMember[]): Team => ({
  id: 'team-1',
  name: '甲队',
  ruleSetId: 'rule',
  dataVersionId: 'data',
  members,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  notes: '',
});

describe('checkMemberWrite', () => {
  it('refuses a species that is already on the roster', () => {
    const existing = team([member({ id: 'a', pokemonId: 'rillaboom', formId: 'rillaboom' })]);
    const result = checkMemberWrite(existing, member({ id: 'b', pokemonId: 'rillaboom', formId: 'rillaboom' }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('duplicate-species');
  });

  it('treats a Mega form as the same species as its base form', () => {
    const existing = team([member({ id: 'a', pokemonId: 'charizard', formId: 'charizard' })]);
    const result = checkMemberWrite(existing, member({ id: 'b', pokemonId: 'charizard', formId: 'charizard-mega-x' }));

    expect(result.ok === false && result.code).toBe('duplicate-species');
  });

  it('lets a member be updated in place', () => {
    const existing = team([member({ id: 'a', pokemonId: 'rillaboom', formId: 'rillaboom' })]);

    expect(checkMemberWrite(existing, member({ id: 'a', pokemonId: 'rillaboom', moveIds: ['wood-hammer'] })).ok).toBe(true);
  });

  it('refuses an item a teammate already holds', () => {
    const existing = team([member({ id: 'a', pokemonId: 'rillaboom', itemId: 'focus-sash' })]);
    const result = checkMemberWrite(existing, member({ id: 'b', pokemonId: 'incineroar', itemId: 'focus-sash' }));

    expect(result.ok === false && result.code).toBe('duplicate-held-item');
  });

  it('refuses SP over either cap', () => {
    const empty = team([]);

    expect(checkMemberWrite(empty, member({ id: 'a', statPoints: { attack: MAX_STAT_POINTS_PER_STAT + 1 } })).ok).toBe(false);
    expect(checkMemberWrite(empty, member({ id: 'a', statPoints: { attack: 32, speed: 32, hp: 4 } })).ok).toBe(false);
    expect(checkMemberWrite(empty, member({ id: 'a', statPoints: { attack: 32, speed: 32, hp: 2 } })).ok).toBe(true);
  });

  it('refuses a seventh member', () => {
    const full = team(
      ['garchomp', 'incineroar', 'luxray', 'charizard', 'whimsicott', 'gholdengo'].map((pokemonId) =>
        member({ id: pokemonId, pokemonId, formId: pokemonId }),
      ),
    );

    expect(checkMemberWrite(full, member({ id: 'seventh', pokemonId: 'rillaboom' })).ok === false).toBe(true);
  });
});

describe('teamCompositionIssues', () => {
  it('reports existing data rather than repairing it', () => {
    const broken = team([
      member({ id: 'a', pokemonId: 'rillaboom', formId: 'rillaboom', itemId: 'focus-sash' }),
      member({ id: 'b', pokemonId: 'rillaboom', formId: 'rillaboom', itemId: 'focus-sash' }),
      member({ id: 'c', pokemonId: 'incineroar', formId: 'incineroar', statPoints: { attack: 60 } }),
    ]);

    expect(teamCompositionIssues(broken).map((issue) => issue.code)).toEqual([
      'duplicate-species',
      'duplicate-held-item',
      'stat-points-over-limit',
    ]);
    expect(broken.members).toHaveLength(3);
  });

  it('says nothing about a clean roster', () => {
    expect(
      teamCompositionIssues(
        team([
          member({ id: 'a', pokemonId: 'rillaboom', itemId: 'focus-sash' }),
          member({ id: 'b', pokemonId: 'incineroar', itemId: 'sitrus-berry' }),
        ]),
      ),
    ).toEqual([]);
  });
});

describe('sharing', () => {
  const sixOf = (pokemonIds: string[]) =>
    team(pokemonIds.map((pokemonId, index) => member({ id: `m-${index}`, pokemonId, formId: pokemonId })));

  it('blocks a share code for a team that breaks the rules', () => {
    expect(canShareTeam(sixOf(['garchomp', 'incineroar', 'luxray', 'charizard', 'whimsicott', 'gholdengo']))).toBe(true);
    expect(canShareTeam(sixOf(['garchomp', 'garchomp', 'luxray', 'charizard', 'whimsicott', 'gholdengo']))).toBe(false);
  });
});

describe('legality', () => {
  it('flags a duplicate species as an error on the member', () => {
    const existing = team([member({ id: 'a', pokemonId: 'rillaboom', formId: 'rillaboom' })]);
    const result = evaluateMemberLegality(member({ id: 'b', pokemonId: 'rillaboom', formId: 'rillaboom' }), existing);

    expect(result.status).toBe('illegal');
    expect(result.issues.some((issue) => issue.code === 'duplicate-species')).toBe(true);
  });
});

describe('rosterSpeciesIds', () => {
  it('lists the roster species, optionally excluding the member being edited', () => {
    const existing = team([
      member({ id: 'a', pokemonId: 'rillaboom', formId: 'rillaboom' }),
      member({ id: 'b', pokemonId: 'incineroar', formId: 'incineroar' }),
    ]);

    expect([...rosterSpeciesIds(existing)].sort()).toEqual(['incineroar', 'rillaboom']);
    expect([...rosterSpeciesIds(existing, 'a')]).toEqual(['incineroar']);
  });
});
