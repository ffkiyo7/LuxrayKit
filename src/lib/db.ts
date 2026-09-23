import type { AppState, Team, UserPreference } from '../types';
import { defaultPreferences } from '../data/seed/regMA/metadata';
import { defaultTeams } from '../data/seed/regMA/defaultTeams';
import { migrateLegacyEvStatPoints } from './statPoints';

const DB_NAME = 'pokemon-champions-assistant';
const DB_VERSION = 2;
const TEAM_STORE = 'teams';
const META_STORE = 'meta';
const STARTER_TEAM_ID = 'team-starter';
const LEGACY_STARTER_TEAM_NAME = 'M-A 测试队';
const LEGACY_STARTER_MEMBER_IDS = new Set(['member-garchomp', 'member-incineroar']);

type StoreName = typeof TEAM_STORE | typeof META_STORE;

const migrateTeamsToV2 = (transaction: IDBTransaction) => {
  const teamStore = transaction.objectStore(TEAM_STORE);
  const metaStore = transaction.objectStore(META_STORE);
  const request = teamStore.getAll();

  request.onsuccess = () => {
    (request.result as Team[]).forEach((team) => {
      teamStore.put({
        ...team,
        members: team.members.map((member) => ({
          ...member,
          statPoints: migrateLegacyEvStatPoints(member.statPoints),
        })),
      });
    });
    metaStore.put({ key: 'schemaVersion', value: DB_VERSION });
  };
};

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      if (!db.objectStoreNames.contains(TEAM_STORE)) {
        db.createObjectStore(TEAM_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (oldVersion < 2 && request.transaction) {
        migrateTeamsToV2(request.transaction);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Runs `work` in one transaction and settles only when the transaction does. A request's
 * `onsuccess` is not durability: a quota failure surfaces at commit time as an `abort` event, so
 * resolving on the request would report a save that is then rolled back. If `work` throws (an
 * invalid key makes `put` throw synchronously), the transaction is aborted, so nothing it already
 * queued — a `clear()` in particular — gets committed.
 */
const runTransaction = async <T>(
  storeNames: StoreName | StoreName[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => () => T,
) => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      db.close();
      reject(error ?? new Error('IndexedDB transaction aborted.'));
    };
    let readResult: () => T;
    try {
      readResult = work(transaction);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Already finished; the error below is still the one to report.
      }
      fail(error);
      return;
    }
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      db.close();
      resolve(readResult());
    };
    transaction.onerror = () => fail(transaction.error);
    transaction.onabort = () => fail(transaction.error);
  });
};

const runStore = <T>(storeName: StoreName, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) =>
  runTransaction(storeName, mode, (transaction) => {
    const request = operation(transaction.objectStore(storeName));
    return () => request.result;
  });

const teamOrderValue = (team: Team, fallbackIndex: number) =>
  typeof team.sortOrder === 'number' && Number.isFinite(team.sortOrder) ? team.sortOrder : fallbackIndex;

const sortTeamsForList = (teams: Team[]) =>
  teams
    .map((team, index) => ({ team, index }))
    .sort((a, b) => {
      const orderDiff = teamOrderValue(a.team, a.index) - teamOrderValue(b.team, b.index);
      return orderDiff || a.index - b.index;
    })
    .map(({ team }) => team);

const isLegacyStarterTeam = (team: Team) =>
  team.id === STARTER_TEAM_ID && (team.name === LEGACY_STARTER_TEAM_NAME || team.members.some((member) => LEGACY_STARTER_MEMBER_IDS.has(member.id)));

const migrateLegacyStarterTeam = (teams: Team[]) => {
  let changed = false;
  const migratedTeams = teams.map((team) => {
    if (!isLegacyStarterTeam(team)) return team;
    changed = true;
    return {
      ...defaultTeams[0],
      sortOrder: team.sortOrder,
    };
  });
  return { changed, teams: migratedTeams };
};

export const repository = {
  async loadState(): Promise<AppState> {
    const teams = await runStore<Team[]>(TEAM_STORE, 'readonly', (store) => store.getAll());
    const preferencesRow = await runStore<{ key: string; value: UserPreference } | undefined>(META_STORE, 'readonly', (store) =>
      store.get('preferences'),
    );
    const initializedRow = await runStore<{ key: string; value: boolean } | undefined>(META_STORE, 'readonly', (store) =>
      store.get('initialized'),
    );

    if (teams.length === 0 && !initializedRow?.value) {
      await Promise.all(defaultTeams.map((team) => this.saveTeam(team)));
      await this.savePreferences(defaultPreferences);
      await runStore<IDBValidKey>(META_STORE, 'readwrite', (store) => store.put({ key: 'initialized', value: true }));
      return { teams: defaultTeams, preferences: defaultPreferences };
    }

    const starterMigration = migrateLegacyStarterTeam(teams);
    if (starterMigration.changed) {
      await Promise.all(starterMigration.teams.filter((team) => team.id === STARTER_TEAM_ID).map((team) => this.saveTeam(team)));
    }

    return {
      teams: sortTeamsForList(starterMigration.teams),
      preferences: preferencesRow?.value ?? defaultPreferences,
    };
  },

  saveTeam(team: Team) {
    return runStore<IDBValidKey>(TEAM_STORE, 'readwrite', (store) => store.put(team));
  },

  deleteTeam(teamId: string) {
    return runStore<undefined>(TEAM_STORE, 'readwrite', (store) => store.delete(teamId));
  },

  savePreferences(preferences: UserPreference) {
    return runStore<IDBValidKey>(META_STORE, 'readwrite', (store) => store.put({ key: 'preferences', value: preferences }));
  },

  // All-or-nothing: the clear and every put share one transaction, and a put that throws aborts
  // it (see runTransaction), so a bad row in an import can never leave the store emptied.
  replaceTeams(teams: Team[]) {
    return runTransaction<void>(TEAM_STORE, 'readwrite', (transaction) => {
      const store = transaction.objectStore(TEAM_STORE);
      store.clear();
      teams.forEach((team) => store.put(team));
      return () => undefined;
    });
  },

  clearAll() {
    return runTransaction<void>([TEAM_STORE, META_STORE], 'readwrite', (transaction) => {
      transaction.objectStore(TEAM_STORE).clear();
      const metaStore = transaction.objectStore(META_STORE);
      metaStore.clear();
      metaStore.put({ key: 'initialized', value: true });
      return () => undefined;
    });
  },
};
