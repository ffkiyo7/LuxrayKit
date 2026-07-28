# LuxrayKit Build Notifier

This queue consumer sends successful `luxraykit-app-preview` Workers Builds to
the `luxraykit-dev` Discord channel through an incoming webhook.

## Cloudflare resources

- Worker: `luxraykit-build-notifier`
- Queue: `luxraykit-build-events`
- Event subscription: successful builds from `luxraykit-app-preview`
- Secret: `DISCORD_WEBHOOK_URL`

The consumer rejects production Worker events, failed/started events, `main`,
and every `automation/` branch. Discord receives links to the GitHub branch,
commit, and Cloudflare branch Preview URL. It also renders the completed
deployment time in UTC+8.

The webhook URL is a Cloudflare secret and must never be committed. The Worker
has no public route and no production application bindings.

Run the dependency-free unit tests with:

```bash
node --test cloudflare/build-notifier/worker.node-test.mjs
```
