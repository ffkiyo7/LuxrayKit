const SOURCE_WORKER = "luxraykit-app-preview";
const REPOSITORY = "ffkiyo7/LuxrayKit";
const PREVIEW_SUBDOMAIN = "ffkiyo7";
const AUTOMATION_BRANCH_PREFIX = "automation/";
const SUCCESS_EVENT = "cf.workersBuilds.worker.build.succeeded";

export function branchPreviewSlug(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export function githubBranchUrl(branch) {
  const encodedBranch = branch
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://github.com/${REPOSITORY}/tree/${encodedBranch}`;
}

export function githubCommitUrl(commit) {
  return `https://github.com/${REPOSITORY}/commit/${encodeURIComponent(commit)}`;
}

export function formatUtc8(value) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return null;
  }
  return `${new Date(milliseconds + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ")} UTC+8`;
}

export function previewUrl(branch) {
  const slug = branchPreviewSlug(branch);
  return `https://${slug}-${SOURCE_WORKER}.${PREVIEW_SUBDOMAIN}.workers.dev`;
}

export function shouldNotify(event) {
  const branch = event?.payload?.buildTriggerMetadata?.branch;
  const commit = event?.payload?.buildTriggerMetadata?.commitHash;
  return (
    event?.type === SUCCESS_EVENT &&
    event?.source?.workerName === SOURCE_WORKER &&
    typeof branch === "string" &&
    branch.length > 0 &&
    branch !== "main" &&
    !branch.startsWith(AUTOMATION_BRANCH_PREFIX) &&
    typeof commit === "string" &&
    commit.length >= 8
  );
}

export function buildDiscordPayload(event) {
  const metadata = event.payload.buildTriggerMetadata;
  const branch = metadata.branch;
  const commit = metadata.commitHash;
  const shortCommit = commit.slice(0, 8);
  const deploymentUrl = previewUrl(branch);
  const renderedDeployTime =
    formatUtc8(event.payload.stoppedAt) ??
    formatUtc8(event.metadata?.eventTimestamp) ??
    "unavailable";

  return {
    username: "Cloudflare Builds",
    avatar_url: "https://www.cloudflare.com/favicon.ico",
    content: [
      "🧪 **LuxrayKit Preview**",
      `**branch:** [${branch}](${githubBranchUrl(branch)})`,
      `**commit:** [${shortCommit}](${githubCommitUrl(commit)})`,
      `**deploy time:** ${renderedDeployTime}`,
      `**Preview:** [Open deployment](${deploymentUrl})`,
    ].join("\n"),
    allowed_mentions: { parse: [] },
  };
}

async function sendDiscordNotification(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Discord webhook returned ${response.status}: ${detail}`);
  }
}

export default {
  async queue(batch, env) {
    if (!env.DISCORD_WEBHOOK_URL) {
      throw new Error("DISCORD_WEBHOOK_URL is not configured");
    }

    for (const message of batch.messages) {
      if (!shouldNotify(message.body)) {
        message.ack();
        continue;
      }

      try {
        await sendDiscordNotification(
          env.DISCORD_WEBHOOK_URL,
          buildDiscordPayload(message.body),
        );
        message.ack();
      } catch (error) {
        console.error("Preview notification failed", error);
        message.retry();
      }
    }
  },
};
