/// <reference types="vite/client" />

/**
 * Build identifier injected by `vite.config.ts` (`define`): the git short SHA of the commit
 * that produced this bundle, or an ISO build timestamp when git is unavailable. Surfaced in
 * 「我的 → 关于」 so a bug report can name the exact build.
 */
declare const __APP_BUILD__: string;
