export const productName = 'LuxrayKit';

// Season/regulation labels are no longer hard-coded here — they are derived from the live
// PokeDB snapshot (season) and the date-based schedule (regulation) in `./data/schedule`.

export const repositoryUrl = 'https://github.com/ffkiyo7/LuxrayKit';

/**
 * The one remaining GitHub feedback exit, kept as a small link under 「关于」.
 *
 * Feedback itself now goes through the in-app message form (`pages/profile/FeedbackSheet.tsx`
 * → `POST /api/feedback`): the three issue entry points this replaced all forced a GitHub
 * login, which is the highest possible barrier for an app that otherwise needs no account.
 * The issue templates stay in `.github/ISSUE_TEMPLATE/` — they are still useful to anyone
 * who arrives from GitHub itself.
 */
export const feedbackLinks = {
  general: `${repositoryUrl}/issues/new/choose`,
} as const;
