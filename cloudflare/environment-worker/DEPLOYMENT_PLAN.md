# Luxray Kit App Worker Migration Plan

## Can the Cloudflare plugin configure it directly?

In this Codex session, the Cloudflare plugin exposes Cloudflare skills and Wrangler guidance, but no direct MCP tool for creating Cloudflare account resources. Resource creation and deployment should be done through Wrangler CLI or the Cloudflare dashboard.

Codex can prepare and validate the local Worker code. After you confirm, Codex can also run Wrangler commands from this workspace if your local Wrangler auth is ready.

## Target Architecture

```text
GitHub / local
  -> npm run build
  -> Cloudflare Worker
       - serves dist static assets
       - handles /api/*
       - runs scheduled() refresh
       - stores environment data in KV now, D1 later if query volume grows

PokeDB Open Data
  -> Cloudflare Worker scheduled refresh
  -> Cloudflare KV latest environment snapshot
  -> Luxray Kit environment page reads Worker cache
```

Public users only read cached data. They should not trigger PokeDB fetches directly.

## Phase 1 - Unified Worker Cache

Implemented locally in this folder:

- `wrangler.jsonc`
- `src/index.ts`
- `src/worker-configuration.d.ts`
- `README.md`

Endpoints:

- `GET /health`
- `GET /api/environment/status`
- `GET /api/environment/latest`
- `GET /api/pokemon/:pokemonId/teams?battleType=singles&limit=24`
- `POST /api/environment/refresh`

Cron:

- `17 18 * * *` starts the daily refresh at 18:17 UTC.
- `*/15 * * * *` checks for and resumes stale refresh jobs.

Refresh behavior:

- Try `SEASON_CANDIDATES`, currently `2,1`.
- Use the first season where both singles and doubles ranked-team Open Data are available.
- Cache the result in KV.
- Build one KV-backed Pokemon team index so public team lookup does not parse the full snapshot on every request.
- If S2 Open Data still returns 404, the Worker falls back to S1.

Important limitation:

- This first Worker caches ranked-team Open Data only.
- It does not yet reproduce the richer local script that adds move stats and report-linked team samples.
- KV team lookup is a good MVP path. D1 with indexes is better if the API becomes a high-traffic public query surface.

Static asset behavior:

- `assets.directory = "../../dist"` serves the Vite build output.
- `assets.not_found_handling = "single-page-application"` keeps the PWA fallback behavior.
- `assets.run_worker_first = ["/api/*", "/health"]` routes API and health checks to code while static assets stay asset-first.

## Phase 2 - Cloudflare Resource Setup

Current deployment:

- Worker: `luxraykit-app`
- Production URL: `https://luxraykit.com`
- Worker dev URL: `https://luxraykit-app.ffkiyo7.workers.dev`
- Routes:
  - `luxraykit.com/*`
  - `www.luxraykit.com/*`
- KV production namespace: `43aafe9bdd2c4d01a980325d75eb9630`
- KV preview namespace: `880eb89e7fd44e7bbe582b224778b4ed`
- Cron:
  - Daily refresh: `17 18 * * *`
  - Stale-job watchdog: `*/15 * * * *`
- `ADMIN_REFRESH_TOKEN` is set as a Cloudflare Secret and is not stored in this repository.
- Legacy Pages project: `legacy-pages-pokemon-champions-tool`
  - Git auto deploy disabled.
  - Custom domains removed.
  - Only `pokemon-champions-tool.pages.dev` remains as a legacy fallback.

Automated deployment:

- Cloudflare Workers Builds is connected directly to the Git repository.
- The production branch is `main`.
- Cloudflare builds and deploys the latest `main` commit automatically.
- GitHub Actions does not deploy the Worker.
- `.github/workflows/ci.yml` only runs tests, builds the application, and
  validates the Worker bundle with a Wrangler dry run.
- Local Wrangler deployment commands are reserved for explicit maintenance
  or recovery work.

Install Wrangler and authenticate:

```bash
npm install
npx wrangler login
```

Create KV namespaces:

```bash
npx wrangler kv namespace create ENVIRONMENT_CACHE --config cloudflare/environment-worker/wrangler.jsonc
npx wrangler kv namespace create ENVIRONMENT_CACHE --preview --config cloudflare/environment-worker/wrangler.jsonc
```

Copy the returned IDs into `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "ENVIRONMENT_CACHE",
    "id": "<production namespace id>",
    "preview_id": "<preview namespace id>"
  }
]
```

Regenerate types after the IDs are filled:

```bash
npm run worker:app:types
```

Set admin refresh token:

```bash
npx wrangler secret put ADMIN_REFRESH_TOKEN --config cloudflare/environment-worker/wrangler.jsonc
```

Validate:

```bash
npm run worker:app:check
```

Deploy:

```bash
npm run worker:app:deploy
```

Prime cache:

```bash
curl -X POST "https://<worker-url>/api/environment/refresh" \
  -H "Authorization: Bearer <ADMIN_REFRESH_TOKEN>"
```

Verify:

```bash
curl "https://luxraykit.com/api/environment/status"
curl "https://luxraykit.com/api/environment/latest"
curl "https://luxraykit.com/api/pokemon/garchomp/teams?battleType=singles"
```

## Phase 3 - Frontend Integration

Recommended product behavior:

1. Keep bundled `public/data/pokedb/reg-ma-s1-environment.json` as first-paint and offline fallback.
2. On environment page mount, fetch same-origin `/api/environment/latest`.
3. Audit the Worker snapshot with existing `createEnvironmentStateFromPokeDbSnapshot`.
4. If usable and newer, replace in-memory environment state.
5. Add a "检查更新" button that re-reads Worker cache.
6. Show data status clearly:
   - `M-2 ranked teams`
   - `M-1 fallback`
   - `stale cache`
   - `offline bundled snapshot`

Do not expose public UI that calls `POST /api/environment/refresh`.

Route boundary:

- Static: `/`, `/assets/*`, `/data/*`, `manifest.webmanifest`, icons, images.
- Worker API: `/api/*`.
- Worker health: `/health`.
- SPA fallback: any frontend route that is not an asset and not `/api/*`.

## Phase 4 - Richer Snapshot

To make the Worker output match today's bundled S1 snapshot fully, choose one:

1. Port the local maintenance parser into the Worker or a Cloudflare scheduled maintenance Worker.
2. Keep the parser in CI, publish a complete JSON artifact, and let Worker cache that artifact.
3. Add client-side derivation of sample cards from raw ranked teams when report-linked team samples are missing.

Recommended next step:

- Phase 1 and 2 first.
- Then integrate frontend background reads.
- Only then decide whether rich move/team-sample parsing belongs in Worker, CI, or D1.

## Capacity Notes

Free should be enough for early testing because static assets are served without Worker execution, and public API reads only KV-backed cache.

Production should budget for Workers Paid if traffic becomes meaningful. The important pressure points are:

- Worker Free request quota is shared across all Worker requests.
- KV Free read/write quotas are daily and can fail when exceeded.
- D1 counts rows read, so indexed lookup matters if teams move into relational tables.

For `/api/pokemon/garchomp/teams?battleType=singles`, the current Worker uses a precomputed in-KV index generated during refresh. That is cheaper than parsing the full snapshot per request and avoids writing one KV key per Pokemon.

D1 migration is intentionally reserved but not bound in Phase 1. See `D1_MIGRATION_PLAN.md` for the future schema and KV -> D1 shadow-write path.
