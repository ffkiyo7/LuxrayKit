# Luxray Kit App Worker

This Worker is the migration target for running Luxray Kit as one Cloudflare Workers app:

- Static assets serve the Vite `dist` frontend.
- `/api/*` routes run in the Worker.
- Production routes are `https://luxraykit.com/*` and `https://www.luxraykit.com/*`.
- Scheduled cron probes PokeDB on a few fixed times per day; when the source changes it creates a refresh job that a Durable Object alarm steps to completion (see "Refresh pipeline" below).
- KV stores the latest usable snapshot.
- The app reads `GET /api/environment/latest`.
- Pokemon-specific recommendations read `GET /api/pokemon/:pokemonId/teams?battleType=singles`.
- Optional admin refresh uses `POST /api/environment/refresh` with `Authorization: Bearer <token>`.

The Worker dynamically detects the latest PokeDB season, caches Pokemon ranking/detail statistics, adds report-linked team samples from the previous season, and exposes audit health in `/api/environment/status`.

## Refresh pipeline (cron + Durable Object alarm)

Refreshes are driven by cron + a Durable Object alarm, not by `env.SELF.fetch` self-chaining.

1. **Probe (`scheduled` handler):** each cron tick (times in `wrangler.jsonc`, clustered around PokeDB's ~00:30 JST daily publish plus sparse safety-net checks) waits a random jitter (`SCHEDULED_MAX_JITTER_MS`), fetches one cheap list page, and compares a `season + updated-date` content signature. Unchanged ⇒ cheap exit. Changed ⇒ create a refresh job in KV (`environment:refresh-job`).
2. **Step (`EnvironmentRefreshDurableObject.alarm`):** the alarm runs `runRefreshJobStep` every `REFRESH_ALARM_DELAY_MS` (1s), advancing the cursor-batched detail fetch until the job is `done`, then deletes the job and the alarm.
3. **Retry:** a failed step increments `failureCount`; at `MAX_REFRESH_JOB_FAILURES` (6) the job is abandoned (logged), otherwise it retries after `REFRESH_ALARM_FAILURE_RETRY_MS` (10min).

Why a DO instead of cron self-chaining: the Workers free plan caps **50 external subrequests per invocation**, so details are fetched in cursor batches (`POKEDB_DETAIL_CHUNK_SIZE`). The old self-chain lost its `waitUntil` subrequests when the cron parent invocation ended, freezing jobs and leaving data stale. The DO alarm owns the stepping instead.

`POST /api/environment/refresh` (admin-only) triggers the same job manually; `?step=1&jobId=<id>` runs a single step. The cron/DO path needs no token.

## Files

- `wrangler.jsonc` - Worker config, static assets, cron trigger, KV binding, public vars.
- `src/index.ts` - Worker fetch and scheduled handlers.
- `src/worker-configuration.d.ts` - Generated Cloudflare runtime and binding types.
- `D1_MIGRATION_PLAN.md` - Future relational schema and KV-to-D1 migration notes.

## One-Time Cloudflare Setup

Install/authenticate Wrangler:

```bash
npm install -D wrangler
npx wrangler login
```

Create KV namespaces:

```bash
npx wrangler kv namespace create ENVIRONMENT_CACHE --config cloudflare/environment-worker/wrangler.jsonc
npx wrangler kv namespace create ENVIRONMENT_CACHE --preview --config cloudflare/environment-worker/wrangler.jsonc
```

Copy the returned `id` and `preview_id` into `cloudflare/environment-worker/wrangler.jsonc`.

Regenerate Worker types after changing bindings:

```bash
npm run worker:app:types
```

Set an admin refresh token:

```bash
npx wrangler secret put ADMIN_REFRESH_TOKEN --config cloudflare/environment-worker/wrangler.jsonc
```

Deploy:

```bash
npm run worker:app:deploy
```

Prime the cache once:

```bash
curl -X POST "https://luxraykit-app.ffkiyo7.workers.dev/api/environment/refresh" \
  -H "Authorization: Bearer <ADMIN_REFRESH_TOKEN>"
```

Read the latest snapshot:

```bash
curl "https://luxraykit.com/api/environment/latest"
```

Read refresh status and audit health:

```bash
curl "https://luxraykit.com/api/environment/status"
```

`ENVIRONMENT_AUDIT_UNKNOWN_THRESHOLD` defaults to `0`, so any unknown Pokemon, item, move, ability, nature, or failed detail key marks status as degraded.

Read teams related to a Pokemon:

```bash
curl "https://luxraykit.com/api/pokemon/garchomp/teams?battleType=singles"
```

## Local Development

```bash
npm run worker:app:dev
```

Then visit:

- `http://localhost:8787/health`
- `http://localhost:8787/api/environment/status`
- `http://localhost:8787/api/pokemon/garchomp/teams?battleType=singles`
- `http://localhost:8787/__scheduled` to trigger the scheduled handler locally

## Product Integration Plan

1. Deploy this Worker with `assets.directory = "../../dist"` so it serves the frontend and API together.
2. Keep the bundled JSON as the offline and first-paint fallback.
3. On the environment page, fetch the Worker snapshot in the background.
4. If the Worker snapshot audits cleanly and is newer, replace the in-memory environment state.
5. Add a small "检查更新" button that re-reads Worker cache. Do not let public users trigger PokeDB fetches directly.
6. For Pokemon detail pages, prefer `/api/pokemon/:pokemonId/teams` over downloading the full snapshot repeatedly.
7. Later, move structured team lookup to D1 with indexes if the KV team index becomes too limited.

D1 is deliberately not configured for the first deployment. The API shape is stable enough to add D1 later behind the same endpoints.
