export const productName = 'LuxrayKit';

// Season/regulation labels are no longer hard-coded here — they are derived from the live
// PokeDB snapshot (season) and the date-based schedule (regulation) in `./data/schedule`.

/**
 * Where 「反馈」 goes. The repository is public with Issues enabled and Discussions off, so
 * every entry point is an issue form; `general` uses the chooser so a report that fits
 * neither template can still start from a blank issue (see .github/ISSUE_TEMPLATE/config.yml).
 * Template file names must stay in sync with .github/ISSUE_TEMPLATE/.
 */
export const repositoryUrl = 'https://github.com/ffkiyo7/LuxrayKit';

export const feedbackLinks = {
  bug: `${repositoryUrl}/issues/new?template=bug_report.md`,
  feature: `${repositoryUrl}/issues/new?template=feature_request.md`,
  general: `${repositoryUrl}/issues/new/choose`,
} as const;

export type FeedbackKind = keyof typeof feedbackLinks;
