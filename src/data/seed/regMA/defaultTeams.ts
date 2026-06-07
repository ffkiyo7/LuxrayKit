import type { Team } from '../../../types';
import { currentDataVersion, currentRuleSet } from './metadata';

export const defaultTeams: Team[] = [
  {
    id: 'team-starter',
    name: 'Luxray test',
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
    createdAt: '2026-04-26T16:00:00.000Z',
    updatedAt: '2026-04-26T16:00:00.000Z',
    notes: 'Single Luxray seed team for local editing and the hidden starter-card easter egg.',
    members: [
      {
        id: 'member-luxray',
        pokemonId: 'luxray',
        formId: 'luxray',
        abilityId: 'intimidate',
        itemId: 'magnet',
        moveIds: ['wild-charge', 'protect'],
        nature: '爽朗',
        statPoints: { attack: 32, speed: 32, hp: 1 },
        level: 50,
        notes: 'Luxray test starter. There is a small surprise when opening this team.',
        legalityStatus: 'needs-review',
      },
    ],
  },
];
