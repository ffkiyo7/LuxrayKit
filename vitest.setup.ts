import { configure } from '@testing-library/dom';
import { beforeEach } from 'vitest';

// Every page in App.tsx is `lazy()`, so the first `findBy*` after a route change is waiting on
// a dynamic import, not on a render. Testing Library's 1000ms default is enough on a developer
// machine and not enough on a loaded one: the Cloudflare production build (where App.test.tsx
// takes ~70s instead of ~25s) failed on the 写留言 sheet at 1402ms and blocked the deploy,
// while GitHub CI stayed green on the same commit. Individual waits already opt into
// `{ timeout: 5000 }` one at a time; this makes that the floor everywhere so the next lazy
// route added does not have to remember. A genuinely missing element now takes 5s to report
// instead of 1s — only paid on failure.
configure({ asyncUtilTimeout: 5000 });

// Hash routing keeps navigation in `location.hash`, and jsdom carries the URL (plus its
// session history state) across tests inside a file. Reset both before every test so a
// case never inherits the previous one's screen. replaceState — not `location.hash = ''` —
// because it also clears the `lkDepth` marker that `useHashRoute().back()` reads.
if (typeof window !== 'undefined') {
  beforeEach(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  });
}

// jsdom does not implement window.scrollTo, so any component that resets the
// window scroll position (e.g. EnvironmentPage view switches) would otherwise
// flood the test output with "Not implemented: Window's scrollTo()" noise.
// Stub it as a no-op in browser-like (jsdom) test environments.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}

if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function scrollTo(options?: ScrollToOptions | number, y?: number) {
    if (typeof options === 'number') {
      this.scrollLeft = options;
      this.scrollTop = y ?? 0;
      return;
    }
    this.scrollLeft = options?.left ?? this.scrollLeft;
    this.scrollTop = options?.top ?? this.scrollTop;
  };
}
