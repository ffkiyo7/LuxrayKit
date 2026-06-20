import {
  ArrowLeft,
  BarChart3,
  Database,
  ExternalLink,
  Globe2,
  Import,
  Info,
  List,
  Newspaper,
  Percent,
  RefreshCw,
  Search,
  Trophy,
  Users,
} from 'lucide-react';
import { useLayoutEffect, useMemo, useState } from 'react';
import {
  getEnvironmentItem,
  getEnvironmentMove,
  getEnvironmentPokemon,
  type EnvironmentBattleType,
  type EnvironmentPokemonUsage,
  type EnvironmentState,
  type EnvironmentTeamSample,
} from '../data/environment';
import { Button, Card, PokemonAvatar, TypeBadge } from '../components/ui';

const battleTypeLabels: Record<EnvironmentBattleType, string> = {
  singles: '单打',
  doubles: '双打',
};

const TEAM_SAMPLE_BATCH_SIZE = 4;
const DEFAULT_TEAM_SAMPLE_SHUFFLE_SEED = 0x9e3779b9;
const RANKING_TIERS = [
  { label: 'Tier 1', minRank: 1, maxRank: 5 },
  { label: 'Tier 2', minRank: 6, maxRank: 20 },
  { label: 'Tier 3', minRank: 21, maxRank: 60 },
  { label: 'Tier 4', minRank: 61, maxRank: Number.POSITIVE_INFINITY },
] as const;

const medalRankStyles = {
  1: {
    label: '金牌',
    className: 'border-[#d6a936] bg-[#d6a936]/20 text-[#f1c84c]',
  },
  2: {
    label: '银牌',
    className: 'border-[#aeb7c4] bg-[#aeb7c4]/20 text-[#cbd2dc]',
  },
  3: {
    label: '铜牌',
    className: 'border-[#b87333] bg-[#b87333]/20 text-[#d99554]',
  },
} as const;

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

const formatSampleCount = (value: number) => (value > 0 ? `${value} 队` : '暂无样本');

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleTeamSamples = (samples: EnvironmentTeamSample[], seed: number) => {
  const nextSamples = [...samples];
  const random = seededRandom(seed);
  for (let index = nextSamples.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextSamples[index], nextSamples[swapIndex]] = [nextSamples[swapIndex], nextSamples[index]];
  }
  return nextSamples;
};

const nextTeamSampleShuffleSeed = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] || DEFAULT_TEAM_SAMPLE_SHUFFLE_SEED;
  }
  return Math.floor(Math.random() * 0xffffffff) || DEFAULT_TEAM_SAMPLE_SHUFFLE_SEED;
};

const sampleSourceLabel = (sample: EnvironmentTeamSample) => {
  if (sample.sourceId?.includes('vgcpastes') || sample.id.startsWith('vgcpastes-')) return 'VGCPastes';
  return 'PokeDB 环境榜';
};

const isVgcPastesSample = (sample: EnvironmentTeamSample) =>
  Boolean(sample.sourceId?.includes('vgcpastes') || sample.id.startsWith('vgcpastes-'));

const sampleCardTitle = (sample: EnvironmentTeamSample) => {
  if (!isVgcPastesSample(sample)) return sample.title;
  return sample.title || [sample.author, sample.tournament, sample.eventRank].filter(Boolean).join(' · ') || '锦标赛公开构筑';
};

const sampleCardMeta = (sample: EnvironmentTeamSample) => {
  if (isVgcPastesSample(sample)) {
    const eventParts = [sample.tournament, sample.eventRank].filter(Boolean);
    const dateText = sample.dateShared ? `分享 ${sample.dateShared}` : undefined;
    return [sample.author ? `原作者：${sample.author}` : undefined, eventParts.join(' · ') || undefined, dateText].filter(
      (part): part is string => Boolean(part),
    );
  }

  return [`原作者：${sample.author}`, battleTypeLabels[sample.battleType]];
};

const sourceKindLabels: Record<EnvironmentState['sourceKind'], string> = {
  worker: '在线数据',
  static: '静态缓存',
  seed: '内置样例',
};

function EnvironmentHeaderMeta({
  environment,
  battleType,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
}) {
  const freshnessLabel = environment.freshness === 'fresh' ? '最新' : '可能过期';

  return (
    <div className="mt-1 space-y-0.5 text-xs text-textSecondary">
      <div className="flex flex-wrap items-center gap-2">
        <span>{environment.seasonLabel} · {battleTypeLabels[battleType]}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            environment.freshness === 'fresh'
              ? 'bg-success/15 text-success'
              : 'bg-warning/15 text-warning'
          }`}
        >
          {freshnessLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        <span>{sourceKindLabels[environment.sourceKind]}</span>
        <span>源更新 {formatUpdatedAt(environment.sourceUpdatedAt)}</span>
      </div>
      <p>抓取 {formatUpdatedAt(environment.updatedAt)}</p>
    </div>
  );
}

function UsageBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = medalRankStyles[rank as keyof typeof medalRankStyles];

  if (!medal) {
    return (
      <span aria-label={`第 ${rank} 名`} className="inline-flex w-7 justify-center text-sm font-semibold text-textSecondary">
        {rank}
      </span>
    );
  }

  return (
    <span
      aria-label={`第 ${rank} 名，${medal.label}`}
      className={`inline-grid h-7 w-7 place-items-center rounded-full border text-sm font-bold shadow-sm ${medal.className}`}
      title={`第 ${rank} 名，${medal.label}`}
    >
      {rank}
    </span>
  );
}

function RankingRow({
  pokemonId,
  rank,
  onOpen,
}: {
  pokemonId: string;
  rank: number;
  onOpen: (pokemonId: string) => void;
}) {
  const entry = getEnvironmentPokemon(pokemonId);
  if (!entry) return null;

  return (
    <button className="flex w-full items-center gap-3 border-t border-divider py-3 text-left first:border-t-0" type="button" onClick={() => onOpen(pokemonId)}>
      <span className="w-7 shrink-0 text-center">
        <RankBadge rank={rank} />
      </span>
      <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{entry.chineseName}</span>
        <span className="mt-1 flex gap-1">
          {entry.types.map((type) => (
            <TypeBadge key={type} type={type} size="sm" />
          ))}
        </span>
      </span>
    </button>
  );
}

function TeamSampleCard({
  sample,
  onImport,
}: {
  sample: EnvironmentTeamSample;
  onImport: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const [importing, setImporting] = useState(false);
  const visibleSlots = sample.slots.map((slot) => getEnvironmentPokemon(slot.pokemonId)).filter(Boolean);
  const metaParts = sampleCardMeta(sample);
  const importChips = [
    sample.hasSpread ? 'SP分配' : undefined,
    sample.hasMoves ? '配招' : undefined,
    sample.replicaCode ? '队伍码' : undefined,
  ].filter((chip): chip is string => Boolean(chip));

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(sample);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="bg-secondary">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{sampleCardTitle(sample)}</h3>
          <p className="mt-1 text-xs text-textSecondary">{metaParts.join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-textSecondary">
              <Trophy size={12} />
              {sampleSourceLabel(sample)}
            </span>
          </div>
        </div>
        <button
          aria-label="队报链接"
          title="队报链接"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-textSecondary active:scale-[0.96]"
          type="button"
          onClick={() => window.open(sample.reportUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={15} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {visibleSlots.map((entry) => (
          <PokemonAvatar key={entry!.id} iconRef={entry!.iconRef} label={entry!.chineseName} size="sm" />
        ))}
      </div>
      {importChips.length > 0 && <p className="mt-2 text-xs text-textSecondary">可导入：{importChips.map((chip) => `[${chip}]`).join('')}</p>}
      <Button className="mt-3 w-full" onClick={handleImport} disabled={importing}>
        <Import size={14} />
        {importing ? '导入中' : '导入配置'}
      </Button>
    </Card>
  );
}

function PokemonEnvironmentDetail({
  environment,
  battleType,
  pokemonId,
  onBack,
  onImportSample,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
  pokemonId: string;
  onBack: () => void;
  onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const [expandedSection, setExpandedSection] = useState<'moves' | 'items' | 'teammates' | null>(null);
  const usage = environment.pokemonUsage[battleType].find((item) => item.pokemonId === pokemonId);
  const usageRank = environment.pokemonUsage[battleType].findIndex((item) => item.pokemonId === pokemonId) + 1;
  const entry = getEnvironmentPokemon(pokemonId);

  if (!entry) return null;

  const moveRows = (usage?.moveStats ?? [])
    .map((stat) => ({ stat, move: getEnvironmentMove(stat.id) }))
    .filter((row): row is { stat: NonNullable<EnvironmentPokemonUsage['moveStats']>[number]; move: NonNullable<ReturnType<typeof getEnvironmentMove>> } =>
      Boolean(row.move),
    );
  const itemRows = (usage?.itemStats ?? [])
    .map((stat) => ({ stat, item: getEnvironmentItem(stat.id) }))
    .filter((row): row is { stat: NonNullable<EnvironmentPokemonUsage['itemStats']>[number]; item: NonNullable<ReturnType<typeof getEnvironmentItem>> } =>
      Boolean(row.item),
    );
  const teammateRows = (usage?.teammateStats ?? [])
    .map((stat) => ({ stat, pokemon: getEnvironmentPokemon(stat.id) }))
    .filter(
      (row): row is { stat: NonNullable<EnvironmentPokemonUsage['teammateStats']>[number]; pokemon: NonNullable<ReturnType<typeof getEnvironmentPokemon>> } =>
        Boolean(row.pokemon),
    );
  const relatedSamples = environment.teamSamples.filter(
    (sample) => sample.battleType === battleType && sample.slots.some((slot) => slot.pokemonId === pokemonId),
  );

  const visibleMoves = expandedSection === 'moves' ? moveRows.slice(0, 10) : moveRows.slice(0, 5);
  const visibleItems = expandedSection === 'items' ? itemRows.slice(0, 10) : itemRows.slice(0, 5);
  const visibleTeammates = expandedSection === 'teammates' ? teammateRows.slice(0, 7) : teammateRows.slice(0, 4);

  return (
    <div className="space-y-3">
      <button className="inline-flex items-center gap-2 text-sm text-textSecondary" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回环境
      </button>
      <Card className="bg-secondary">
        <div className="flex items-center gap-3">
          <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold">{entry.chineseName}</h2>
            <p className="mt-1 text-xs text-textSecondary">{entry.englishName}</p>
            <div className="mt-2 flex gap-1">
              {entry.types.map((type) => (
                <TypeBadge key={type} type={type} size="sm" />
              ))}
            </div>
          </div>
          {usage && (
            <div className="shrink-0 text-center">
              <RankBadge rank={usageRank} />
            </div>
          )}
        </div>
      </Card>

      {moveRows.length > 0 && (
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">常用招式</h3>
            {moveRows.length > 5 && (
              <button className="text-xs text-accent" onClick={() => setExpandedSection(expandedSection === 'moves' ? null : 'moves')}>
                {expandedSection === 'moves' ? '收起' : '展开'}
              </button>
            )}
          </div>
          <div className="divide-y divide-divider">
            {visibleMoves.map(({ move, stat }) => (
              <div key={move.id} className="grid grid-cols-[1fr_auto] gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{move.chineseName}</span>
                  <span className="mt-1 flex items-center gap-2 text-[11px] text-textSecondary">
                    <TypeBadge type={move.type} size="sm" />
                    {move.category}
                  </span>
                </span>
                <span className="text-sm font-semibold text-accent">{stat.usageRate.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {itemRows.length > 0 && (
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">携带道具</h3>
            {itemRows.length > 5 && (
              <button className="text-xs text-accent" onClick={() => setExpandedSection(expandedSection === 'items' ? null : 'items')}>
                {expandedSection === 'items' ? '收起' : '展开'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {visibleItems.map(({ item, stat }) => (
              <div key={item.id} className="flex items-center gap-3">
                <PokemonAvatar iconRef={item.iconRef} label={item.chineseName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{item.chineseName}</p>
                    <p className="shrink-0 text-xs font-semibold text-accent">{stat.usageRate.toFixed(1)}%</p>
                  </div>
                  <UsageBar value={stat.usageRate} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {teammateRows.length > 0 && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">常见队友</h3>
            {teammateRows.length > 4 && (
              <button className="text-xs text-accent" onClick={() => setExpandedSection(expandedSection === 'teammates' ? null : 'teammates')}>
                {expandedSection === 'teammates' ? '收起' : '展开'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {visibleTeammates.map(({ pokemon: mate, stat }) => (
              <div key={mate.id} className="rounded-lg border border-border bg-secondary p-2 text-center">
                <PokemonAvatar iconRef={mate.iconRef} label={mate.chineseName} size="md" />
                <p className="mt-2 truncate text-[11px] font-semibold">{mate.chineseName}</p>
                {environment.overallUsageBasis === 'absolute' && (
                  <p className="mt-0.5 text-[10px] font-semibold text-accent">{stat.usageRate.toFixed(1)}%</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {relatedSamples.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Users size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">相关上位构筑</h3>
          </div>
          {relatedSamples.map((sample) => (
            <TeamSampleCard key={sample.id} sample={sample} onImport={onImportSample} />
          ))}
        </section>
      )}
    </div>
  );
}

function FullRankingPage({
  environment,
  battleType,
  rankings,
  onBattleTypeChange,
  onBack,
  onOpenPokemon,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
  rankings: EnvironmentPokemonUsage[];
  onBattleTypeChange: (battleType: EnvironmentBattleType) => void;
  onBack: () => void;
  onOpenPokemon: (pokemonId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredRankings = useMemo(
    () =>
      rankings
        .map((item, index) => ({ item, rank: index + 1 }))
        .filter(({ item }) => {
          if (!normalizedQuery) return true;
          const entry = getEnvironmentPokemon(item.pokemonId);
          return entry
            ? entry.chineseName.toLocaleLowerCase().includes(normalizedQuery)
              || entry.englishName.toLocaleLowerCase().includes(normalizedQuery)
            : false;
        }),
    [normalizedQuery, rankings],
  );

  return (
    <div className="space-y-3">
      <button className="inline-flex items-center gap-2 text-sm text-textSecondary" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回环境
      </button>

      <section className="rounded-xl border border-border bg-gradient-to-b from-elevated to-page p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-textMuted">Ranking</p>
            <h2 className="mt-1 text-2xl font-semibold">完整宝可梦榜</h2>
            <EnvironmentHeaderMeta environment={environment} battleType={battleType} />
          </div>
          <div className="grid grid-cols-2 rounded-lg border border-border bg-page p-1 text-sm font-semibold">
            {(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => (
              <button
                key={type}
                className={`rounded-md px-3 py-2 ${battleType === type ? 'bg-accent text-page' : 'text-textSecondary'}`}
                type="button"
                onClick={() => onBattleTypeChange(type)}
              >
                {battleTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Card>
        <label className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-textSecondary">
          <Search size={16} className="shrink-0" />
          <input
            aria-label="搜索宝可梦"
            className="min-w-0 flex-1 bg-transparent text-sm text-textPrimary outline-none placeholder:text-textMuted"
            type="search"
            placeholder="搜索中文名或英文名"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        {filteredRankings.length > 0 ? (
          normalizedQuery ? (
            <div>
              {filteredRankings.map(({ item, rank }) => (
                <RankingRow
                  key={item.pokemonId}
                  pokemonId={item.pokemonId}
                  rank={rank}
                  onOpen={onOpenPokemon}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {RANKING_TIERS.map((tier) => {
                const tierRankings = filteredRankings.filter(
                  ({ rank }) => rank >= tier.minRank && rank <= tier.maxRank,
                );
                if (tierRankings.length === 0) return null;

                return (
                  <section key={tier.label} aria-labelledby={`ranking-${tier.label.replace(' ', '-').toLowerCase()}`}>
                    <div className="flex items-center gap-2 border-b border-divider pb-2">
                      <h3
                        id={`ranking-${tier.label.replace(' ', '-').toLowerCase()}`}
                        className="text-xs font-bold uppercase tracking-[0.16em] text-accent"
                      >
                        {tier.label}
                      </h3>
                      <span className="text-[10px] text-textMuted">
                        {tier.maxRank === Number.POSITIVE_INFINITY
                          ? `${tier.minRank}+`
                          : `${tier.minRank}–${tier.maxRank}`}
                      </span>
                    </div>
                    <div>
                      {tierRankings.map(({ item, rank }) => (
                        <RankingRow
                          key={item.pokemonId}
                          pokemonId={item.pokemonId}
                          rank={rank}
                          onOpen={onOpenPokemon}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )
        ) : (
          <p className="py-8 text-center text-sm text-textSecondary">
            {normalizedQuery ? '没有找到匹配的宝可梦' : '暂无数据'}
          </p>
        )}
      </Card>
    </div>
  );
}

function EnvironmentMethodologyPage({
  environment,
  battleType,
  onBattleTypeChange,
  onBack,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
  onBattleTypeChange: (battleType: EnvironmentBattleType) => void;
  onBack: () => void;
}) {
  const methodologyItems = [
    {
      label: '来源',
      description:
        environment.sourceKind === 'seed'
          ? '内置开发样例（不代表真实环境）'
          : `PokeDB 公开统计页（${environment.seasonLabel} 当季聚合）`,
      icon: Database,
    },
    {
      label: '范围',
      description: '不是全服实时统计',
      icon: Globe2,
    },
    {
      label: '排行',
      description: 'PokeDB 公布的使用排名（无总使用率 %，只有名次）',
      icon: Trophy,
    },
    {
      label: '详情',
      description: '招式、道具 % 是真实占比；队友仅按搭档排名展示',
      icon: Percent,
    },
    {
      label: '构筑',
      description: '来自公开队报链接（已结束赛季 / 構築記事）',
      icon: Newspaper,
    },
  ];

  return (
    <div className="space-y-3">
      <button className="inline-flex items-center gap-2 text-sm text-textSecondary" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回环境
      </button>

      <section className="rounded-xl border border-border bg-gradient-to-b from-elevated to-page p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-textMuted">Methodology</p>
            <h2 className="mt-1 text-2xl font-semibold">数据口径</h2>
            <EnvironmentHeaderMeta environment={environment} battleType={battleType} />
          </div>
          <div className="grid grid-cols-2 rounded-lg border border-border bg-page p-1 text-sm font-semibold">
            {(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => (
              <button
                key={type}
                className={`rounded-md px-3 py-2 ${battleType === type ? 'bg-accent text-page' : 'text-textSecondary'}`}
                type="button"
                onClick={() => onBattleTypeChange(type)}
              >
                {battleTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Card>
        <h3 className="text-sm font-semibold">样本池</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => (
            <div
              key={type}
              className={`cursor-default select-none rounded-lg border p-3 ${type === battleType ? 'border-accent bg-accent/10' : 'border-border bg-secondary'}`}
            >
              <p className="text-xs text-textSecondary">{battleTypeLabels[type]}</p>
              <p className="mt-1 text-lg font-semibold">{formatSampleCount(environment.sampleTeamCounts[type])}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <dl className="divide-y divide-divider">
          {methodologyItems.map(({ label, description, icon: Icon }) => (
            <div key={label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <dt className="text-xs font-semibold text-textPrimary">{label}</dt>
                <dd className="mt-0.5 text-xs leading-5 text-textSecondary">{description}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

export function EnvironmentPage({
  environment,
  onImportSample,
}: {
  environment: EnvironmentState;
  onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const [battleType, setBattleType] = useState<EnvironmentBattleType>('singles');
  const [view, setView] = useState<'home' | 'ranking' | 'methodology'>('home');
  const [detailState, setDetailState] = useState<{ pokemonId: string; returnView: 'home' | 'ranking' } | null>(null);
  const [teamSampleBatchIndex, setTeamSampleBatchIndex] = useState(0);
  const [teamSampleShuffleSeed, setTeamSampleShuffleSeed] = useState(nextTeamSampleShuffleSeed);
  const rankings = useMemo(() => environment.pokemonUsage[battleType], [battleType, environment.pokemonUsage]);
  const teamSamples = useMemo(
    () => environment.teamSamples.filter((sample) => sample.battleType === battleType),
    [battleType, environment.teamSamples],
  );
  const shuffledTeamSamples = useMemo(
    () => shuffleTeamSamples(teamSamples, teamSampleShuffleSeed),
    [teamSampleShuffleSeed, teamSamples],
  );
  const teamSamplePageCount = Math.max(1, Math.ceil(teamSamples.length / TEAM_SAMPLE_BATCH_SIZE));
  const normalizedTeamSampleBatchIndex = teamSampleBatchIndex % teamSamplePageCount;
  const visibleTeamSamples = shuffledTeamSamples.slice(
    normalizedTeamSampleBatchIndex * TEAM_SAMPLE_BATCH_SIZE,
    normalizedTeamSampleBatchIndex * TEAM_SAMPLE_BATCH_SIZE + TEAM_SAMPLE_BATCH_SIZE,
  );
  const changeBattleType = (nextBattleType: EnvironmentBattleType) => {
    setBattleType(nextBattleType);
    setTeamSampleBatchIndex(0);
    setTeamSampleShuffleSeed(nextTeamSampleShuffleSeed());
  };
  const showNextTeamSampleBatch = () => {
    const nextIndex = normalizedTeamSampleBatchIndex + 1;
    if (nextIndex >= teamSamplePageCount) {
      setTeamSampleBatchIndex(0);
      setTeamSampleShuffleSeed(nextTeamSampleShuffleSeed());
      return;
    }
    setTeamSampleBatchIndex(nextIndex);
  };

  // Home / ranking / methodology / detail are swapped inside the same window-level
  // scroll container, so the browser keeps the previous scroll offset. Reset to the
  // top whenever the visible screen changes, otherwise opening a Pokemon from far down
  // the list lands mid-page (e.g. on the items card) instead of the avatar header.
  // useLayoutEffect runs before paint so the correction is invisible (no flicker of
  // the old scroll position on slower devices).
  const detailPokemonId = detailState?.pokemonId ?? null;
  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, left: 0 });
    }
  }, [view, detailPokemonId]);

  if (detailState) {
    return (
      <PokemonEnvironmentDetail
        environment={environment}
        battleType={battleType}
        pokemonId={detailState.pokemonId}
        onImportSample={onImportSample}
        onBack={() => {
          setView(detailState.returnView);
          setDetailState(null);
        }}
      />
    );
  }

  if (view === 'ranking') {
    return (
      <FullRankingPage
        environment={environment}
        battleType={battleType}
        rankings={rankings}
        onBattleTypeChange={setBattleType}
        onBack={() => setView('home')}
        onOpenPokemon={(pokemonId) => setDetailState({ pokemonId, returnView: 'ranking' })}
      />
    );
  }

  if (view === 'methodology') {
    return (
      <EnvironmentMethodologyPage
        environment={environment}
        battleType={battleType}
        onBattleTypeChange={changeBattleType}
        onBack={() => setView('home')}
      />
    );
  }

  const visibleRankings = rankings.slice(0, 5);

  return (
    <div className="space-y-3">
      <section className="relative rounded-xl border border-border bg-gradient-to-b from-elevated to-page p-4 pb-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-textMuted">Environment</p>
            <h2 className="mt-1 text-2xl font-semibold">环境</h2>
            <EnvironmentHeaderMeta environment={environment} battleType={battleType} />
          </div>
          <div className="grid grid-cols-2 rounded-lg border border-border bg-page p-1 text-sm font-semibold">
            {(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => (
              <button
                key={type}
                className={`rounded-md px-3 py-2 ${battleType === type ? 'bg-accent text-page' : 'text-textSecondary'}`}
                type="button"
                onClick={() => changeBattleType(type)}
              >
                {battleTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>
        <button
          aria-label="查看数据口径"
          className="absolute bottom-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-textSecondary active:scale-[0.98]"
          title="查看数据口径"
          type="button"
          onClick={() => setView('methodology')}
        >
          <Info size={15} />
          数据口径
        </button>
      </section>

      <Card>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">宝可梦榜</h3>
          </div>
          <button className="inline-flex items-center gap-1 text-xs text-accent" type="button" onClick={() => setView('ranking')}>
            <List size={14} />
            查看全部
          </button>
        </div>
        <div>
          {visibleRankings.map((item, index) => (
            <RankingRow
              key={item.pokemonId}
              pokemonId={item.pokemonId}
              rank={index + 1}
              onOpen={(pokemonId) => setDetailState({ pokemonId, returnView: 'home' })}
            />
          ))}
        </div>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">上位构筑</h3>
          </div>
          {teamSamples.length > TEAM_SAMPLE_BATCH_SIZE && (
            <button
              className="inline-flex items-center gap-1 text-xs text-accent"
              type="button"
              onClick={showNextTeamSampleBatch}
            >
              <RefreshCw size={14} />
              换一批
            </button>
          )}
        </div>
        {visibleTeamSamples.map((sample) => (
          <TeamSampleCard key={sample.id} sample={sample} onImport={onImportSample} />
        ))}
      </section>
    </div>
  );
}
