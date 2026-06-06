import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  abilities,
  currentDataVersion,
  currentRuleSelectableItemIds,
  dataSourceManifest,
  defaultTeams,
  items,
  moves,
  pokemon,
  regMaMegaAllowlist,
  regMaMegaAllowlistExpectedCount,
  regMaPokemonAllowlist,
  regMaPokemonAllowlistExpectedCount,
  speedBenchmarks,
} from '../data';
import { auditSeedData, auditSourceRefs } from './dataAudit';
import { currentRuleMovesForPokemon, currentRuleSelectableItems } from './currentRuleCatalog';

const pngDimensions = (path: string) => {
  const buffer = readFileSync(path);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

describe('seed data audit', () => {
  it('keeps current seed data internally consistent', () => {
    expect(auditSeedData()).toEqual([]);
  });

  it('keeps every catalog source ref resolvable through the manifest', () => {
    const sourceRefIds = new Set(dataSourceManifest.sources.map((sourceRef) => sourceRef.id));

    expect(sourceRefIds.has('reg-ma-official-rule')).toBe(true);
    expect(sourceRefIds.has('reg-ma-official-eligible-pokemon')).toBe(true);
    expect(sourceRefIds.has('reg-ma-official-mega-list')).toBe(true);
    expect(sourceRefIds.has('reg-ma-community-item-snapshot')).toBe(true);
    expect(sourceRefIds.has('manual-seed-review')).toBe(true);
    expect(sourceRefIds.has('champions-official-training')).toBe(true);
    expect(sourceRefIds.has('champions-stat-point-review')).toBe(true);
    expect(sourceRefIds.has('pokemon-zhwiki-ability-text')).toBe(true);
    expect(sourceRefIds.has('pokebase-champions-mega-data')).toBe(true);
    expect(sourceRefIds.has('pokebase-champions-learnsets')).toBe(true);
    expect(sourceRefIds.has('pokeapi-move-data')).toBe(true);
    expect(sourceRefIds.has('pokemon-zh-dataset-move-text')).toBe(true);
    expect(auditSourceRefs('Test row', ['reg-ma-official-rule'])).toEqual([]);
  });

  it('keeps the official Reg M-A allowlist traceable to catalog rows', () => {
    expect(regMaPokemonAllowlistExpectedCount).toBe(213);
    expect(regMaPokemonAllowlist).toHaveLength(regMaPokemonAllowlistExpectedCount);
    expect(regMaPokemonAllowlist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ championsFormId: '0445-000', englishName: 'Garchomp', pokemonId: 'garchomp' }),
        expect.objectContaining({ championsFormId: '0727-000', englishName: 'Incineroar', pokemonId: 'incineroar' }),
      ]),
    );
    expect(regMaPokemonAllowlist.some((entry) => entry.englishName === 'Cetitan')).toBe(false);
    expect(regMaPokemonAllowlist.every((entry) => entry.verificationStatus === 'manual-review')).toBe(true);
  });

  it('keeps the official Reg M-A Mega allowlist traceable', () => {
    expect(regMaMegaAllowlistExpectedCount).toBe(59);
    expect(regMaMegaAllowlist).toHaveLength(regMaMegaAllowlistExpectedCount);
    expect(regMaMegaAllowlist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ englishName: 'Mega Garchomp', basePokemonId: 'garchomp', formId: 'mega-garchomp' }),
        expect.objectContaining({ englishName: 'Mega Dragonite', basePokemonId: 'dragonite', formId: 'mega-dragonite' }),
        expect.objectContaining({ englishName: 'Mega Starmie', basePokemonId: 'starmie', formId: 'mega-starmie' }),
      ]),
    );
    expect(regMaMegaAllowlist.every((entry) => entry.verificationStatus === 'manual-review')).toBe(true);
  });

  it('connects Champions-added Mega forms to Pokemon, stones, and local assets', () => {
    const expectedForms = [
      ['skarmory', 'mega-skarmory', 'skarmorite'],
      ['froslass', 'mega-froslass', 'froslassite'],
      ['chimecho', 'mega-chimecho', 'chimechite'],
      ['emboar', 'mega-emboar', 'emboarite'],
      ['excadrill', 'mega-excadrill', 'excadrite'],
      ['audino', 'mega-audino', 'audinite'],
      ['chandelure', 'mega-chandelure', 'chandelurite'],
      ['golurk', 'mega-golurk', 'golurkite'],
      ['chesnaught', 'mega-chesnaught', 'chesnaughtite'],
      ['delphox', 'mega-delphox', 'delphoxite'],
      ['greninja', 'mega-greninja', 'greninjite'],
      ['floette', 'mega-floette', 'floettite'],
      ['meowstic-male', 'mega-meowstic', 'meowsticite'],
      ['hawlucha', 'mega-hawlucha', 'hawluchanite'],
      ['crabominable', 'mega-crabominable', 'crabominite'],
      ['drampa', 'mega-drampa', 'drampanite'],
      ['scovillain', 'mega-scovillain', 'scovillainite'],
      ['glimmora', 'mega-glimmora', 'glimmoranite'],
      ['clefable', 'mega-clefable', 'clefablite'],
      ['victreebel', 'mega-victreebel', 'victreebelite'],
      ['starmie', 'mega-starmie', 'starminite'],
      ['dragonite', 'mega-dragonite', 'dragoninite'],
      ['meganium', 'mega-meganium', 'meganiumite'],
      ['feraligatr', 'mega-feraligatr', 'feraligite'],
    ] as const;

    for (const [pokemonId, formId, itemId] of expectedForms) {
      const entry = pokemon.find((candidate) => candidate.id === pokemonId);
      const form = entry?.megaForms.find((candidate) => candidate.id === formId);
      const item = items.find((candidate) => candidate.id === itemId);

      expect(entry?.canMega, `${pokemonId} should be Mega-capable`).toBe(true);
      expect(form?.requiredItemId, `${formId} item`).toBe(itemId);
      expect(form?.iconRef, `${formId} icon`).toBe(`/assets/pokemon/thumbs/${formId}.png`);
      expect(form?.artworkRef, `${formId} artwork`).toBe(`/assets/pokemon/artwork/${formId}.png`);
      expect(item?.applicablePokemonIds, `${itemId} applicability`).toContain(pokemonId);
    }

    const starmie = pokemon.find((entry) => entry.id === 'starmie');
    const megaStarmie = starmie?.megaForms.find((form) => form.id === 'mega-starmie');
    const starminite = items.find((item) => item.id === 'starminite');

    expect(starmie?.canMega).toBe(true);
    expect(megaStarmie).toEqual(expect.objectContaining({
      pokemonId: 'starmie',
      requiredItemId: 'starminite',
      types: ['Water', 'Psychic'],
      baseStats: { hp: 60, attack: 100, defense: 105, specialAttack: 130, specialDefense: 105, speed: 120 },
      abilities: ['huge-power'],
    }));
    expect(megaStarmie?.iconRef).toBe('/assets/pokemon/thumbs/mega-starmie.png');
    expect(megaStarmie?.artworkRef).toBe('/assets/pokemon/artwork/mega-starmie.png');
    expect(starminite?.applicablePokemonIds).toEqual(['starmie']);
  });

  it('keeps unverified or out-of-rule items out of the current selector pool', () => {
    expect(currentRuleSelectableItemIds).toHaveLength(117);
    expect(currentRuleSelectableItemIds).toContain('sitrus-berry');
    expect(currentRuleSelectableItemIds).toContain('focus-sash');
    expect(currentRuleSelectableItemIds).toContain('choice-scarf');
    expect(currentRuleSelectableItemIds).toContain('lum-berry');
    expect(currentRuleSelectableItemIds).toContain('dragoninite');
    expect(currentRuleSelectableItemIds).toContain('garchompite');
    expect(currentRuleSelectableItemIds).not.toContain('assault-vest');
    expect(currentRuleSelectableItemIds).not.toContain('clear-amulet');
    expect(items.find((item) => item.id === 'assault-vest')?.legalInCurrentRule).toBe(false);
    expect(items.find((item) => item.id === 'clear-amulet')?.legalInCurrentRule).toBe(false);
  });

  it('keeps all 117 current-rule items with local iconRef snapshots', () => {
    const selectable = currentRuleSelectableItems();
    expect(selectable).toHaveLength(117);

    for (const item of selectable) {
      // iconRef must exist
      expect(item.iconRef, `${item.id} missing iconRef`).toBeTruthy();
      // Must be local path, not PokeAPI remote
      expect(item.iconRef, `${item.id} iconRef must be local /assets/items/`).toMatch(/^\/assets\/items\//);
      expect(item.iconRef, `${item.id} must not use PokeAPI remote`).not.toContain('raw.githubusercontent.com/PokeAPI');

      // File must exist on disk
      const filePath = `public${item.iconRef}`;
      expect(existsSync(filePath), `${item.id} icon file missing: ${filePath}`).toBe(true);
      expect(readFileSync(filePath).subarray(0, 8), `${item.id} icon file must be a PNG`).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }

    // Out-of-rule items (Clear Amulet, Assault Vest) are NOT required to have local images
    const outOfRule = items.filter((item) => !item.legalInCurrentRule);
    for (const item of outOfRule) {
      expect(currentRuleSelectableItemIds, `${item.id} must not be in selectable pool`).not.toContain(item.id);
    }
  });

  it('keeps current-rule move catalog generated from Champions available moves', () => {
    expect(moves).toHaveLength(539);

    const garchompMoves = currentRuleMovesForPokemon('garchomp').map((move) => move.id);
    expect(garchompMoves).toEqual(expect.arrayContaining(['protect', 'dragon-claw', 'earthquake']));
    expect(garchompMoves).not.toContain('hydro-pump');

    const emptyLearnsets = pokemon.filter((entry) => entry.legalInCurrentRule && currentRuleMovesForPokemon(entry.id).length === 0);
    expect(emptyLearnsets).toEqual([]);
    expect(moves.every((move) => move.sourceRefs.includes('pokebase-champions-learnsets'))).toBe(true);
    expect(moves.every((move) => move.chineseName && move.effectSummary)).toBe(true);

    // No move should have English as its Chinese name
    expect(moves.some((move) => move.chineseName === move.englishName)).toBe(false);
    // Chinese names must not start with Latin letters
    expect(moves.some((move) => /^[A-Z]/.test(move.chineseName)), 'chineseName must not start with Latin letters').toBe(false);
    // Effect summaries must not be English long sentences
    expect(moves.some((move) => /^[A-Z][a-z]+\s[a-z]+/.test(move.effectSummary)), 'effectSummary must not be English').toBe(false);
    // No half-width spaces after Chinese punctuation
    expect(moves.some((move) => /[，。！？、；：]\s/.test(move.effectSummary)), 'effectSummary must not have spaces after Chinese punctuation').toBe(false);

    // Specific name assertions
    const nameMap = Object.fromEntries(moves.map((m) => [m.id, m.chineseName]));
    expect(nameMap['aqua-cutter']).toBe('水波刀');
    expect(nameMap['aqua-step']).toBe('流水旋舞');
    expect(nameMap['armor-cannon']).toBe('铠农炮');
    expect(nameMap['bitter-blade']).toBe('悔念剑');
    expect(nameMap['ceaseless-edge']).toBe('秘剑・千重涛');
    expect(nameMap['chilling-water']).toBe('泼冷水');
    expect(nameMap['syrup-bomb']).toBe('糖浆炸弹');
    expect(moves.find((move) => move.id === 'syrup-bomb')?.accuracy).toBe(85);
  });

  it('keeps real catalog rows on local sprite icons', () => {
    const ids = pokemon.map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining(['venusaur', 'charizard', 'politoed', 'torkoal', 'garchomp', 'incineroar']));
    expect(pokemon.length).toBe(213);
    // All Pokémon and Mega form icons must be local /assets/pokemon/thumbs/ paths
    expect(pokemon.every((entry) => entry.iconRef.startsWith('/assets/pokemon/thumbs/'))).toBe(true);
    expect(pokemon.flatMap((entry) => entry.megaForms).every((form) => form.iconRef.startsWith('/assets/pokemon/thumbs/'))).toBe(true);
    // All must have artworkRef pointing to artwork dir
    expect(pokemon.every((entry) => entry.artworkRef?.startsWith('/assets/pokemon/artwork/'))).toBe(true);
    expect(pokemon.flatMap((entry) => entry.megaForms).every((form) => form.artworkRef?.startsWith('/assets/pokemon/artwork/'))).toBe(true);
    // Every local icon and artwork file must exist on disk and be non-empty
    const allRefs = [
      ...pokemon.map((entry) => entry.iconRef),
      ...pokemon.flatMap((entry) => entry.megaForms).map((form) => form.iconRef),
    ];
    for (const ref of allRefs) {
      const filePath = `public${ref}`;
      expect(existsSync(filePath), `${ref} file missing`).toBe(true);
      expect(readFileSync(filePath).length, `${ref} file empty`).toBeGreaterThan(0);
      const dimensions = pngDimensions(filePath);
      expect(Math.max(dimensions.width, dimensions.height), `${ref} thumbnail too small`).toBeGreaterThanOrEqual(192);
    }

    const artworkRefs = [
      ...pokemon.map((entry) => entry.artworkRef),
      ...pokemon.flatMap((entry) => entry.megaForms).map((form) => form.artworkRef),
    ].filter(Boolean) as string[];
    for (const ref of artworkRefs) {
      const filePath = `public${ref}`;
      expect(existsSync(filePath), `${ref} file missing`).toBe(true);
      expect(readFileSync(filePath).length, `${ref} file empty`).toBeGreaterThan(0);
    }
  });

  it('keeps ability text complete and maps abilities back to current Pokemon', () => {
    expect(abilities).toHaveLength(187);
    expect(abilities.every((ability) => ability.effectSummary && !ability.effectSummary.includes('待确认'))).toBe(true);

    const expectedPokemonIdsByAbility = new Map<string, string[]>();
    pokemon.forEach((entry) => {
      const abilityIds = new Set([...entry.abilities, ...entry.megaForms.flatMap((form) => form.abilities)]);
      abilityIds.forEach((abilityId) => {
        expectedPokemonIdsByAbility.set(abilityId, [...(expectedPokemonIdsByAbility.get(abilityId) ?? []), entry.id]);
      });
    });

    abilities.forEach((ability) => {
      expect(ability.pokemonIds).toEqual(expectedPokemonIdsByAbility.get(ability.id) ?? []);
    });
  });

  it('keeps all 32 form Pokemon entries in the catalog with type distinctions', () => {
    const formIds = [
      'raichu-alola', 'ninetales-alola', 'arcanine-hisui', 'slowbro-galar',
      'tauros-paldea-combat-breed', 'tauros-paldea-blaze-breed', 'tauros-paldea-aqua-breed',
      'typhlosion-hisui', 'slowking-galar',
      'rotom', 'rotom-heat', 'rotom-wash', 'rotom-frost', 'rotom-fan', 'rotom-mow',
      'samurott-hisui', 'zoroark-hisui', 'stunfisk-galar',
      'meowstic-male', 'meowstic-female', 'goodra-hisui',
      'gourgeist-average', 'gourgeist-small', 'gourgeist-large', 'gourgeist-super',
      'avalugg-hisui', 'decidueye-hisui',
      'lycanroc-midday', 'lycanroc-midnight', 'lycanroc-dusk',
      'basculegion-male', 'basculegion-female',
    ];

    const formPokemon = pokemon.filter((entry) => formIds.includes(entry.id));
    expect(formPokemon).toHaveLength(32);

    for (const id of formIds) {
      const entry = pokemon.find((p) => p.id === id);
      expect(entry, `${id} should exist in catalog`).toBeTruthy();
      if (!entry) continue;

      // Require local icon and artwork refs
      expect(entry.iconRef, `${id} iconRef must be local`).toMatch(/^\/assets\/pokemon\/thumbs\//);
      expect(entry.artworkRef, `${id} artworkRef must be local`).toMatch(/^\/assets\/pokemon\/artwork\//);

      // Verify icon and artwork files exist
      for (const ref of [entry.iconRef, entry.artworkRef].filter(Boolean) as string[]) {
        const filePath = `public${ref}`;
        expect(existsSync(filePath), `${id} file missing: ${filePath}`).toBe(true);
        expect(readFileSync(filePath).length, `${id} file empty: ${filePath}`).toBeGreaterThan(0);
        const dimensions = pngDimensions(filePath);
        expect(Math.max(dimensions.width, dimensions.height), `${id} thumbnail too small`).toBeGreaterThanOrEqual(192);
      }

      // Non-empty data fields
      expect(entry.types.length, `${id} must have types`).toBeGreaterThan(0);
      expect(Object.values(entry.baseStats).every((v) => v > 0), `${id} must have non-zero baseStats`).toBe(true);
      expect(entry.abilities.length, `${id} must have abilities`).toBeGreaterThan(0);

      // Learnset must be non-empty
      const movesForForm = currentRuleMovesForPokemon(id);
      expect(movesForForm.length, `${id} must have learnable moves`).toBeGreaterThan(0);

      if (id === 'meowstic-male') {
        expect(entry.canMega, `${id} carries the shared Mega Meowstic form`).toBe(true);
        expect(entry.megaForms.map((form) => form.id)).toEqual(['mega-meowstic']);
      } else {
        expect(entry.canMega, `${id} canMega must be false`).toBe(false);
        expect(entry.megaForms, `${id} megaForms must be empty`).toEqual([]);
      }
    }

    // Key type assertions: prevent accidental base-form type inheritance
    const typeMap = Object.fromEntries(formPokemon.map((p) => [p.id, p.types]));
    expect(typeMap['raichu-alola']).toContain('Psychic');
    expect(typeMap['ninetales-alola']).toEqual(expect.arrayContaining(['Ice', 'Fairy']));
    expect(typeMap['arcanine-hisui']).toContain('Rock');
    expect(typeMap['slowbro-galar']).toContain('Poison');
    expect(typeMap['zoroark-hisui']).toEqual(expect.arrayContaining(['Normal', 'Ghost']));
    expect(typeMap['goodra-hisui']).toContain('Steel');
    expect(typeMap['decidueye-hisui']).toContain('Fighting');
  });

  it('reports source refs that are not present in the manifest', () => {
    const issues = auditSourceRefs('Test row', ['missing-source']);

    expect(issues).toEqual([
      {
        code: 'unresolved-source-ref',
        message: 'Test row references unknown sourceRef missing-source.',
      },
    ]);
  });

  it('keeps benchmark versions aligned with the active data version', () => {
    expect(speedBenchmarks.every((benchmark) => benchmark.dataVersionId === currentDataVersion.id)).toBe(true);
    expect(speedBenchmarks.every((benchmark) => benchmark.speedStatPoints >= 0 && benchmark.speedStatPoints <= 32)).toBe(true);
  });

  it('keeps default teams tied to the active data version', () => {
    expect(defaultTeams.every((team) => team.dataVersionId === currentDataVersion.id)).toBe(true);
  });
});
