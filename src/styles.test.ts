// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('safe bottom spacing', () => {
  it('reserves only the fixed nav and safe-area height', () => {
    const rule = styles.match(/\.safe-bottom\s*\{([^}]*)\}/)?.[1];

    expect(rule).toContain('84px + env(safe-area-inset-bottom)');
    expect(rule).not.toContain('--lk-bottom-nav-offset');
  });
});
