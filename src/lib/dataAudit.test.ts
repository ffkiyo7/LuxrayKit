import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const fileHash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const mbMegaBaseArtworkIds = {
  'mega-raichu-x': '26',
  'mega-raichu-y': '26',
  'mega-sceptile': '254',
  'mega-blaziken': '257',
  'mega-swampert': '260',
  'mega-mawile': '303',
  'mega-metagross': '376',
  'mega-staraptor': '398',
  'mega-scolipede': '545',
  'mega-scrafty': '560',
  'mega-eelektross': '604',
  'mega-pyroar': '668',
  'mega-malamar': '687',
  'mega-barbaracle': '689',
  'mega-dragalge': '691',
  'mega-falinks': '870',
} as const;

const championsMegaStoneIconHashes = {
  'blazikenite': 'a23d38288905efa07c745e69f6f4d4b1868c41ea328882c084a61b71cfdd646f',
  'mawilite': '3898ad6268b67415b4fe27cdf9c6441096f470d653e9a62143f275b60d765b22',
  'metagrossite': 'fab43b56ff84fa2dfa6ca9ebf6da498561e6963a2e2da2db9cfce7eec14b2021',
  'sceptilite': '561aab606d7427b1a80c3c2992ea7bad7ad462ab0783c2c5b4a7654e7b1b6ba1',
  'swampertite': '88e97754c9d55ed4113dcc1d74e8fc9cb3441defec999302c0256bcb28011baa',
} as const;

const canonicalBerryData = {
  'aspear-berry': { chineseName: '利木果', effectSummary: '携带者陷入冰冻时解除冰冻，使用后消耗。', iconHash: '162489a00a8cac2545b74fad77dc79632198d3e09e153e688130b4238a563ae7' },
  'babiri-berry': { chineseName: '霹霹果', effectSummary: '首次受到效果绝佳的钢属性招式攻击时，伤害减半，使用后消耗。', iconHash: '4ccd5cc64b20575bafe64ef861725b964b4f621c038169df30b3cac211b37bd5' },
  'charti-berry': { chineseName: '草蚕果', effectSummary: '首次受到效果绝佳的岩石属性招式攻击时，伤害减半，使用后消耗。', iconHash: '8675038a42a47bd002532214af1fa94ead6573476fef7eab5ef0c65502d0e16f' },
  'cheri-berry': { chineseName: '樱子果', effectSummary: '携带者陷入麻痹时解除麻痹，使用后消耗。', iconHash: '949f8cb36532f09ff97ca41f97db3104abc16c209496181fea38839d79c5ce00' },
  'chesto-berry': { chineseName: '零余果', effectSummary: '携带者陷入睡眠时解除睡眠，使用后消耗。', iconHash: '6620e6507a3bc28c08f5f264e5b461cad0db9dce647d3cab0a4f5421e36abafd' },
  'chilan-berry': { chineseName: '灯浆果', effectSummary: '首次受到一般属性招式攻击时，伤害减半，使用后消耗。', iconHash: 'f84548b41899db4755f6c07259d9d0750452e8879d9f574101197e1aea3667df' },
  'chople-berry': { chineseName: '莲蒲果', effectSummary: '首次受到效果绝佳的格斗属性招式攻击时，伤害减半，使用后消耗。', iconHash: '03e499f067f5679b0cec8eb015b90bfa7ae26e0507d1815fdedf48e41190a56e' },
  'coba-berry': { chineseName: '棱瓜果', effectSummary: '首次受到效果绝佳的飞行属性招式攻击时，伤害减半，使用后消耗。', iconHash: 'db26fb90b9b56dfa8f74f09571f0b591ba55954494de6aba6543afbe79983b08' },
  'colbur-berry': { chineseName: '刺耳果', effectSummary: '首次受到效果绝佳的恶属性招式攻击时，伤害减半，使用后消耗。', iconHash: '98a92b28058e3059dd139a4a5652bc496c0ad2778ad6a3c5f72491a69a0503e0' },
  'haban-berry': { chineseName: '莓榴果', effectSummary: '首次受到效果绝佳的龙属性招式攻击时，伤害减半，使用后消耗。', iconHash: '06e19bce4e09c45c180538eb85ea1ce9fb05df2d510f2a79c6cf1c3c35d48759' },
  'kasib-berry': { chineseName: '佛柑果', effectSummary: '首次受到效果绝佳的幽灵属性招式攻击时，伤害减半，使用后消耗。', iconHash: '8ebdffc2650b06e7a70a066051d04621e23a3ba1f0026219b3ce6bc67e5ae61c' },
  'kebia-berry': { chineseName: '通通果', effectSummary: '首次受到效果绝佳的毒属性招式攻击时，伤害减半，使用后消耗。', iconHash: 'bca389c73eaa1475e9d3733b409e960763f56963e1c066b5498ab32e15c83243' },
  'leppa-berry': { chineseName: '苹野果', effectSummary: '招式的 PP 降至 0 时回复该招式 10 PP，使用后消耗。', iconHash: '69db79560fd815477f5a6901ee08c4ebaed368bb420e07547dfea0a79b5bd2f4' },
  'lum-berry': { chineseName: '木子果', effectSummary: '解除携带者的异常状态或混乱，使用后消耗。', iconHash: 'eab0124365d18b7439b553edd5cf02e17297b72495a79e37114ee5398d0e3996' },
  'occa-berry': { chineseName: '巧可果', effectSummary: '首次受到效果绝佳的火属性招式攻击时，伤害减半，使用后消耗。', iconHash: 'b4c94b94159227fed46ccad3c063f3a9b418f7ef9eab635ccd17197c1ca814fb' },
  'oran-berry': { chineseName: '橙橙果', effectSummary: 'HP 降至一半或以下时回复 10 HP，使用后消耗。', iconHash: '4d4d31e7c29a4540d5f438b87bb1762bf3cd7b0920e523fc9020f6c0bace1c1a' },
  'passho-berry': { chineseName: '千香果', effectSummary: '首次受到效果绝佳的水属性招式攻击时，伤害减半，使用后消耗。', iconHash: '48786c103dcde11eee3b938c360259c687ab44b0d4ea3aae6fcc8099f1b05671' },
  'payapa-berry': { chineseName: '福禄果', effectSummary: '首次受到效果绝佳的超能力属性招式攻击时，伤害减半，使用后消耗。', iconHash: '95bced7a647a219b7e6ba313a6fb83b0d911dd6428beca1b4f6403d3a3e7457b' },
  'pecha-berry': { chineseName: '桃桃果', effectSummary: '携带者陷入中毒时解除中毒，使用后消耗。', iconHash: '9efb16dc703ef654ce0532329613d51150dcc3c9a77f0101f33d54b15a00028a' },
  'persim-berry': { chineseName: '柿仔果', effectSummary: '携带者陷入混乱时解除混乱，使用后消耗。', iconHash: 'e09597ca2770a12a55683e4e631361093491883a111363641a9b46f4b8929b2d' },
  'rawst-berry': { chineseName: '莓莓果', effectSummary: '携带者陷入灼伤时解除灼伤，使用后消耗。', iconHash: '3c3976d2121647f4c1b19673de8424baa80f59f5d4ea91e447c14fef5da64066' },
  'rindo-berry': { chineseName: '罗子果', effectSummary: '首次受到效果绝佳的草属性招式攻击时，伤害减半，使用后消耗。', iconHash: '5b00f01a17471cc2f3587b476c9f76900d8049cf2542bcc9efb46431d6255d03' },
  'roseli-berry': { chineseName: '洛玫果', effectSummary: '首次受到效果绝佳的妖精属性招式攻击时，伤害减半，使用后消耗。', iconHash: 'bc238c15f94a67d8895b1b941c22f43c1f78ec3922719c335db23585d5cf9bc4' },
  'shuca-berry': { chineseName: '腰木果', effectSummary: '首次受到效果绝佳的地面属性招式攻击时，伤害减半，使用后消耗。', iconHash: '6932f15326f90ea473005d18a7c13b4d50be5247455cf4daecdb7399c00499b8' },
  'sitrus-berry': { chineseName: '文柚果', effectSummary: 'HP 降至一半或以下时回复最大 HP 的 1/4，使用后消耗。', iconHash: '934d9dcfdc189fd01987f1e0356e079cf32d4d3aafac89ca3e77158c8f44c10e' },
  'tanga-berry': { chineseName: '扁樱果', effectSummary: '首次受到效果绝佳的虫属性招式攻击时，伤害减半，使用后消耗。', iconHash: 'b3791845d1536fdf02926b447727cfbedadeca89dbcee05af794c1774a801601' },
  'wacan-berry': { chineseName: '烛木果', effectSummary: '首次受到效果绝佳的电属性招式攻击时，伤害减半，使用后消耗。', iconHash: 'f31ca263b9ccc47d2a743878fc271fadedf36925b7e6bd26d54c29f42f821b19' },
  'yache-berry': { chineseName: '番荔果', effectSummary: '首次受到效果绝佳的冰属性招式攻击时，伤害减半，使用后消耗。', iconHash: '77e7e38bddcd0ad8368da55b9fc8ee40b3949e7ab53130cbd4b455ba5a272d62' },
} as const;

describe('seed data audit', () => {
  it('keeps current seed data internally consistent', () => {
    expect(auditSeedData()).toEqual([]);
  });

  it('keeps every catalog source ref resolvable through the manifest', () => {
    const sourceRefIds = new Set(dataSourceManifest.sources.map((sourceRef) => sourceRef.id));

    expect(sourceRefIds.has('reg-mb-official-rule')).toBe(true);
    expect(sourceRefIds.has('reg-mb-official-eligible-pokemon')).toBe(true);
    expect(sourceRefIds.has('reg-mb-official-mega-list')).toBe(true);
    expect(sourceRefIds.has('pokebase-champions-pokemon-mb')).toBe(true);
    expect(sourceRefIds.has('reg-ma-official-eligible-pokemon')).toBe(true);
    expect(sourceRefIds.has('reg-ma-official-mega-list')).toBe(true);
    expect(sourceRefIds.has('reg-ma-community-item-snapshot')).toBe(true);
    expect(sourceRefIds.has('manual-seed-review')).toBe(true);
    expect(sourceRefIds.has('champions-official-training')).toBe(true);
    expect(sourceRefIds.has('champions-stat-point-review')).toBe(true);
    expect(sourceRefIds.has('pokemon-zhwiki-ability-text')).toBe(true);
    expect(sourceRefIds.has('pokebase-champions-mega-data')).toBe(true);
    expect(sourceRefIds.has('pokebase-champions-learnsets')).toBe(true);
    expect(sourceRefIds.has('pokeapi-item-data')).toBe(true);
    expect(sourceRefIds.has('pokeapi-item-sprites')).toBe(true);
    expect(sourceRefIds.has('pokeapi-move-data')).toBe(true);
    expect(sourceRefIds.has('pokemon-zh-dataset-move-text')).toBe(true);
    expect(auditSourceRefs('Test row', ['reg-mb-official-rule'])).toEqual([]);
  });

  it('keeps the current Reg M-B allowlist traceable to catalog rows', () => {
    expect(regMaPokemonAllowlistExpectedCount).toBe(235);
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

  it('keeps the current Reg M-B Mega allowlist traceable', () => {
    expect(regMaMegaAllowlistExpectedCount).toBe(75);
    expect(regMaMegaAllowlist).toHaveLength(regMaMegaAllowlistExpectedCount);
    expect(regMaMegaAllowlist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ englishName: 'Mega Garchomp', basePokemonId: 'garchomp', formId: 'mega-garchomp' }),
        expect.objectContaining({ englishName: 'Mega Dragonite', basePokemonId: 'dragonite', formId: 'mega-dragonite' }),
        expect.objectContaining({ englishName: 'Mega Starmie', basePokemonId: 'starmie', formId: 'mega-starmie' }),
        expect.objectContaining({ englishName: 'Mega Raichu X', basePokemonId: 'raichu', formId: 'mega-raichu-x' }),
        expect.objectContaining({ englishName: 'Mega Falinks', basePokemonId: 'falinks', formId: 'mega-falinks' }),
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
      ['raichu', 'mega-raichu-x', 'raichunite-x'],
      ['sceptile', 'mega-sceptile', 'sceptilite'],
      ['blaziken', 'mega-blaziken', 'blazikenite'],
      ['swampert', 'mega-swampert', 'swampertite'],
      ['mawile', 'mega-mawile', 'mawilite'],
      ['metagross', 'mega-metagross', 'metagrossite'],
      ['staraptor', 'mega-staraptor', 'staraptite'],
      ['scolipede', 'mega-scolipede', 'scolipite'],
      ['scrafty', 'mega-scrafty', 'scraftinite'],
      ['eelektross', 'mega-eelektross', 'eelektrossite'],
      ['pyroar', 'mega-pyroar', 'pyroarite'],
      ['malamar', 'mega-malamar', 'malamarite'],
      ['barbaracle', 'mega-barbaracle', 'barbaracite'],
      ['dragalge', 'mega-dragalge', 'dragalgite'],
      ['falinks', 'mega-falinks', 'falinksite'],
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
    expect(currentRuleSelectableItemIds).toHaveLength(148);
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

  it('keeps Mega Stone owners and current-rule item descriptions aligned', () => {
    const ownerIdsByStone = new Map<string, Set<string>>();
    for (const entry of pokemon) {
      for (const form of entry.megaForms) {
        const ownerIds = ownerIdsByStone.get(form.requiredItemId) ?? new Set<string>();
        ownerIds.add(entry.id);
        ownerIdsByStone.set(form.requiredItemId, ownerIds);
      }
    }

    for (const stone of items.filter((item) => item.isMegaStone)) {
      expect([...(ownerIdsByStone.get(stone.id) ?? [])].sort(), `${stone.id} owner`).toEqual([...stone.applicablePokemonIds].sort());
      expect(stone.effectSummary).toBe('让对应的宝可梦在战斗中进行 Mega Evolution。');
    }

    const heldItems = currentRuleSelectableItems().filter((item) => !item.isMegaStone && !item.id.endsWith('-berry'));
    expect(heldItems).toHaveLength(45);
    for (const item of heldItems) {
      expect(item.sourceRefs, `${item.id} localized source`).toContain('pokeapi-item-data');
      expect(item.effectSummary, `${item.id} must not use vague effect wording`).not.toMatch(/少量|有概率|更长/);
      expect(item.effectSummary, `${item.id} must not contain copied layout whitespace`).not.toMatch(/ＨＰ|  +/);
    }

    expect(items.find((item) => item.id === 'icy-rock')?.effectSummary).toBe('携带者召唤的雪天气延长 3 回合（共 8 回合）。');
    expect(items.find((item) => item.id === 'life-orb')?.effectSummary).toBe('招式威力提高 30%；使出造成伤害的招式后损失最大 HP 的 10%。');
    expect(items.find((item) => item.id === 'light-clay')?.effectSummary).toBe('光墙、反射壁和极光幕延长 3 回合（共 8 回合）。');
    expect(items.find((item) => item.id === 'mental-herb')?.effectSummary).toContain('再来一次');
  });

  it('keeps all current-rule items with local iconRef snapshots', () => {
    const selectable = currentRuleSelectableItems();
    expect(selectable).toHaveLength(148);
    const itemHashes = new Map<string, string[]>();

    for (const item of selectable) {
      // iconRef must exist
      expect(item.iconRef, `${item.id} missing iconRef`).toBeTruthy();
      // Must be local path, not PokeAPI remote
      expect(item.iconRef, `${item.id} iconRef must be local /assets/items/`).toMatch(/^\/assets\/items\//);
      expect(item.iconRef, `${item.id} must not use PokeAPI remote`).not.toContain('raw.githubusercontent.com/PokeAPI');
      expect(item.iconRef, `${item.id} must map to its own item asset`).toBe(`/assets/items/${item.id}.png`);

      // File must exist on disk
      const filePath = `public${item.iconRef}`;
      expect(existsSync(filePath), `${item.id} icon file missing: ${filePath}`).toBe(true);
      expect(readFileSync(filePath).subarray(0, 8), `${item.id} icon file must be a PNG`).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const hash = fileHash(filePath);
      itemHashes.set(hash, [...(itemHashes.get(hash) ?? []), item.id]);
    }

    expect([...itemHashes.values()].filter((ids) => ids.length > 1), 'every item must have its own image snapshot').toEqual([]);
    for (const [itemId, expectedHash] of Object.entries(championsMegaStoneIconHashes)) {
      expect(fileHash(`public/assets/items/${itemId}.png`), `${itemId} must keep its Champions image snapshot`).toBe(expectedHash);
    }

    const berries = selectable.filter((item) => item.id.endsWith('-berry'));
    expect(berries.map((item) => item.id).sort(), 'current-rule berry catalog').toEqual(Object.keys(canonicalBerryData).sort());
    for (const berry of berries) {
      expect(berry.sourceRefs, `${berry.id} source`).toContain('pokeapi-item-sprites');
      expect(berry.sourceRefs, `${berry.id} localized source`).toContain('pokeapi-item-data');
      const expected = canonicalBerryData[berry.id as keyof typeof canonicalBerryData];
      expect(berry.chineseName, `${berry.id} Chinese identity`).toBe(expected.chineseName);
      expect(berry.effectSummary, `${berry.id} effect copy`).toBe(expected.effectSummary);
    }
    for (const [itemId, expected] of Object.entries(canonicalBerryData)) {
      expect(fileHash(`public/assets/items/${itemId}.png`), `${itemId} must keep its canonical berry sprite`).toBe(expected.iconHash);
    }

    // Out-of-rule items (Clear Amulet, Assault Vest) are NOT required to have local images
    const outOfRule = items.filter((item) => !item.legalInCurrentRule);
    for (const item of outOfRule) {
      expect(currentRuleSelectableItemIds, `${item.id} must not be in selectable pool`).not.toContain(item.id);
    }
  });

  it('keeps M-B asset snapshots from falling back to placeholder duplicates', () => {
    for (const [megaId, baseArtworkId] of Object.entries(mbMegaBaseArtworkIds)) {
      const megaArtworkPath = `public/assets/pokemon/artwork/${megaId}.png`;
      const baseArtworkPath = `public/assets/pokemon/artwork/${baseArtworkId}.png`;

      expect(existsSync(megaArtworkPath), `${megaId} artwork file missing`).toBe(true);
      expect(fileHash(megaArtworkPath), `${megaId} artwork must not reuse base artwork ${baseArtworkId}`).not.toBe(fileHash(baseArtworkPath));
    }

  });

  it('uses Eternal Flower Floette art for the Champions Floette entry', () => {
    const floette = pokemon.find((entry) => entry.id === 'floette');

    expect(floette?.baseStats).toEqual({ hp: 74, attack: 65, defense: 67, specialAttack: 125, specialDefense: 128, speed: 92 });
    expect(fileHash('public/assets/pokemon/artwork/670.png')).toBe(fileHash('public/assets/pokemon/artwork/10061.png'));
    expect(fileHash('public/assets/pokemon/thumbs/670.png')).toBe(fileHash('public/assets/pokemon/thumbs/10061.png'));
    expect(fileHash('public/assets/pokemon/icons/670.png')).toBe(fileHash('public/assets/pokemon/icons/10061.png'));
  });

  it('keeps legacy Mega sprite ids aligned to their PokeAPI forms', () => {
    const expectedSpriteIds = [
      ['venusaur', 'mega-venusaur', '10033'],
      ['charizard', 'mega-charizard-x', '10034'],
      ['charizard', 'mega-charizard-y', '10035'],
      ['blastoise', 'mega-blastoise', '10036'],
      ['beedrill', 'mega-beedrill', '10090'],
      ['pidgeot', 'mega-pidgeot', '10073'],
      ['alakazam', 'mega-alakazam', '10037'],
      ['slowbro', 'mega-slowbro', '10071'],
      ['gengar', 'mega-gengar', '10038'],
      ['kangaskhan', 'mega-kangaskhan', '10039'],
      ['pinsir', 'mega-pinsir', '10040'],
      ['gyarados', 'mega-gyarados', '10041'],
      ['aerodactyl', 'mega-aerodactyl', '10042'],
      ['ampharos', 'mega-ampharos', '10045'],
      ['steelix', 'mega-steelix', '10072'],
      ['scizor', 'mega-scizor', '10046'],
      ['heracross', 'mega-heracross', '10047'],
      ['houndoom', 'mega-houndoom', '10048'],
      ['tyranitar', 'mega-tyranitar', '10049'],
      ['gardevoir', 'mega-gardevoir', '10051'],
      ['sableye', 'mega-sableye', '10066'],
      ['aggron', 'mega-aggron', '10053'],
      ['medicham', 'mega-medicham', '10054'],
      ['manectric', 'mega-manectric', '10055'],
      ['sharpedo', 'mega-sharpedo', '10070'],
      ['camerupt', 'mega-camerupt', '10087'],
      ['altaria', 'mega-altaria', '10067'],
      ['banette', 'mega-banette', '10056'],
      ['absol', 'mega-absol', '10057'],
      ['glalie', 'mega-glalie', '10074'],
      ['lopunny', 'mega-lopunny', '10088'],
      ['garchomp', 'mega-garchomp', '10058'],
      ['lucario', 'mega-lucario', '10059'],
      ['abomasnow', 'mega-abomasnow', '10060'],
      ['gallade', 'mega-gallade', '10068'],
    ] as const;

    for (const [pokemonId, formId, spriteId] of expectedSpriteIds) {
      const entry = pokemon.find((candidate) => candidate.id === pokemonId);
      const form = entry?.megaForms.find((candidate) => candidate.id === formId);
      const expectedIconRef = `/assets/pokemon/thumbs/${spriteId}.png`;
      const expectedArtworkRef = `/assets/pokemon/artwork/${spriteId}.png`;

      expect(form?.iconRef, `${formId} icon`).toBe(expectedIconRef);
      expect(form?.artworkRef, `${formId} artwork`).toBe(expectedArtworkRef);
      expect(existsSync(`public${expectedIconRef}`), `${formId} icon file missing`).toBe(true);
      expect(existsSync(`public${expectedArtworkRef}`), `${formId} artwork file missing`).toBe(true);
      expect(fileHash(`public${expectedArtworkRef}`), `${formId} must not reuse ${pokemonId} artwork`).not.toBe(
        fileHash(`public/assets/pokemon/artwork/${entry?.nationalDexNo}.png`),
      );
    }
  });

  it('keeps current-rule move catalog generated from Champions available moves', () => {
    expect(moves).toHaveLength(545);

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
    expect(pokemon.length).toBe(235);
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
    expect(abilities).toHaveLength(198);
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
