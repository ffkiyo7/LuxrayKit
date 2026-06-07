import { describe, expect, it } from 'vitest';
import { defaultTeams } from '../data';
import { createTeamShareImage, createTeamShareImageWithEmbeddedAssets, resolveTeamShareSlots } from './teamImage';

describe('team image generation', () => {
  it('resolves team members into a 2x3 share image model', () => {
    const slots = resolveTeamShareSlots(defaultTeams[0]);

    expect(slots).toHaveLength(6);
    expect(slots[0]).toMatchObject({
      pokemonName: '伦琴猫',
      itemName: '磁铁',
      nature: '爽朗',
    });
    expect(slots[0].types).toContain('Electric');
    expect(slots[0].moveNames).toContain('疯狂伏特');
    expect(slots[1].pokemonName).toBe('空位');
  });

  it('creates a downloadable image data URL containing the team title and generated timestamp', () => {
    const image = createTeamShareImage(defaultTeams[0], {
      now: new Date('2026-06-03T12:34:56+08:00'),
      assetBaseUrl: 'http://localhost:5174',
    });
    const svg = decodeURIComponent(image.dataUrl.replace('data:image/svg+xml;charset=utf-8,', ''));

    expect(image.filename).toBe('luxraykit-team-luxray-test-2026-06-03.svg');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Luxray test');
    expect(svg).toContain('LuxrayKit');
    expect(svg).toContain('生成时间 2026-06-03 12:34');
    expect(svg).toContain('伦琴猫');
    expect(svg).toContain('磁铁');
  });

  it('embeds local artwork and item assets before creating the preview image', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(new Blob(['fake-png'], { type: 'image/png' }), {
        status: 200,
      });

    try {
      const image = await createTeamShareImageWithEmbeddedAssets(defaultTeams[0], {
        now: new Date('2026-06-03T12:34:56+08:00'),
        assetBaseUrl: 'http://localhost:5174',
      });
      const svg = decodeURIComponent(image.dataUrl.replace('data:image/svg+xml;charset=utf-8,', ''));

      expect(svg).toContain('data:image/png;base64,');
      expect(svg).not.toContain('http://localhost:5174/assets/pokemon');
      expect(svg).not.toContain('http://localhost:5174/assets/items');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
