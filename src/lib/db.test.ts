import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPreferences, defaultTeams } from '../data';
import type { Team } from '../types';
import { repository } from './db';

const DB_NAME = 'pokemon-champions-assistant';

const deleteDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB delete was blocked'));
  });

const createV1DbWithTeam = (team: Team) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('teams', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['teams', 'meta'], 'readwrite');
      transaction.objectStore('teams').put(team);
      transaction.objectStore('meta').put({ key: 'initialized', value: true });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
    request.onerror = () => reject(request.error);
  });

const cloneTeam = (team: Team, patch: Partial<Team> = {}): Team => ({
  ...team,
  members: team.members.map((member) => ({ ...member, moveIds: [...member.moveIds], statPoints: { ...member.statPoints } })),
  ...patch,
});

describe('IndexedDB repository', () => {
  beforeEach(async () => {
    await deleteDb();
  });

  it('seeds default teams and preferences on first load', async () => {
    const state = await repository.loadState();

    expect(state.teams).toEqual(defaultTeams);
    expect(state.preferences).toEqual(defaultPreferences);
  });

  it('migrates v1 EV-like stat point data to Champions SP on database upgrade', async () => {
    const legacyTeam = cloneTeam(defaultTeams[0], {
      id: 'legacy-team',
      members: [
        {
          ...defaultTeams[0].members[0],
          id: 'legacy-member',
          statPoints: { attack: 252, speed: 252, hp: 4 },
        },
      ],
    });
    await createV1DbWithTeam(legacyTeam);

    const state = await repository.loadState();

    expect(state.teams[0].members[0].statPoints).toEqual({
      hp: 1,
      attack: 32,
      defense: 0,
      specialAttack: 0,
      specialDefense: 0,
      speed: 32,
    });
  });

  it('replaces the legacy starter test team with the Luxray starter team', async () => {
    const legacyStarter = cloneTeam(defaultTeams[0], {
      name: 'M-A 测试队',
      sortOrder: 4,
      members: [
        {
          ...defaultTeams[0].members[0],
          id: 'member-garchomp',
          pokemonId: 'garchomp',
        },
      ],
    });
    await createV1DbWithTeam(legacyStarter);

    const state = await repository.loadState();

    expect(state.teams[0]).toMatchObject({
      id: defaultTeams[0].id,
      name: 'Luxray test',
      sortOrder: 4,
    });
    expect(state.teams[0].members).toHaveLength(1);
    expect(state.teams[0].members[0].pokemonId).toBe('luxray');
  });

  it('saves and reloads a team', async () => {
    await repository.loadState();
    const savedTeam = cloneTeam(defaultTeams[0], {
      id: 'saved-team',
      name: 'Saved team',
    });

    await repository.saveTeam(savedTeam);
    const state = await repository.loadState();

    expect(state.teams.some((team) => team.id === 'saved-team' && team.name === 'Saved team')).toBe(true);
  });

  it('deletes a team by id', async () => {
    await repository.loadState();

    await repository.deleteTeam(defaultTeams[0].id);
    const state = await repository.loadState();

    expect(state.teams.some((team) => team.id === defaultTeams[0].id)).toBe(false);
  });

  it('replaces all teams', async () => {
    await repository.loadState();
    const replacement = cloneTeam(defaultTeams[0], {
      id: 'replacement-team',
      name: 'Replacement team',
    });

    await repository.replaceTeams([replacement]);
    const state = await repository.loadState();

    expect(state.teams).toHaveLength(1);
    expect(state.teams[0].id).toBe('replacement-team');
  });

  it('clears local teams and preferences', async () => {
    await repository.loadState();

    await repository.clearAll();
    const state = await repository.loadState();

    expect(state.teams).toEqual([]);
    expect(state.preferences).toEqual(defaultPreferences);
  });
});
