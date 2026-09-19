// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readToolResults, recordToolResult } from './toolActivity';

const KEY = 'luxraykit.recentTools.v2';

beforeEach(() => {
  window.localStorage.clear();
});

describe('toolActivity tool results', () => {
  it('keeps the raw numbers a tool recorded, most recent first', () => {
    recordToolResult({ tool: 'typeChart', type: 'Fairy' });
    recordToolResult({
      tool: 'calculator',
      label: '喷火龙',
      minDamage: 148,
      maxDamage: 176,
      minPercent: 73.6,
      maxPercent: 87.6,
      hko: '确定两击击杀',
    });

    const [first, second] = readToolResults();
    expect(first).toMatchObject({ tool: 'calculator', minDamage: 148, maxDamage: 176, hko: '确定两击击杀' });
    expect(second).toMatchObject({ tool: 'typeChart', type: 'Fairy' });
  });

  it('holds one entry per tool and replaces the previous result of that tool', () => {
    recordToolResult({ tool: 'speed', label: '烈咬陆鲨', speed: 154 });
    recordToolResult({ tool: 'typeChart', type: 'Dragon' });
    recordToolResult({ tool: 'speed', label: '风妖精', speed: 184 });

    const results = readToolResults();
    expect(results.filter((result) => result.tool === 'speed')).toHaveLength(1);
    expect(results[0]).toMatchObject({ tool: 'speed', label: '风妖精', speed: 184 });
  });

  it('degrades to nothing recent for legacy, corrupt and half-written payloads', () => {
    // v1 stored a pre-rendered caption and no numbers.
    window.localStorage.setItem(KEY, JSON.stringify([{ tool: 'speed', label: '烈咬陆鲨', caption: '速度线 · 154' }]));
    expect(readToolResults()).toEqual([]);

    window.localStorage.setItem(KEY, '{not json');
    expect(readToolResults()).toEqual([]);

    window.localStorage.setItem(KEY, JSON.stringify([{ tool: 'calculator', label: '喷火龙', hko: '确定两击击杀' }]));
    expect(readToolResults()).toEqual([]);
  });
});
