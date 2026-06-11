import { ArrowLeft, BarChart3, ExternalLink, Import, Info, List, RefreshCw, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
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

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

const formatSampleCount = (value: number) => (value > 0 ? `${value} 队` : '暂无样本');

function UsageBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function RankingRow({
  pokemonId,
  usageRate,
  teamCount,
  rank,
  usageBasis,
  onOpen,
}: {
  pokemonId: string;
  usageRate: number;
  teamCount: number;
  rank: number;
  usageBasis: EnvironmentState['overallUsageBasis'];
  onOpen: (pokemonId: string) => void;
}) {
  const entry = getEnvironmentPokemon(pokemonId);
  if (!entry) return null;

  return (
    <button className="flex w-full items-center gap-3 border-t border-divider py-3 text-left first:border-t-0" type="button" onClick={() => onOpen(pokemonId)}>
      <span className="w-5 shrink-0 text-center text-sm font-semibold text-textSecondary">{rank}</span>
      <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{entry.chineseName}</span>
        <span className="mt-1 flex gap-1">
          {entry.types.map((type) => (
            <TypeBadge key={type} type={type} size="sm" />
          ))}
        </span>
      </span>
      <span className="w-[74px] shrink-0 text-right">
        {usageBasis === 'rank-relative' ? (
          <span className="block text-sm font-semibold text-accent">排名第 {rank}</span>
        ) : (
          <>
            <span className="block text-lg font-semibold text-accent">{usageRate.toFixed(1)}%</span>
            <span className="text-[11px] text-textMuted">{teamCount} 队</span>
          </>
        )}
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
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold">{sample.title}</h3>
        <p className="mt-1 text-xs text-textSecondary">原作者：{sample.author} · {battleTypeLabels[sample.battleType]}</p>
      </div>
      <div className="mt-3 flex gap-2">
        {visibleSlots.map((entry) => (
          <PokemonAvatar key={entry!.id} iconRef={entry!.iconRef} label={entry!.chineseName} size="sm" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={handleImport} disabled={importing}>
          <Import size={14} />
          {importing ? '导入中' : '导入配置'}
        </Button>
        <Button variant="ghost" onClick={() => window.open(sample.reportUrl, '_blank', 'noopener,noreferrer')}>
          <ExternalLink size={14} />
          队报链接
        </Button>
      </div>
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
            <div className="text-right">
              {environment.overallUsageBasis === 'rank-relative' ? (
                <p className="text-base font-semibold text-accent">排名第 {usageRank}</p>
              ) : (
                <>
                  <p className="text-2xl font-semibold text-accent">{usage.usageRate.toFixed(1)}%</p>
                  <p className="text-[11px] text-textMuted">{usage.teamCount} 队</p>
                </>
              )}
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
            <p className="mt-1 text-xs text-textSecondary">{environment.sourceLabel}</p>
            <p className="mt-0.5 text-xs text-textSecondary">更新于 {formatUpdatedAt(environment.updatedAt)}</p>
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
        <div>
          {rankings.map((item, index) => (
            <RankingRow
              key={item.pokemonId}
              rank={index + 1}
              usageBasis={environment.overallUsageBasis}
              onOpen={onOpenPokemon}
              {...item}
            />
          ))}
        </div>
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
  const sampleCount = environment.sampleTeamCounts[battleType];
  const isPokeDb = environment.loadStatus === 'pokedb';

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
            <p className="mt-1 text-xs text-textSecondary">{environment.sourceLabel}</p>
            <p className="mt-0.5 text-xs text-textSecondary">更新于 {formatUpdatedAt(environment.updatedAt)}</p>
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
            <div key={type} className={`rounded-lg border p-3 ${type === battleType ? 'border-accent bg-accent/10' : 'border-border bg-secondary'}`}>
              <p className="text-xs text-textSecondary">{battleTypeLabels[type]}</p>
              <p className="mt-1 text-lg font-semibold">{formatSampleCount(environment.sampleTeamCounts[type])}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-textSecondary">
          {environment.overallUsageBasis === 'rank-relative'
            ? `当前查看的是${battleTypeLabels[battleType]}环境，宝可梦榜按使用排名排序；${formatSampleCount(sampleCount)} 是榜单结果数，不作为绝对携带率分母。`
            : `当前查看的是${battleTypeLabels[battleType]}环境，百分比和队伍数都以这 ${formatSampleCount(sampleCount)} 为分母。`}
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">数据来源</h3>
        <p className="mt-2 text-xs leading-5 text-textSecondary">
          {isPokeDb
            ? '来源是 PokeDB 公开的 M-1 上位构筑快照和训练家队报页面。应用在维护时拉取公开数据，整理成离线可读的环境包。'
            : '当前加载的是开发样例数据，只用于页面结构预览；不能代表真实环境。'}
        </p>
        <p className="mt-2 text-xs leading-5 text-textSecondary">
          这不是全服实时统计，也不是所有玩家队伍全集；它反映的是当前数据包收录到的公开上位样本。
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">宝可梦榜</h3>
        <p className="mt-2 text-xs leading-5 text-textSecondary">
          {environment.overallUsageBasis === 'rank-relative'
            ? '宝可梦榜按 PokeDB 公布的使用排名排序。页面展示名次，不把排名派生值解释为队伍携带比例。'
            : '宝可梦旁边的百分比表示：在当前样本池里，有多少比例的队伍携带了这只宝可梦。比如 54.0% / 285 队，意思是当前样本池中有 285 支队伍带了这只宝可梦，约占全部样本的 54.0%。'}
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">详情页统计</h3>
        <p className="mt-2 text-xs leading-5 text-textSecondary">
          {environment.overallUsageBasis === 'rank-relative'
            ? '常用招式、携带道具等百分比沿用 PokeDB 公布的真实占比；常见队友只按搭档排名展示，不解释为绝对携带率。'
            : '常用招式、携带道具、常见队友的百分比，是在“已经带了这只宝可梦”的队伍里继续统计，不是以全部环境队伍为分母。'}
        </p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">上位构筑</h3>
        <p className="mt-2 text-xs leading-5 text-textSecondary">
          上位构筑卡片来自公开队报链接，标题里的“最高第 N 名”和分数用于说明该队在上赛季达到过的排名表现。样本只可靠展示宝可梦和道具；性格、SP、配招仍需要打开队报或手动确认。
        </p>
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
  const rankings = useMemo(() => environment.pokemonUsage[battleType], [battleType, environment.pokemonUsage]);
  const teamSamples = useMemo(
    () => environment.teamSamples.filter((sample) => sample.battleType === battleType),
    [battleType, environment.teamSamples],
  );
  const teamSamplePageCount = Math.max(1, Math.ceil(teamSamples.length / TEAM_SAMPLE_BATCH_SIZE));
  const normalizedTeamSampleBatchIndex = teamSampleBatchIndex % teamSamplePageCount;
  const visibleTeamSamples = teamSamples.slice(
    normalizedTeamSampleBatchIndex * TEAM_SAMPLE_BATCH_SIZE,
    normalizedTeamSampleBatchIndex * TEAM_SAMPLE_BATCH_SIZE + TEAM_SAMPLE_BATCH_SIZE,
  );
  const changeBattleType = (nextBattleType: EnvironmentBattleType) => {
    setBattleType(nextBattleType);
    setTeamSampleBatchIndex(0);
  };

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

  const visibleRankings = rankings.slice(0, 4);

  return (
    <div className="space-y-3">
      <section className="relative rounded-xl border border-border bg-gradient-to-b from-elevated to-page p-4 pb-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-textMuted">Environment</p>
            <h2 className="mt-1 text-2xl font-semibold">环境</h2>
            <p className="mt-1 text-xs text-textSecondary">{environment.sourceLabel}</p>
            <p className="mt-0.5 text-xs text-textSecondary">更新于 {formatUpdatedAt(environment.updatedAt)}</p>
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
              rank={index + 1}
              usageBasis={environment.overallUsageBasis}
              onOpen={(pokemonId) => setDetailState({ pokemonId, returnView: 'home' })}
              {...item}
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
              onClick={() => setTeamSampleBatchIndex((current) => (current + 1) % teamSamplePageCount)}
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
