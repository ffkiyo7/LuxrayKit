# Luxray Kit App Worker

The single production Worker `luxraykit-app`: it serves the Vite `dist/` frontend, the `/api/*` endpoints, the cron + Durable Object PokeDB refresh pipeline, the anonymous page-view counter and the feedback inbox. Production routes are `luxraykit.com` and `www.luxraykit.com`.

**The full reference lives in [docs/DEVELOPER_GUIDE.md §6](../../docs/DEVELOPER_GUIDE.md)** (Chinese). This README is only an index; add new facts there, not here.

| Topic | Guide section |
| --- | --- |
| API routes, `ETag` / 304 semantics, `x-luxray-*` headers | §6.1 |
| KV keys (`ENVIRONMENT_CACHE`) | §6.2 |
| Refresh pipeline (cron probe → DO alarm steps → retry), previous-season ranks | §6.3 |
| Custom domains | §6.4 |
| Diagnosing stale data, unsticking a refresh job | §6.5 |
| Local dev, secrets, one-time setup, priming an empty KV | §6.6 |
| Analytics Engine page views (`/api/ping`) | §6.7 |
| Feedback inbox (`/api/feedback`, DO SQLite) | §6.8 |
| Preview shadow Worker, deploy, CI | §9 |

## Files

- `wrangler.jsonc` — production config: assets, cron triggers, vars, KV / DO / Analytics Engine bindings, DO migrations (append-only; `v1` must never change).
- `wrangler.preview.jsonc` — preview shadow Worker `luxraykit-app-preview`: no DO, no cron, no custom domain, no admin secret; **shares the production KV**, so treat KV as read-only there.
- `src/index.ts` — fetch / scheduled handlers, refresh pipeline, `EnvironmentRefreshDurableObject`.
- `src/feedbackInbox.ts` — feedback validation, rate limiting and `FeedbackInboxDurableObject`.
- `src/index.test.ts`, `src/feedbackInbox.test.ts` — run by the root `npm test`.
- `src/worker-configuration.d.ts` — generated; rerun `npm run worker:app:types` after changing bindings, never edit by hand.

## Quick commands

```bash
npm run worker:app:dev     # build the frontend, then wrangler dev --test-scheduled
npm run worker:app:check   # build + deploy dry-run (CI runs worker:environment:check)

curl "https://luxraykit.com/api/environment/latest"
curl "https://luxraykit.com/api/environment/status"   # refresh status + audit health
curl "https://luxraykit.com/api/pokemon/garchomp/teams?battleType=singles"
```

Locally: `http://localhost:8787/health`, `/api/environment/status`, `/api/pokemon/garchomp/teams?battleType=singles`, and `/__scheduled` to fire the scheduled handler.

`ENVIRONMENT_AUDIT_UNKNOWN_THRESHOLD` defaults to `0`: any unknown Pokemon, item, move, ability, nature, or failed detail key marks the status as degraded.

## Ideas not implemented

From the original integration plan; the frontend already does the rest (Worker snapshot first, bundled JSON as offline fallback, newer-snapshot selection — see guide §5.3).

- A "检查更新" button that re-reads the Worker cache. Public users must never trigger PokeDB fetches directly.
- Pokemon detail pages reading `/api/pokemon/:pokemonId/teams` instead of the full snapshot (the endpoint exists; the frontend does not call it yet).
- Moving structured team lookup to D1 if the KV team index becomes too limited. D1 is deliberately not configured; the API shape allows adding it behind the same endpoints.
