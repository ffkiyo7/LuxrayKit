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
