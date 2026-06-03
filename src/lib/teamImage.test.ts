import { describe, expect, it } from 'vitest';
import { defaultTeams } from '../data';
import { createTeamShareImage, createTeamShareImageWithEmbeddedAssets, resolveTeamShareSlots } from './teamImage';

describe('team image generation', () => {
  it('resolves team members into a 2x3 share image model', () => {
    const slots = resolveTeamShareSlots(defaultTeams[0]);

    expect(slots).toHaveLength(6);
    expect(slots[0]).toMatchObject({
      pokemonName: '烈咬陆鲨',
      itemName: '无道具',
      nature: '爽朗',
    });
    expect(slots[0].types).toContain('Dragon');
    expect(slots[0].moveNames).toContain('地震');
    expect(slots[1].pokemonName).toBe('炽焰咆哮虎');
  });

  it('creates a downloadable image data URL containing the team title and generated timestamp', () => {
    const image = createTeamShareImage(defaultTeams[0], {
      now: new Date('2026-06-03T12:34:56+08:00'),
      assetBaseUrl: 'http://localhost:5174',
    });
    const svg = decodeURIComponent(image.dataUrl.replace('data:image/svg+xml;charset=utf-8,', ''));

    expect(image.filename).toBe('champions-team-m-a-2026-06-03.svg');
    expect(svg).toContain('<svg');
    expect(svg).toContain('M-A 测试队');
    expect(svg).toContain('生成时间 2026-06-03 12:34');
    expect(svg).toContain('炽焰咆哮虎');
    expect(svg).toContain('文柚果');
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
