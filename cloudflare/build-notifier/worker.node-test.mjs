import assert from "node:assert/strict";
import test from "node:test";

import {
  branchPreviewSlug,
  buildDiscordPayload,
  shouldNotify,
} from "./worker.js";

function buildEvent(overrides = {}) {
  return {
    type: "cf.workersBuilds.worker.build.succeeded",
    source: { workerName: "luxraykit-app-preview" },
    payload: {
      buildTriggerMetadata: {
        branch: "agent/add-pokemon-fact-banner",
        commitHash: "bab2a4e44b9011033034097095bf7efdd002b290",
      },
    },
    ...overrides,
  };
}

test("turns a Git branch into the Cloudflare branch-preview alias", () => {
  assert.equal(
    branchPreviewSlug("agent/add-pokemon-fact-banner"),
    "agent-add-pokemon-fact-banner",
  );
});

test("formats the established English Discord notification", () => {
  const payload = buildDiscordPayload(buildEvent());
  assert.match(payload.content, /^\S+ \*\*LuxrayKit Preview\*\*/);
  assert.match(
    payload.content,
    /\*\*branch:\*\* \[agent\/add-pokemon-fact-banner\]\(https:\/\/github\.com\/ffkiyo7\/LuxrayKit\/tree\/agent\/add-pokemon-fact-banner\)/,
  );
  assert.match(payload.content, /\*\*commit:\*\* \[bab2a4e4\]/);
  assert.match(
    payload.content,
    /https:\/\/agent-add-pokemon-fact-banner-luxraykit-app-preview\.ffkiyo7\.workers\.dev/,
  );
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("accepts only successful builds for the preview worker", () => {
  assert.equal(shouldNotify(buildEvent()), true);
  assert.equal(
    shouldNotify(buildEvent({ type: "cf.workersBuilds.worker.build.failed" })),
    false,
  );
  assert.equal(
    shouldNotify({
      ...buildEvent(),
      source: { workerName: "luxraykit-app" },
    }),
    false,
  );
});

test("silently excludes all automation branches", () => {
  const event = buildEvent();
  event.payload.buildTriggerMetadata.branch =
    "automation/vgcpastes-team-refresh";
  assert.equal(shouldNotify(event), false);
});
