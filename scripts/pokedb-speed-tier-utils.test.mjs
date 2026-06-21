import { describe, expect, it } from 'vitest';
import { parsePokeDbSpeedTable } from './pokedb-speed-tier-utils.mjs';

const chip = (dex, form, name) =>
  `<a class="speed-chip" href="/pokemon/show/${dex}-${form}?season=3&rule=1" target="_blank">` +
  `<i class="poke-icon-96 poke-icon-32 dex-${dex}-${form}-96"></i>` +
  `<div class="speed-chip__name">${name}</div>` +
  `</a>`;

describe('PokeDB speed tier parser', () => {
  it('maps Japanese investment labels, captures chip pokemon, and sorts by speed', () => {
    const html = `
      <div class="speed-table__row">
        <div class="speed-table__speed"><span class="is-family-monospace">120</span></div>
        <div class="speed-chips-group">
          <div class="speed-chips-group__label"><span>無振</span>80族</div>
          ${chip('0006', '00', 'リザードン')}
        </div>
      </div>
      <div class="speed-table__row">
        <div class="speed-table__speed"><span class="is-family-monospace">178</span></div>
        <div class="speed-chips-group">
          <div class="speed-chips-group__label"><span>最速</span>110族</div>
          ${chip('0405', '00', 'レントラー')}${chip('0026', '00', 'ライチュウ')}
        </div>
        <div class="speed-chips-group">
          <div class="speed-chips-group__label"><span>準速</span>126族</div>
          ${chip('0398', '00', 'ムクホーク')}
        </div>
      </div>`;

    expect(parsePokeDbSpeedTable(html, 1)).toEqual({
      rule: 1,
      tiers: [
        {
          speed: 178,
          label: '极速110族',
          count: 2,
          code: '110',
          color: '#ff6f61',
          pokemon: [
            { dexNo: 405, form: '00', japaneseName: 'レントラー' },
            { dexNo: 26, form: '00', japaneseName: 'ライチュウ' },
          ],
        },
        {
          speed: 178,
          label: '满速126族',
          count: 1,
          code: '126',
          color: '#6c8cff',
          pokemon: [{ dexNo: 398, form: '00', japaneseName: 'ムクホーク' }],
        },
        {
          speed: 120,
          label: '0速80族',
          count: 1,
          code: '80',
          color: '#4fd1a0',
          pokemon: [{ dexNo: 6, form: '00', japaneseName: 'リザードン' }],
        },
      ],
    });
  });
});
