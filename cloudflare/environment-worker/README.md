# Luxray Kit App Worker

This Worker is the migration target for running Luxray Kit as one Cloudflare Workers app:

- Static assets serve the Vite `dist` frontend.
- `/api/*` routes run in the Worker.
- Production routes are `https://luxraykit.com/*` and `https://www.luxraykit.com/*`.
- Cron refreshes PokeDB Open Data once per day.
- KV stores the latest usable snapshot.
- The app reads `GET /api/environment/latest`.
- Pokemon-specific recommendations read `GET /api/pokemon/:pokemonId/teams?battleType=singles`.
- Optional admin refresh uses `POST /api/environment/refresh` with `Authorization: Bearer <token>`.

The first implementation caches ranked-team Open Data only. It intentionally does not yet reproduce the richer local maintenance parser that adds move stats and report-linked team samples.

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
7. Later, port the richer parser for move stats and report-linked team samples into a server-side maintenance path, or move structured team lookup to D1 with indexes.

D1 is deliberately not configured for the first deployment. The API shape is stable enough to add D1 later behind the same endpoints.
