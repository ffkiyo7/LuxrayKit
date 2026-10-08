// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

const lightBlock = styles.match(/:root\[data-theme='light'\]\s*\{([^}]*)\}/)?.[1] ?? '';

const lightToken = (name: string) => {
  const value = lightBlock.match(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`));
  if (!value) throw new Error(`--${name} missing from the light theme`);
  return value.slice(1, 4).map(Number);
};

/** WCAG 2.x contrast ratio between two sRGB colours. */
const contrast = (a: number[], b: number[]) => {
  const luminance = (rgb: number[]) => {
    const [r, g, bl] = rgb.map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

describe('light theme text contrast', () => {
  // The small gray text (counters, English names, tool card labels) must stay readable: WCAG AA
  // asks 4.5:1 for text this size. `chevron` is exempt because it is for icons only.
  it.each(['color-text-secondary', 'color-text-muted'])('%s reaches 4.5:1 on the page and card', (token) => {
    for (const background of ['color-page', 'color-card']) {
      expect(contrast(lightToken(token), lightToken(background))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('safe bottom spacing', () => {
  it('reserves only the fixed nav and safe-area height', () => {
    const rule = styles.match(/\.safe-bottom\s*\{([^}]*)\}/)?.[1];

    // Floored so the document height does not move with Safari's toolbar (R34).
    expect(rule).toContain('84px + max(env(safe-area-inset-bottom), 34px)');
    expect(rule).not.toContain('--lk-bottom-nav-offset');
  });
});
