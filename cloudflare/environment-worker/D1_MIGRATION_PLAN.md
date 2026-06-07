# D1 Migration Plan

Current decision: keep production reads on KV for the first Worker release.

Reason:

- The current product needs one fresh environment snapshot and a small Pokemon-to-teams lookup index.
- KV is enough for read-heavy cached snapshots and avoids relational write/query overhead.
- D1 becomes useful when team search grows into multi-field filtering, multi-season history, analytics, or user/account data.

## Keep The API Shape Stable

The public API should not expose whether the backing store is KV or D1:

- `GET /api/environment/latest`
- `GET /api/environment/status`
- `GET /api/pokemon/:pokemonId/teams?battleType=singles&limit=24`

Future D1 reads can replace the internals behind these endpoints without changing the frontend contract.

## Candidate D1 Tables

```sql
CREATE TABLE environment_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regulation TEXT NOT NULL,
  season INTEGER NOT NULL,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES environment_snapshots(id),
  battle_type TEXT NOT NULL,
  rating INTEGER,
  rank INTEGER,
  source_url TEXT,
  raw_json TEXT NOT NULL
);

CREATE TABLE team_pokemon (
  team_id TEXT NOT NULL REFERENCES teams(id),
  pokemon_id TEXT NOT NULL,
  slot INTEGER,
  item_id TEXT,
  ability_id TEXT,
  tera_type TEXT,
  PRIMARY KEY (team_id, pokemon_id)
);

CREATE INDEX idx_team_pokemon_lookup
  ON team_pokemon (pokemon_id, team_id);

CREATE INDEX idx_teams_snapshot_battle_rating
  ON teams (snapshot_id, battle_type, rating DESC);
```

Optional later tables:

- `pokemon_usage` for ranking pages and trend history.
- `refresh_runs` for cron health and debugging.
- `team_moves` when move-level filtering becomes product-critical.

## Migration Phases

1. KV only: current implementation. Cron refresh writes `environment:latest`, `environment:status`, and `environment:team-index`.
2. D1 shadow write: create D1, add a `DB` binding, and write normalized rows during refresh while keeping public reads on KV.
3. D1 search read: route only search-heavy endpoints, such as Pokemon team lookup, to D1.
4. Hybrid steady state: keep KV for latest snapshot/status and D1 for indexed search/history.

## When To Start D1

Start D1 when one of these becomes true:

- Users need filters across season, battle type, Pokemon, item, ability, tera type, rating, and rank.
- The app keeps historical snapshots instead of only latest.
- Public search volume makes the single KV index too large or too frequently rebuilt.
- Product needs user-specific saved teams, favorites, notes, or analytics.
