import type { DataSourceManifest, DataVersion, RuleSet, UserPreference } from '../../../types';

/**
 * Historical M-A official Eligible Pokemon web-view endpoint. It still serves the original
 * 213-row M-A payload, and `reg-ma-official-eligible-pokemon` (cited by older generated catalog
 * batches) points at it — do NOT repoint this at a newer regulation. Each regulation gets its
 * own constant below.
 */
export const officialEligiblePokemonUrl = 'https://web-view.app.pokemonchampions.jp/battle/pages/events/rs177501629259kmzbny/en/pokemon.html';
/** Official M-C Eligible Pokemon web-view endpoint (262 rows, verified 2026-09-09). */
export const officialEligiblePokemonUrlMC = 'https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178713870219xeaaio/en/pokemon.html';
/** Official Regulation Set M-C announcement (duration, mechanics, held items, timers). */
export const regulationMcAnnouncementUrl = 'https://news.pokemon-home.com/en/page/816.html';
export const pokebaseChampionsPokemonUrl = 'https://pokebase.app/pokemon-champions/pokemon';

export const currentRuleSet: RuleSet = {
  id: 'reg-mc',
  name: 'Regulation Set M-C',
  displayName: 'Pokemon Champions Regulation Set M-C',
  // Duration is quoted verbatim from the official M-C announcement (regulationMcAnnouncementUrl):
  // "Wednesday, September 9, 2026, at 02:00 UTC to Wednesday, December 2, 2026, at 01:59 UTC".
  startAt: '2026-09-09T02:00:00.000Z',
  endAt: '2026-12-02T01:59:00.000Z',
  // Battle parameters were re-read off the M-C announcement rather than copied from M-B, and are
  // identical to M-B: "You can use Mega Evolution only one time per battle", "Duplicate held
  // items are not allowed", "Total Time: 20 minutes / Player Time: 7 minutes / Turn Time: 45
  // seconds / Preview Time: 90 seconds". `battleType` is the app's tracked VGC format and is NOT
  // restated by the regulation announcement (Ranked Battles itself offers both Single and Double
  // Battle), so it carries over from M-B unchanged.
  battleType: 'doubles',
  allowMega: true,
  megaLimitPerBattle: 1,
  duplicateHeldItemsAllowed: false,
  timers: {
    totalTimeMinutes: 20,
    playerTimeMinutes: 7,
    turnTimeSeconds: 45,
    previewTimeSeconds: 90,
  },
  officialSourceUrl: 'https://champions.pokemon.com/en-us/',
  dataVersionId: 'dv-reg-mc-seed-0.4.0',
  status: 'current',
};

export const currentDataVersion: DataVersion = {
  id: 'dv-reg-mc-seed-0.4.0',
  ruleSetId: currentRuleSet.id,
  versionName: 'v0.4.0-mc-seed',
  updatedAt: '2026-09-09T02:00:00.000Z',
  sourceSummary: 'M-C seed data joined from the official M-C Eligible Pokemon endpoint (262 rows), the official M-C regulation announcement, current PokéBase Champions pages, PokeAPI structured data, and local manual review.',
  sourceUrls: [currentRuleSet.officialSourceUrl, regulationMcAnnouncementUrl, officialEligiblePokemonUrlMC, pokebaseChampionsPokemonUrl],
  verificationStatus: 'manual-review',
  notes: 'M-C catalog rows are structured for validation and UI flow. Do not treat catalog legality, item legality, learnsets, or damage output as final battle guidance until official endpoints are cross-checked.',
};

/**
 * Retrieval timestamp for the M-B-era source entries below. Frozen as a literal so bumping
 * `currentDataVersion.updatedAt` at a rollover does not silently re-date historical provenance
 * (it used to be `currentDataVersion.updatedAt`, which was the M-B data version timestamp).
 */
const mbSourcesRetrievedAt = '2026-06-17T02:00:00.000Z';

export const defaultPreferences: UserPreference = {
  language: 'zh-CN',
  theme: 'dark',
  cachedRuleSetId: currentRuleSet.id,
  lastDataRefreshAt: currentDataVersion.updatedAt,
  hasSeenEnvironmentImportNotice: false,
  hasCompletedOnboarding: false,
  hasSeenLuxrayEasterEgg: false,
  analyticsOptOut: false,
};

export const dataSourceManifest: DataSourceManifest = {
  id: currentDataVersion.id,
  ruleSetId: currentRuleSet.id,
  mode: 'versioned-seed',
  sources: [
    {
      id: 'reg-mc-official-rule',
      url: regulationMcAnnouncementUrl,
      sourceType: 'official',
      licenseRisk: 'low',
      retrievedAt: currentDataVersion.updatedAt,
      sourceVersion: 'regulation-set-m-c',
      fieldsUsed: [
        'ruleSet.startAt',
        'ruleSet.endAt',
        'ruleSet.allowMega',
        'ruleSet.megaLimitPerBattle',
        'ruleSet.duplicateHeldItemsAllowed',
        'ruleSet.timers',
      ],
      notes: 'Official Regulation Set M-C announcement. Duration, Mega limit (once per battle), duplicate-held-item ban, and the 20/7/45/90 timers were read off this page directly, not copied from M-B; they happen to be identical to M-B. `ruleSet.battleType` is deliberately NOT listed: the announcement does not restate the battle format.',
    },
    {
      id: 'reg-mc-official-eligible-pokemon',
      url: officialEligiblePokemonUrlMC,
      sourceType: 'official',
      licenseRisk: 'medium',
      retrievedAt: currentDataVersion.updatedAt,
      sourceVersion: 'row-count-262',
      fieldsUsed: ['eligiblePokemon.championsFormId', 'eligiblePokemon.nationalDexNo', 'eligiblePokemon.englishName'],
      notes: 'Official M-C Eligible Pokemon web-view page linked from the M-C announcement, same `const pokemons = [...]` payload shape as the M-A endpoint. Re-fetched live on 2026-09-09: 262 rows, diffed row-by-row against the local allowlist (+28 / -1 vs the 235 M-B rows). This — not PokéBase regulation tags — is the legality source for M-C.',
    },
    {
      id: 'reg-mc-official-mega-list',
      url: regulationMcAnnouncementUrl,
      sourceType: 'official',
      licenseRisk: 'low',
      retrievedAt: currentDataVersion.updatedAt,
      sourceVersion: 'mega-count-6',
      fieldsUsed: ['megaEvolution.englishName', 'megaEvolution.legalInCurrentRule'],
      notes: 'The M-C announcement names the 6 newly allowed Mega Evolutions verbatim: Mega Absol Z, Mega Salamence, Mega Garchomp Z, Mega Lucario Z, Mega Golisopod, Mega Baxcalibur. `mega-count-6` is that new-in-M-C count, not the total legal Mega pool.',
    },
    {
      id: 'pokebase-champions-pokemon-mc',
      url: pokebaseChampionsPokemonUrl,
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: currentDataVersion.updatedAt,
      sourceVersion: 'regulation-set-m-c',
      fieldsUsed: ['pokemon.types', 'pokemon.baseStats', 'pokemon.abilities', 'pokemon.moves'],
      notes: 'PokéBase Champions pages are used only to fill stats/types/abilities/learnsets for M-C rows. PokéBase M-C regulation tags are incomplete (tagged on 3 Pokemon as of 2026-09-09) and must never be used as the legality source — see reg-mc-official-eligible-pokemon.',
    },
    {
      id: 'reg-mb-official-rule',
      url: currentRuleSet.officialSourceUrl,
      sourceType: 'official',
      licenseRisk: 'low',
      retrievedAt: mbSourcesRetrievedAt,
      fieldsUsed: [
        'ruleSet.startAt',
        'ruleSet.endAt',
        'ruleSet.battleType',
        'ruleSet.allowMega',
        'ruleSet.megaLimitPerBattle',
        'ruleSet.duplicateHeldItemsAllowed',
        'ruleSet.timers',
      ],
      notes: 'Historical rule metadata for Regulation Set M-B, retained because existing catalog rows still cite this sourceRef. M-B start/end times were tracked from the season rollover rather than a dedicated announcement URL; the current rule is sourced from reg-mc-official-rule.',
    },
    {
      id: 'manual-seed-review',
      url: 'local://src/data/seed/regMA/catalog.ts',
      sourceType: 'manual-observation',
      licenseRisk: 'medium',
      retrievedAt: mbSourcesRetrievedAt,
      sourcePath: 'src/data/seed/regMA/catalog.ts',
      fieldsUsed: ['pokemon', 'forms', 'abilities', 'moves', 'items', 'learnsets', 'baseStats'],
      notes: 'Hand-authored MVP seed data for UI validation. Rows with this ref must stay needs-review.',
    },
    {
      id: 'reg-mb-official-eligible-pokemon',
      url: pokebaseChampionsPokemonUrl,
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: mbSourcesRetrievedAt,
      sourceVersion: 'row-count-235',
      fieldsUsed: ['eligiblePokemon.championsFormId', 'eligiblePokemon.nationalDexNo', 'eligiblePokemon.englishName', 'pokemon.regulationSets'],
      notes: 'M-B eligible Pokemon are reconciled from PokéBase Champions Regulation Set M-B tags because the previous official web-view URL still exposes the prior 213-row M-A payload. Rows stay manual-review until the official M-B eligible endpoint is captured.',
    },
    {
      id: 'pokebase-champions-pokemon-mb',
      url: pokebaseChampionsPokemonUrl,
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: mbSourcesRetrievedAt,
      sourceVersion: 'regulation-set-m-b',
      fieldsUsed: ['pokemon.types', 'pokemon.baseStats', 'pokemon.abilities', 'pokemon.moves', 'pokemon.regulationSets'],
      notes: 'PokéBase Champions pages currently include Regulation Set M-B rows and were used to seed the 22 new base Pokemon and 16 M-B Mega forms.',
    },
    {
      id: 'reg-ma-official-eligible-pokemon',
      url: officialEligiblePokemonUrl,
      sourceType: 'official',
      licenseRisk: 'medium',
      retrievedAt: '2026-04-28T15:20:00.000Z',
      sourceVersion: 'row-count-213',
      fieldsUsed: ['eligiblePokemon.championsFormId', 'eligiblePokemon.nationalDexNo', 'eligiblePokemon.englishName'],
      notes: 'Historical official public web-view Eligible Pokemon page for Regulation Set M-A. Retained because older generated catalog batches still cite this sourceRef.',
    },
    {
      id: 'reg-ma-official-mega-list',
      url: 'https://news.pokemon-home.com/en/page/751.html',
      sourceType: 'official',
      licenseRisk: 'low',
      retrievedAt: '2026-05-01T00:00:00.000Z',
      sourceVersion: 'mega-count-59',
      fieldsUsed: ['megaEvolution.englishName', 'megaEvolution.legalInCurrentRule'],
      notes: 'Historical Regulation Set M-A Mega list retained because the older generated Mega catalog rows still cite this sourceRef.',
    },
    {
      id: 'reg-mb-official-mega-list',
      url: pokebaseChampionsPokemonUrl,
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: mbSourcesRetrievedAt,
      sourceVersion: 'mega-count-75',
      fieldsUsed: ['megaEvolution.englishName', 'megaEvolution.legalInCurrentRule', 'pokemon.regulationSets'],
      notes: 'M-B Mega list is derived from PokéBase Champions Regulation Set M-B tags until a dedicated official M-B Mega list URL is captured.',
    },
    {
      id: 'reg-ma-community-item-snapshot',
      url: 'https://rotompicks.com/en/items/',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: '2026-05-01T00:00:00.000Z',
      sourceVersion: 'reg-ma-items-snapshot',
      fieldsUsed: ['items.id', 'items.englishName', 'items.legalInCurrentRule'],
      notes: 'Community item snapshot used only to narrow the visible item selector while the official item catalog is unavailable. Rows remain manual-review.',
    },
    {
      id: 'pokeapi-pokemon-data',
      url: 'https://pokeapi.co/api/v2/pokemon/',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: '2026-04-29T00:00:00.000Z',
      fieldsUsed: ['pokemon.types', 'pokemon.baseStats', 'pokemon.abilities', 'pokemon.sprites', 'pokemon.height', 'pokemon.weight'],
      notes: 'PokeAPI structured Pokemon data used for catalog rows and cached height/weight display. Rows remain manual-review.',
    },
    {
      id: 'pokeapi-move-data',
      url: 'https://pokeapi.co/api/v2/move/',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: '2026-05-02T00:00:00.000Z',
      sourcePath: 'scripts/generate-champions-moves.mjs',
      fieldsUsed: ['moves.chineseName', 'moves.effectSummary', 'moves.targetScope'],
      notes: 'PokeAPI structured move data is used to localize PokéBase Champions move rows and fill target labels. Champions learnability is not derived from PokeAPI.',
    },
    {
      id: 'pokemon-zhwiki-ability-text',
      url: 'https://wiki.52poke.com/wiki/神奇宝贝百科:机器读取守则',
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: '2026-05-01T00:00:00.000Z',
      sourcePath: 'scripts/generate-ability-effects.mjs',
      fieldsUsed: ['abilities.chineseName', 'abilities.effectSummary'],
      notes: 'Chinese ability text is generated from Pokemon Wiki MediaWiki revisions API using the infobox zh-hans text field, with PokeAPI zh-hans names preferred when present.',
    },
    {
      id: 'pokeapi-official-artwork',
      url: 'https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon/other/official-artwork',
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: '2026-04-29T00:00:00.000Z',
      fieldsUsed: ['pokemon.iconRef'],
      notes: 'Real Pokemon artwork sprites from the PokeAPI sprites repository. These images are not covered by the project MIT license; see THIRD_PARTY_NOTICES.md.',
    },
    {
      id: 'pokeapi-item-sprites',
      url: 'https://github.com/PokeAPI/sprites/tree/master/sprites/items',
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: mbSourcesRetrievedAt,
      sourcePath: 'scripts/generate-item-icons.mjs',
      fieldsUsed: ['item.iconRef'],
      notes: 'Canonical item sprites keyed by item ID. Used for tree berries after the community Champions source showed mismapped berry artwork; rows remain manual-review.',
    },
    {
      id: 'pokeapi-item-data',
      url: 'https://pokeapi.co/api/v2/item/',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: mbSourcesRetrievedAt,
      sourcePath: 'scripts/audit-item-catalog.mjs',
      fieldsUsed: ['item.chineseName'],
      notes: 'PokeAPI zh-hans item names are used to audit held-item and berry identity. Fairy Feather is cross-checked manually because PokeAPI currently has no zh-hans name for that item.',
    },
    {
      id: 'champions-official-training',
      url: 'https://champions.pokemon.com/en-us/pokemon/',
      sourceType: 'official',
      licenseRisk: 'low',
      retrievedAt: '2026-04-29T00:00:00.000Z',
      fieldsUsed: ['mechanics.statPoints.training', 'mechanics.homeTransferIsolation'],
      notes: 'Official Pokemon Champions page confirms VP-based training and that Champions training does not modify Pokemon HOME data.',
    },
    {
      id: 'champions-stat-point-review',
      url: 'https://bulbapedia.bulbagarden.net/wiki/Stat_point',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: '2026-04-29T00:00:00.000Z',
      fieldsUsed: ['mechanics.statPoints.maxTotal', 'mechanics.statPoints.maxPerStat', 'mechanics.statFormula'],
      notes: 'Community formula reference cross-checked against official training direction and developer interview. Treat as reviewed but monitor official docs.',
    },
    {
      id: 'champions-iv-removal-interview',
      url: 'https://hypebeast.com/2026/3/pokemon-champions-demo-masaaki-hoshino-interview-info',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: '2026-04-29T00:00:00.000Z',
      fieldsUsed: ['mechanics.ivRemoved'],
      notes: 'Developer interview states IVs were removed from Champions to lower team-building friction.',
    },
    {
      id: 'pokeapi-nature-data',
      url: 'https://pokeapi.co/api/v2/nature/',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: '2026-05-02T00:00:00.000Z',
      sourcePath: 'scripts/generate-natures.mjs',
      fieldsUsed: ['natures.id', 'natures.chineseName', 'natures.increasedStat', 'natures.decreasedStat', 'natures.neutral'],
      notes: 'Full 25 main-series natures ingested from PokeAPI. Champions nature compatibility remains manual-review pending official confirmation that Champions uses the same nature system.',
    },
    {
      id: 'mega-form-competitive-data',
      url: 'local://scripts/generate-mega-forms.mjs',
      sourceType: 'community',
      licenseRisk: 'medium',
      retrievedAt: '2026-05-02T00:00:00.000Z',
      sourcePath: 'scripts/generate-mega-forms.mjs',
      fieldsUsed: ['megaForms.baseStats', 'megaForms.types', 'megaForms.abilities', 'megaForms.chineseName', 'megaForms.englishName', 'megaForms.japaneseName', 'megaForms.iconRef'],
      notes: 'Old-gen Mega Evolution competitive data (stats, types, abilities) sourced from well-documented game data. Chinese names from PokeAPI species endpoint.',
    },
    {
      id: 'pokebase-champions-mega-data',
      url: 'https://pokebase.app/pokemon-champions/pokemon',
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: mbSourcesRetrievedAt,
      sourcePath: 'src/data/seed/regMA/mega-catalog.ts',
      fieldsUsed: ['megaForms.baseStats', 'megaForms.types', 'megaForms.abilities', 'megaForms.iconRef', 'abilities.effectSummary'],
      notes: 'PokéBase Champions Pokemon pages used to fill Champions-added Mega forms, including local snapshots of their form artwork. Ability text for Champions-only effects is translated from page descriptions and remains pending battle-mechanics verification.',
    },
    {
      id: 'pokebase-champions-item-icons',
      url: 'https://pokebase.app/pokemon-champions/items',
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: mbSourcesRetrievedAt,
      sourcePath: 'scripts/generate-item-icons.mjs',
      fieldsUsed: ['item.iconRef', 'item.englishName', 'item.effectSummary'],
      notes: 'Current-rule item names, categories, descriptions, and non-berry icon snapshots are reviewed against PokéBase Champions item pages. New M-B rows remain manual-review where PokéBase or official item pages are incomplete.',
    },
    {
      id: 'pokebase-champions-learnsets',
      url: 'https://pokebase.app/pokemon-champions/pokemon',
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: mbSourcesRetrievedAt,
      sourcePath: 'scripts/generate-champions-moves.mjs',
      fieldsUsed: ['moves.id', 'moves.englishName', 'moves.type', 'moves.category', 'moves.power', 'moves.accuracy', 'moves.pp', 'moves.learnableByPokemonIds'],
      notes: 'PokéBase Champions Pokemon Available Moves pages are the current M-B learnset source for the local assistant. Rows remain community-sourced and should be re-generated when PokéBase updates.',
    },
    {
      id: 'pokemon-zh-dataset-move-text',
      url: 'https://github.com/42arch/pokemon-dataset-zh',
      sourceType: 'community',
      licenseRisk: 'high',
      retrievedAt: '2026-05-02T00:00:00.000Z',
      sourcePath: 'scripts/generate-champions-moves.mjs',
      fieldsUsed: ['moves.chineseName', 'moves.effectSummary'],
      notes: 'Chinese move names and descriptions from 42arch/pokemon-dataset-zh (data originally scraped from 52poke wiki). Used as primary source for zh-hans move text.',
    },
  ],
  reviewPolicy: 'Every catalog row must retain sourceRefs and verificationStatus before being used for strong legality conclusions.',
  blockedMechanisms: ['Champions damage formula compatibility', 'complete move learnsets'],
};
