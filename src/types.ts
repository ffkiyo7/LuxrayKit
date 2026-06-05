export type VerificationStatus = 'official' | 'community-verified' | 'manual-review' | 'mock';
export type LegalityStatus = 'legal' | 'illegal' | 'needs-review' | 'missing-config';
export type BattleType = 'singles' | 'doubles';
export type SourceType = 'official' | 'community' | 'derived' | 'manual-observation';
export type LicenseRisk = 'low' | 'medium' | 'high' | 'blocked';
export type PokemonType =
  | 'Normal'
  | 'Fire'
  | 'Water'
  | 'Electric'
  | 'Grass'
  | 'Ice'
  | 'Fighting'
  | 'Poison'
  | 'Ground'
  | 'Flying'
  | 'Psychic'
  | 'Bug'
  | 'Rock'
  | 'Ghost'
  | 'Dragon'
  | 'Dark'
  | 'Steel'
  | 'Fairy';

export type BaseStats = {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
};

export type RuleSet = {
  id: string;
  name: string;
  displayName: string;
  startAt: string;
  endAt: string;
  battleType: BattleType;
  allowMega: boolean;
  megaLimitPerBattle: number;
  duplicateHeldItemsAllowed: boolean;
  timers: {
    totalTimeMinutes: number;
    playerTimeMinutes: number;
    turnTimeSeconds: number;
    previewTimeSeconds: number;
  };
  officialSourceUrl: string;
  dataVersionId: string;
  status: 'current' | 'expired' | 'upcoming';
};

export type DataVersion = {
  id: string;
  ruleSetId: string;
  versionName: string;
  updatedAt: string;
  sourceSummary: string;
  sourceUrls: string[];
  verificationStatus: VerificationStatus;
  notes: string;
};

export type SourceRef = {
  id: string;
  url: string;
  sourceType: SourceType;
  licenseRisk: LicenseRisk;
  retrievedAt: string;
  sourceVersion?: string;
  sourcePath?: string;
  fieldsUsed: string[];
  notes?: string;
};

export type DataSourceManifest = {
  id: string;
  ruleSetId: string;
  mode: 'versioned-seed' | 'official-ingestion';
  sources: SourceRef[];
  reviewPolicy: string;
  blockedMechanisms: string[];
};

export type EligiblePokemon = {
  id: string;
  pokemonId?: string;
  championsFormId: string;
  nationalDexNo: number;
  englishName: string;
  formName?: string;
  verificationStatus: VerificationStatus;
  sourceRefs: string[];
  reviewNotes: string;
};

export type PokemonForm = {
  id: string;
  pokemonId: string;
  name: string;
  chineseName: string;
  englishName: string;
  japaneseName: string;
  iconRef: string;
  artworkRef?: string;
  isMega: boolean;
  requiredItemId?: string;
  types: PokemonType[];
  baseStats: BaseStats;
  abilities: string[];
  legalInCurrentRule: boolean;
  sourceRefs: string[];
};

export type MegaEvolutionEntry = {
  id: string;
  englishName: string;
  basePokemonId?: string;
  formId?: string;
  legalInCurrentRule: boolean;
  verificationStatus: VerificationStatus;
  sourceRefs: string[];
  reviewNotes: string;
};

export type Pokemon = {
  id: string;
  nationalDexNo: number;
  chineseName: string;
  englishName: string;
  japaneseName: string;
  iconRef: string;
  artworkRef?: string;
  types: PokemonType[];
  baseStats: BaseStats;
  legalInCurrentRule: boolean;
  forms: PokemonForm[];
  abilities: string[];
  learnableMoves: string[];
  canMega: boolean;
  megaForms: PokemonForm[];
  notes: string;
  sourceRefs: string[];
};

export type Move = {
  id: string;
  chineseName: string;
  englishName: string;
  type: PokemonType;
  category: 'Physical' | 'Special' | 'Status';
  power?: number;
  accuracy?: number;
  pp: number;
  targetScope: string;
  makesContact: boolean;
  affectedByProtect: boolean;
  effectSummary: string;
  legalInCurrentRule: boolean;
  learnableByPokemonIds: string[];
  sourceRefs: string[];
};

export type Item = {
  id: string;
  chineseName: string;
  englishName: string;
  effectSummary: string;
  legalInCurrentRule: boolean;
  isMegaStone: boolean;
  applicablePokemonIds: string[];
  teamRestrictionNotes: string;
  sourceRefs: string[];
  iconRef?: string;
};

export type Ability = {
  id: string;
  chineseName: string;
  englishName: string;
  effectSummary: string;
  pokemonIds: string[];
  calculationImpact: 'confirmed' | 'pending' | 'none';
  legalInCurrentRule: boolean;
  sourceRefs: string[];
};

export type StatPoints = Partial<Record<keyof BaseStats, number>>;

export type MegaSelectionState = 'none' | `${'attacker' | 'defender'}:${string}`;

export type TeamMember = {
  id: string;
  pokemonId?: string;
  formId?: string;
  abilityId?: string;
  itemId?: string;
  moveIds: string[];
  nature: string;
  statPoints: StatPoints;
  level: number;
  notes: string;
  legalityStatus: LegalityStatus;
};

export type TeamSource =
  | {
      kind: 'high-score-import';
      sampleId: string;
      title: string;
      author: string;
      score: number;
      battleType: BattleType;
      reportUrl: string;
      importedAt: string;
    }
  | {
      kind: 'environment-sample-import';
      sampleId: string;
      title: string;
      label: string;
      battleType: BattleType;
      reportUrl: string;
      importedAt: string;
    }
  | {
      kind: 'external-report-import';
      title: string;
      reportUrl: string;
      importedAt: string;
    };

export type Team = {
  id: string;
  name: string;
  ruleSetId: string;
  dataVersionId: string;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
  sortOrder?: number;
  notes: string;
  source?: TeamSource;
};

export type DamageCalcContext = {
  attacker?: TeamMember;
  defender?: TeamMember;
  moveId?: string;
  battleType: BattleType;
  spreadDamage: boolean;
  weather: string;
  terrain: string;
  statStages: Record<string, number>;
  megaState: MegaSelectionState;
  additionalChampionsMechanics: 'pending';
  dataVersionId: string;
};

export type SpeedBenchmark = {
  id: string;
  name: string;
  pokemonId: string;
  formId?: string;
  nature: string;
  speedStatPoints: number;
  itemOrStatus: string;
  isMega: boolean;
  finalSpeed: number;
  tags: string[];
  source: string;
  notes: string;
  benchmarkType: 'preset' | 'favorite' | 'team';
  dataVersionId: string;
};

export type UserPreference = {
  language: 'zh-CN';
  theme: 'dark' | 'light';
  favoriteBenchmarkIds: string[];
  defaultBenchmarkFilters: string[];
  cachedRuleSetId: string;
  lastDataRefreshAt: string;
  hasSeenEnvironmentImportNotice: boolean;
};

export type AppState = {
  teams: Team[];
  preferences: UserPreference;
  lastRefreshError?: string;
};
