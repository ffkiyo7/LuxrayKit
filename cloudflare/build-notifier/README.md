# LuxrayKit Build Notifier

Queue consumer that posts each successful build of the preview shadow Worker
`luxraykit-app-preview` to the `luxraykit-dev` Discord channel. How preview
fits into deploys: [docs/DEVELOPER_GUIDE.md §9](../../docs/DEVELOPER_GUIDE.md).

| Cloudflare resource | Name |
| --- | --- |
| Worker | `luxraykit-build-notifier` (no public route, no app bindings) |
| Queue | `luxraykit-build-events` |
| Event subscription | successful builds of `luxraykit-app-preview` |
| Secret | `DISCORD_WEBHOOK_URL` — never commit it |

`shouldNotify` (`worker.js`) drops everything except
`cf.workersBuilds.worker.build.succeeded` from `luxraykit-app-preview`, and
skips `main` and every `automation/` branch. The message links the GitHub
branch, the commit, and the branch preview alias
`https://<branch-slug>-luxraykit-app-preview.ffkiyo7.workers.dev` (stable per
branch), with the finish time in UTC+8.

There is no wrangler config for this Worker in the repo. Its tests are named
`*.node-test.mjs` so vitest skips them; they are **not** run by CI:

```bash
node --test cloudflare/build-notifier/worker.node-test.mjs
```
