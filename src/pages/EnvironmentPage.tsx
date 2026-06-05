import { ArrowLeft, BarChart3, ExternalLink, Import, List, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  environmentDataStatusLabel,
  environmentPokemonUsage,
  environmentSourceLabel,
  environmentTeamSamples,
  environmentUpdatedAt,
  getEnvironmentItem,
  getEnvironmentMove,
  getEnvironmentPokemon,
  type EnvironmentBattleType,
  type EnvironmentPokemonUsage,
  type EnvironmentTeamSample,
} from '../data/environment';
import { Button, Card, PokemonAvatar, TypeBadge } from '../components/ui';

const battleTypeLabels: Record<EnvironmentBattleType, string> = {
  singles: '单打',
  doubles: '双打',
};

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

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
  onOpen,
}: {
  pokemonId: string;
  usageRate: number;
  teamCount: number;
  rank: number;
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
        <span className="block text-lg font-semibold text-accent">{usageRate.toFixed(1)}%</span>
        <span className="text-[11px] text-textMuted">{teamCount} 队</span>
      </span>
    </button>
  );
}

function TeamSampleCard({ sample, onImport }: { sample: EnvironmentTeamSample; onImport: (sample: EnvironmentTeamSample) => Promise<void> | void }) {
  const [importing, setImporting] = useState(false);
  const visibleSlots = sample.slots.map((slot) => getEnvironmentPokemon(slot.pokemonId)).filter(Boolean);
  const sampleBadge = sample.dataKind === 'external-snapshot' ? '真实样本' : '开发样例';

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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{sample.title}</h3>
          <p className="mt-1 text-xs text-textSecondary">{environmentDataStatusLabel} · {battleTypeLabels[sample.battleType]}</p>
        </div>
        <span className="rounded-md bg-reviewBg px-2 py-1 text-[11px] font-semibold text-warning">{sampleBadge}</span>
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
  battleType,
  pokemonId,
  onBack,
  onImportSample,
}: {
  battleType: EnvironmentBattleType;
  pokemonId: string;
  onBack: () => void;
  onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const [expandedSection, setExpandedSection] = useState<'moves' | 'items' | 'teammates' | null>(null);
  const usage = environmentPokemonUsage[battleType].find((item) => item.pokemonId === pokemonId);
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
  const relatedSamples = environmentTeamSamples.filter(
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
              <p className="text-2xl font-semibold text-accent">{usage.usageRate.toFixed(1)}%</p>
              <p className="text-[11px] text-textMuted">{usage.teamCount} 队</p>
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
                <p className="mt-0.5 text-[10px] font-semibold text-accent">{stat.usageRate.toFixed(1)}%</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {relatedSamples.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Users size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">相关样例队伍</h3>
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
  battleType,
  rankings,
  onBattleTypeChange,
  onBack,
  onOpenPokemon,
}: {
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
            <p className="mt-1 text-xs text-textSecondary">{environmentSourceLabel}</p>
            <p className="mt-0.5 text-xs text-textSecondary">更新于 {formatUpdatedAt(environmentUpdatedAt)}</p>
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
            <RankingRow key={item.pokemonId} rank={index + 1} onOpen={onOpenPokemon} {...item} />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function EnvironmentPage({ onImportSample }: { onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void }) {
  const [battleType, setBattleType] = useState<EnvironmentBattleType>('singles');
  const [view, setView] = useState<'home' | 'ranking'>('home');
  const [detailState, setDetailState] = useState<{ pokemonId: string; returnView: 'home' | 'ranking' } | null>(null);
  const rankings = useMemo(() => environmentPokemonUsage[battleType], [battleType]);

  if (detailState) {
    return (
      <PokemonEnvironmentDetail
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
        battleType={battleType}
        rankings={rankings}
        onBattleTypeChange={setBattleType}
        onBack={() => setView('home')}
        onOpenPokemon={(pokemonId) => setDetailState({ pokemonId, returnView: 'ranking' })}
      />
    );
  }

  const visibleRankings = rankings.slice(0, 4);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-border bg-gradient-to-b from-elevated to-page p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-textMuted">Environment</p>
            <h2 className="mt-1 text-2xl font-semibold">环境</h2>
            <p className="mt-1 text-xs text-textSecondary">{environmentSourceLabel}</p>
            <p className="mt-0.5 text-xs text-textSecondary">更新于 {formatUpdatedAt(environmentUpdatedAt)}</p>
          </div>
          <div className="grid grid-cols-2 rounded-lg border border-border bg-page p-1 text-sm font-semibold">
            {(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => (
              <button
                key={type}
                className={`rounded-md px-3 py-2 ${battleType === type ? 'bg-accent text-page' : 'text-textSecondary'}`}
                type="button"
                onClick={() => setBattleType(type)}
              >
                {battleTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>
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
            <RankingRow key={item.pokemonId} rank={index + 1} onOpen={(pokemonId) => setDetailState({ pokemonId, returnView: 'home' })} {...item} />
          ))}
        </div>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Users size={16} className="text-accent" />
          <h3 className="text-sm font-semibold">样例队伍</h3>
        </div>
        {environmentTeamSamples
          .filter((sample) => sample.battleType === battleType)
          .map((sample) => (
            <TeamSampleCard key={sample.id} sample={sample} onImport={onImportSample} />
          ))}
      </section>
    </div>
  );
}
