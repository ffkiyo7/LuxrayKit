// M-C Mega form catalog
// Hand-authored on 2026-09-09 from the PokéBase Champions Pokémon list payload
// (https://pokebase.app/pokemon-champions/pokemon — `name` / stats / `type` / `abilities` /
// `regulationSets: ["M-C"]`), cross-checked field by field against Bulbapedia.
//
// A third source corroborates every type and stat line below independently of both: @smogon/calc's
// own Gen 9 dex, already a dependency, carries all six as Absol-Mega-Z / Garchomp-Mega-Z /
// Lucario-Mega-Z / Salamence-Mega / Golisopod-Mega / Baxcalibur-Mega with identical types and base
// stats. Its *ability* field is NOT trustworthy for these forms, though: it reports the plain Mega's
// ability for each Z form (Magic Bounce / Sand Force / Adaptability instead of Sharpness / Levitate /
// Aura Guard), so it was not used for abilities.
//
// Per-form verification notes (types and stats agree across all three sources for all six):
// - mega-absol-z      PokéBase + Bulbapedia agree: Dark/Ghost, Sharpness.
// - mega-garchomp-z   Mono-Dragon (the parent's Ground is dropped, which is what makes Levitate
//                     coherent). PokéBase and Bulbapedia agree. RotomLabs' pre-launch article
//                     claims Dragon/Ground — treated as that site's error, not a real conflict.
// - mega-lucario-z    PokéBase + Bulbapedia agree: Fighting/Steel, Aura Guard (signature).
// - mega-salamence    PokéBase + Bulbapedia agree: Dragon/Flying, Aerilate.
// - mega-golisopod    ⚠️ THE ONE CONTESTED FIELD. PokéBase lists NO ability for this form (empty
//                     `abilities`). Bug/Steel and the stats are three-way confirmed. The ability is
//                     Bulbapedia-only: `abilitym=Tough Claws` on its Golisopod page plus the Tough
//                     Claws ability page's `Ability/entry|0768|form=-Mega`. Both PokémonDB and
//                     @smogon/calc instead report Emergency Exit — which is the *base* form's ability,
//                     i.e. the same slot-0 inheritance artefact that makes @smogon/calc wrong about all
//                     three Z Megas, so neither is treated as a real contradiction. `tough-claws` is
//                     taken as the best-supported value; re-verify in game.
// - mega-baxcalibur   PokéBase also lists no ability, but `thermal-exchange` is corroborated twice:
//                     Bulbapedia (`abilitym=Thermal Exchange` + `Ability/entry|0998|form=-Mega`) and
//                     @smogon/calc's Baxcalibur-Mega entry. Not the base form's ability, so it is not
//                     an inheritance artefact.
//
// The three Z Megas share a parent with an already-catalogued plain Mega, so this table must be
// concatenated into the M-A table rather than spread over it — see `mergeMegaFormsByParentId`.
import type { PokemonForm } from '../../../types';

const mcMegaRefs = ['reg-mc-official-mega-list', 'pokebase-champions-mega-data', 'manual-seed-review'];
const artwork = (id: string) => `/assets/pokemon/thumbs/${id}.png`;

export const mcMegaFormsByParentId: Record<string, PokemonForm[]> = {
  'absol': [
    {
      id: 'mega-absol-z',
      pokemonId: 'absol',
      name: 'Mega Absol Z',
      chineseName: '超级阿勃梭鲁Z',
      englishName: 'Mega Absol Z',
      japaneseName: 'メガアブソルZ',
      iconRef: artwork('mega-absol-z'),
      isMega: true,
      requiredItemId: 'absolite-z',
      types: ['Dark', 'Ghost'],
      baseStats: { hp: 65, attack: 154, defense: 60, specialAttack: 75, specialDefense: 60, speed: 151 },
      abilities: ['sharpness'],
      legalInCurrentRule: true,
      sourceRefs: mcMegaRefs,
    },
  ],
  'baxcalibur': [
    {
      id: 'mega-baxcalibur',
      pokemonId: 'baxcalibur',
      name: 'Mega Baxcalibur',
      chineseName: '超级戟脊龙',
      englishName: 'Mega Baxcalibur',
      japaneseName: 'メガセグレイブ',
      iconRef: artwork('mega-baxcalibur'),
      isMega: true,
      requiredItemId: 'baxcalibrite',
      types: ['Dragon', 'Ice'],
      baseStats: { hp: 115, attack: 175, defense: 117, specialAttack: 105, specialDefense: 101, speed: 87 },
      abilities: ['thermal-exchange'],
      legalInCurrentRule: true,
      sourceRefs: mcMegaRefs,
    },
  ],
  'garchomp': [
    {
      id: 'mega-garchomp-z',
      pokemonId: 'garchomp',
      name: 'Mega Garchomp Z',
      chineseName: '超级烈咬陆鲨Z',
      englishName: 'Mega Garchomp Z',
      japaneseName: 'メガガブリアスZ',
      iconRef: artwork('mega-garchomp-z'),
      isMega: true,
      requiredItemId: 'garchompite-z',
      types: ['Dragon'],
      baseStats: { hp: 108, attack: 130, defense: 85, specialAttack: 141, specialDefense: 85, speed: 151 },
      abilities: ['levitate'],
      legalInCurrentRule: true,
      sourceRefs: mcMegaRefs,
    },
  ],
  'golisopod': [
    {
      id: 'mega-golisopod',
      pokemonId: 'golisopod',
      name: 'Mega Golisopod',
      chineseName: '超级具甲武者',
      englishName: 'Mega Golisopod',
      japaneseName: 'メガグソクムシャ',
      iconRef: artwork('mega-golisopod'),
      isMega: true,
      requiredItemId: 'golisopite',
      types: ['Bug', 'Steel'],
      baseStats: { hp: 75, attack: 150, defense: 175, specialAttack: 70, specialDefense: 120, speed: 40 },
      abilities: ['tough-claws'],
      legalInCurrentRule: true,
      sourceRefs: mcMegaRefs,
    },
  ],
  'lucario': [
    {
      id: 'mega-lucario-z',
      pokemonId: 'lucario',
      name: 'Mega Lucario Z',
      chineseName: '超级路卡利欧Z',
      englishName: 'Mega Lucario Z',
      japaneseName: 'メガルカリオZ',
      iconRef: artwork('mega-lucario-z'),
      isMega: true,
      requiredItemId: 'lucarionite-z',
      types: ['Fighting', 'Steel'],
      baseStats: { hp: 70, attack: 100, defense: 70, specialAttack: 164, specialDefense: 70, speed: 151 },
      abilities: ['aura-guard'],
      legalInCurrentRule: true,
      sourceRefs: mcMegaRefs,
    },
  ],
  'salamence': [
    {
      id: 'mega-salamence',
      pokemonId: 'salamence',
      name: 'Mega Salamence',
      chineseName: '超级暴飞龙',
      englishName: 'Mega Salamence',
      japaneseName: 'メガボーマンダ',
      iconRef: artwork('mega-salamence'),
      isMega: true,
      requiredItemId: 'salamencite',
      types: ['Dragon', 'Flying'],
      baseStats: { hp: 95, attack: 145, defense: 130, specialAttack: 120, specialDefense: 90, speed: 120 },
      abilities: ['aerilate'],
      legalInCurrentRule: true,
      sourceRefs: mcMegaRefs,
    },
  ],
};

export const mcMegaStoneParentMap: Record<string, string> = {
  'absolite-z': 'absol',
  'baxcalibrite': 'baxcalibur',
  'garchompite-z': 'garchomp',
  'golisopite': 'golisopod',
  'lucarionite-z': 'lucario',
  'salamencite': 'salamence',
};

export const mcMegaCapableBaseIds = new Set(Object.keys(mcMegaFormsByParentId));
