# Bottom Nav Keyboard Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every keyboard/visual-viewport path that can leave the bottom Tab floating over content while preserving the existing long-page auto-hide behavior and keeping active search lists/sheets usable above the soft keyboard.

**Architecture:** `BottomNav` returns to a layout-only fixed element at `bottom: 0`; it never reads or writes visual viewport offsets. A small shared `useVisualViewportMetrics` hook exposes viewport measurements only to interactive search panels and bottom sheets, which calculate their own local height/offset without mutating global CSS.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind CSS, Playwright mobile visual regression.

---

## File map

- Create `src/hooks/useVisualViewportMetrics.ts`: read visual viewport metrics and subscribe only while a local keyboard-aware surface is active.
- Create `src/hooks/useVisualViewportMetrics.test.tsx`: prove viewport resize/scroll updates and listener cleanup.
- Create `src/components/BottomNav.test.tsx`: prove shown/hidden transforms are independent of visual viewport state.
- Modify `src/components/BottomNav.tsx`: remove viewport listeners/global CSS variable and use stable bottom positioning.
- Create `src/styles.test.ts`: prevent `.safe-bottom` from regaining the global viewport offset.
- Modify `src/styles.css`: restore static bottom safe spacing.
- Modify `src/hooks/useAutoHideBottomNav.test.tsx`: lock in down/up/idle/top/bottom long-page behavior.
- Modify `src/components/PokemonPicker.tsx`: consume shared local viewport metrics without global writes.
- Modify `src/pages/SpeedPage.tsx`: cap the open result list to the visual viewport and keep internal scrolling.
- Modify `src/pages/SpeedPage.test.tsx`: reproduce the small visual viewport selection path.
- Modify `src/pages/TeamPage.tsx`: keep the team-name bottom sheet above the keyboard with local metrics.

### Task 1: Shared local visual viewport metrics

**Files:**
- Create: `src/hooks/useVisualViewportMetrics.test.tsx`
- Create: `src/hooks/useVisualViewportMetrics.ts`

- [ ] **Step 1: Write the failing hook test**

Create a jsdom test with a mutable fake `VisualViewport`. Render this harness:

```tsx
function Harness({ enabled = true }: { enabled?: boolean }) {
  const metrics = useVisualViewportMetrics(enabled);
  return <output data-testid="metrics">{JSON.stringify(metrics)}</output>;
}
```

Assert the initial metrics are `{ height: 500, offsetTop: 20, bottomInset: 324 }` when `innerHeight` is 844, then mutate the fake viewport to `height: 700`, `offsetTop: 0`, dispatch its stored `resize` callback, and assert `{ height: 700, offsetTop: 0, bottomInset: 144 }`. Unmount and assert both `resize` and `scroll` listeners were removed.

- [ ] **Step 2: Run the hook test and verify RED**

Run: `npm test -- src/hooks/useVisualViewportMetrics.test.tsx`

Expected: FAIL because `./useVisualViewportMetrics` does not exist.

- [ ] **Step 3: Implement the minimal shared hook**

```ts
import { useEffect, useState } from 'react';

export type VisualViewportMetrics = {
  height: number;
  offsetTop: number;
  bottomInset: number;
};

const readVisualViewportMetrics = (): VisualViewportMetrics => {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  return {
    height,
    offsetTop,
    bottomInset: viewport ? Math.max(0, window.innerHeight - height - offsetTop) : 0,
  };
};

export function useVisualViewportMetrics(enabled = true) {
  const [metrics, setMetrics] = useState(readVisualViewportMetrics);

  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    const update = () => setMetrics(readVisualViewportMetrics());
    update();
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return metrics;
}
```

- [ ] **Step 4: Run the hook test and verify GREEN**

Run: `npm test -- src/hooks/useVisualViewportMetrics.test.tsx`

Expected: PASS with one test file and no warnings.

### Task 2: Decouple BottomNav and preserve static safe spacing

**Files:**
- Create: `src/components/BottomNav.test.tsx`
- Modify: `src/components/BottomNav.tsx`
- Create: `src/styles.test.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing BottomNav and CSS tests**

Render `BottomNav` with one `tools` tab and assert:

```tsx
expect(nav.style.bottom).toBe('0px');
expect(nav.style.transform).toBe('translate3d(0, 0, 0)');
rerender(<BottomNav activeTab="tools" tabs={tabs} onChange={() => {}} hidden />);
expect(nav.style.transform).toBe('translate3d(0, 100%, 0)');
expect(document.documentElement.style.getPropertyValue('--lk-bottom-nav-offset')).toBe('');
```

In `src/styles.test.ts`, read `styles.css` and assert the `.safe-bottom` rule contains `84px + env(safe-area-inset-bottom)` and does not contain `--lk-bottom-nav-offset`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/components/BottomNav.test.tsx src/styles.test.ts`

Expected: FAIL because current styles use `var(--lk-bottom-nav-offset)` and the hidden transform includes that variable.

- [ ] **Step 3: Implement stable BottomNav positioning**

Remove the `useEffect` import and the entire viewport-listener effect from `BottomNav.tsx`. Use:

```tsx
<nav
  className="fixed inset-x-0 bottom-0 ..."
  data-hidden={hidden ? 'true' : 'false'}
  style={{ transform: hidden ? 'translate3d(0, 100%, 0)' : 'translate3d(0, 0, 0)' }}
>
```

Change `.safe-bottom` to:

```css
.safe-bottom {
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/components/BottomNav.test.tsx src/styles.test.ts`

Expected: PASS.

### Task 3: Lock in the long-page auto-hide experience

**Files:**
- Modify: `src/hooks/useAutoHideBottomNav.test.tsx`

- [ ] **Step 1: Add regression cases before changing any hook code**

Using the existing 400px viewport / 2000px content harness and fake timers, add assertions for this exact sequence:

```tsx
scrollContainer.scrollTop = 240; // down >= threshold -> hidden
fireEvent.scroll(scrollContainer);
flushScrollFrame();
expect(state()).toBe('hidden');

scrollContainer.scrollTop = 200; // up >= threshold -> shown
fireEvent.scroll(scrollContainer);
flushScrollFrame();
expect(state()).toBe('shown');

scrollContainer.scrollTop = 0; // top -> shown
fireEvent.scroll(scrollContainer);
flushScrollFrame();
expect(state()).toBe('shown');
```

Keep the existing idle and bottom-edge tests unchanged.

- [ ] **Step 2: Run the hook suite**

Run: `npm test -- src/hooks/useAutoHideBottomNav.test.tsx`

Expected: PASS without production-hook changes. If it fails, treat that as a pre-existing regression and diagnose before continuing.

### Task 4: Keep search lists and bottom sheets above the keyboard locally

**Files:**
- Modify: `src/components/PokemonPicker.tsx`
- Modify: `src/pages/SpeedPage.tsx`
- Modify: `src/pages/SpeedPage.test.tsx`
- Modify: `src/pages/TeamPage.tsx`

- [ ] **Step 1: Write the failing SpeedPage small-viewport test**

Install a fake visual viewport with `height: 320`, `offsetTop: 0`, open “搜索宝可梦”, and assert the results container identified by `data-speed-search-results` has an inline `max-height` no greater than `208px`, greater than `0px`, and includes `overflow-y-auto`. Select `Staraptor` and assert the search textbox disappears while the page remains interactive.

- [ ] **Step 2: Run the SpeedPage test and verify RED**

Run: `npm test -- src/pages/SpeedPage.test.tsx`

Expected: FAIL because the results container has no local visual-viewport height calculation or test marker.

- [ ] **Step 3: Refactor PokemonPicker to the shared metrics hook**

Replace its private viewport subscription with:

```tsx
const viewport = useVisualViewportMetrics(open);
const maxHeight = Math.min(viewport.height * 0.92, window.innerHeight * 0.7);
const sheetStyle = { bottom: viewport.bottomInset, maxHeight: `${Math.round(maxHeight)}px` };
```

Keep its visible behavior and list scrolling unchanged.

- [ ] **Step 4: Add local SpeedPage result-list sizing**

Read `useVisualViewportMetrics(searchOpen)`, attach a ref to the dropdown panel, and in `useLayoutEffect` calculate:

```ts
const visibleBottom = viewport.offsetTop + viewport.height;
const panelTop = searchPanelRef.current?.getBoundingClientRect().top ?? 0;
const inputAndSpacing = 58;
setSearchResultsMaxHeight(Math.max(48, Math.min(208, visibleBottom - panelTop - inputAndSpacing - 12)));
```

Render the list with `data-speed-search-results`, `overflow-y-auto`, and the calculated inline `maxHeight`. Recalculate on viewport metrics changes and when the search opens.

- [ ] **Step 5: Make TeamNameModal keyboard-aware locally**

Call `useVisualViewportMetrics(open)` before the early return and apply only to the sheet:

```tsx
style={{
  bottom: viewport.bottomInset,
  maxHeight: `${Math.round(viewport.height * 0.92)}px`,
}}
```

Add `overflow-y-auto`; do not write any global CSS variable or change BottomNav.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/hooks/useVisualViewportMetrics.test.tsx src/components/BottomNav.test.tsx src/styles.test.ts src/hooks/useAutoHideBottomNav.test.tsx src/pages/SpeedPage.test.tsx`

Expected: all focused tests PASS with no React act warnings.

### Task 5: Full verification and browser regression

**Files:**
- No production changes unless verification reveals a requirement failure.

- [ ] **Step 1: Run full unit suite**

Run: `npm test`

Expected: all test files PASS, zero failed tests.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript build and Vite production build exit 0.

- [ ] **Step 3: Run mobile visual regression**

Run: `npm run test:visual`

Expected: mobile visual smoke test passes without unexpected snapshot differences.

- [ ] **Step 4: Verify browser interaction matrix**

At 390×844, inspect environment and dex long pages for down-hide, up-show, idle-show, top-show and bottom-show. Open/close every text-entry or selection surface found by `rg -n 'autoFocus|type="text"|inputMode="search"' src`, then verify the bottom Tab is either flush with the viewport bottom or fully hidden by the unchanged auto-hide logic, never floating over content. Confirm SpeedPage search results stay scrollable in the available visual viewport and selecting a Pokémon closes the list.

- [ ] **Step 5: Review final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only plan-scoped source/tests/docs are changed.
