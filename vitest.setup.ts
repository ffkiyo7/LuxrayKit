import { beforeEach } from 'vitest';

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
