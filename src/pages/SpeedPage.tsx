import { Minus, Plus, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { pokemon, speedBenchmarks } from '../data';
import { buildTeamBenchmarks, calculateSpeedWithMechanismGate } from '../lib/calculations';
import { findBattleForm } from '../lib/pokemonForms';
import { MAX_STAT_POINTS_PER_STAT } from '../lib/statPoints';
import { useAppStore } from '../state/AppContext';
import type { SpeedBenchmark, Team } from '../types';
import { Button, Card, Chip, PokemonAvatar, TypeBadge } from '../components/ui';

type BenchmarkFilter = 'team' | 'favorites' | 'preset' | 'all';

const filterLabels: Array<{ id: BenchmarkFilter; label: string }> = [
  { id: 'team', label: '当前队伍' },
  { id: 'favorites', label: '收藏' },
  { id: 'preset', label: '常见' },
  { id: 'all', label: '全部' },
];

function BenchmarkDetailSheet({
  benchmark,
  favorite,
  onClose,
  onToggleFavorite,
}: {
  benchmark: SpeedBenchmark;
  favorite: boolean;
  onClose: () => void;
  onToggleFavorite: (benchmarkId: string) => void;
}) {
  const entry = pokemon.find((candidate) => candidate.id === benchmark.pokemonId);
  const form = findBattleForm(benchmark.pokemonId, benchmark.formId);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{benchmark.name}</h3>
          <p className="text-xs text-textSecondary">{benchmark.source}</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Card className="bg-secondary">
          <p className="text-[11px] text-textSecondary">Pokemon</p>
          <p className="font-semibold">{form?.chineseName ?? entry?.chineseName ?? benchmark.pokemonId}</p>
        </Card>
        <Card className="bg-secondary">
          <p className="text-[11px] text-textSecondary">最终速度</p>
          <p className="font-semibold text-accent">{benchmark.finalSpeed}</p>
        </Card>
        <Card className="bg-secondary">
          <p className="text-[11px] text-textSecondary">性格</p>
          <p className="font-semibold">{benchmark.nature}</p>
        </Card>
        <Card className="bg-secondary">
          <p className="text-[11px] text-textSecondary">速度投入</p>
          <p className="font-semibold">{benchmark.speedStatPoints}</p>
        </Card>
        <Card className="bg-secondary">
          <p className="text-[11px] text-textSecondary">道具 / 状态</p>
          <p className="font-semibold">{benchmark.itemOrStatus}</p>
        </Card>
        <Card className="bg-secondary">
          <p className="text-[11px] text-textSecondary">类型</p>
          <p className="font-semibold">{benchmark.benchmarkType}</p>
        </Card>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {benchmark.tags.map((tag) => (
          <Chip key={tag}>{tag}</Chip>
        ))}
      </div>
      <p className="mt-3 rounded-lg bg-reviewBg p-2 text-xs text-warning">{benchmark.notes}</p>
      <p className="mt-2 text-[11px] text-textMuted">数据版本：{benchmark.dataVersionId}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
        <Button onClick={() => onToggleFavorite(benchmark.id)}>
          <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
          {favorite ? '取消收藏' : '收藏'}
        </Button>
      </div>
    </div>
  );
}

export function SpeedPage({
  selectedPokemonId,
  onSelectPokemon,
  activeTeam,
}: {
  selectedPokemonId: string;
  onSelectPokemon: (pokemonId: string) => void;
  activeTeam?: Team;
}) {
  const { preferences, toggleFavoriteBenchmark } = useAppStore();
  const [filter, setFilter] = useState<BenchmarkFilter>('preset');
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<string | null>(null);
  const [speedStatPoints, setSpeedStatPoints] = useState(MAX_STAT_POINTS_PER_STAT);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const selected = pokemon.find((entry) => entry.id === selectedPokemonId) ?? pokemon[0];
  const selectedForm = findBattleForm(selected.id, selectedFormId) ?? findBattleForm(selected.id, selected.id);
  const currentSpeedResult = calculateSpeedWithMechanismGate({
    baseSpeed: selectedForm?.baseStats.speed ?? selected.baseStats.speed,
    statPoints: speedStatPoints,
    level: 50,
    nature: '爽朗',
      mechanismStatus: 'confirmed',
  });
  const currentSpeed = currentSpeedResult.status === 'confirmed' ? currentSpeedResult.finalSpeed : 0;
  const currentSpeedLabel = currentSpeedResult.status === 'confirmed' ? String(currentSpeedResult.finalSpeed) : '待确认';
  const favoriteIds = preferences.favoriteBenchmarkIds;
  const teamBenchmarks = activeTeam ? buildTeamBenchmarks(activeTeam) : [];
  const allBenchmarks = useMemo(() => [...speedBenchmarks, ...teamBenchmarks], [teamBenchmarks]);
  const filteredBenchmarks = useMemo(() => {
    switch (filter) {
      case 'team':
        return teamBenchmarks;
      case 'favorites':
        return allBenchmarks.filter((benchmark) => favoriteIds.includes(benchmark.id));
      case 'all':
        return allBenchmarks;
      case 'preset':
      default:
        return speedBenchmarks;
    }
  }, [allBenchmarks, favoriteIds, filter, teamBenchmarks]);
  const benchmarks = filteredBenchmarks.slice(0, 12);
  const selectedBenchmark = allBenchmarks.find((benchmark) => benchmark.id === selectedBenchmarkId) ?? null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">速度线</h2>
        <p className="text-xs text-textSecondary">默认最多 12 个 benchmark · Champions SP 公式已启用</p>
      </div>

      <Card>
        <select
          className="mb-3 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none"
          value={selected.id}
          onChange={(event) => {
            onSelectPokemon(event.target.value);
            setSelectedFormId(undefined);
          }}
        >
          {pokemon.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.chineseName}
            </option>
          ))}
        </select>
        {selected.megaForms.length > 0 && (
          <select
            className="mb-3 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none"
            value={selectedForm?.id ?? selected.id}
            onChange={(event) => setSelectedFormId(event.target.value)}
          >
            <option value={selected.id}>原始形态</option>
            {selected.megaForms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.chineseName}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          <Chip active>爽朗(+速)</Chip>
          <Chip active>SP:{speedStatPoints}</Chip>
          {selectedForm?.isMega && <Chip>Mega 形态</Chip>}
          <Chip>道具 ▾</Chip>
          <Chip>顺风</Chip>
        </div>
      </Card>

      <Card className="bg-secondary">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">速度 SP</p>
            <p className="text-xs text-textSecondary">手动调整 0-32，基准默认不代表推荐分配</p>
          </div>
          <span className="text-lg font-bold text-accent">{speedStatPoints}</span>
        </div>
        <div className="grid grid-cols-[32px_1fr_32px] items-center gap-2">
          <button
            aria-label="速度 SP -1"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
            disabled={speedStatPoints <= 0}
            type="button"
            onClick={() => setSpeedStatPoints((value) => Math.max(0, value - 1))}
          >
            <Minus size={14} />
          </button>
          <input
            aria-label="速度 SP"
            className="h-8 w-full accent-accent"
            max={MAX_STAT_POINTS_PER_STAT}
            min={0}
            type="range"
            value={speedStatPoints}
            onChange={(event) => setSpeedStatPoints(Number(event.target.value))}
          />
          <button
            aria-label="速度 SP +1"
            className="grid h-8 w-8 place-items-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
            disabled={speedStatPoints >= MAX_STAT_POINTS_PER_STAT}
            type="button"
            onClick={() => setSpeedStatPoints((value) => Math.min(MAX_STAT_POINTS_PER_STAT, value + 1))}
          >
            <Plus size={14} />
          </button>
        </div>
      </Card>

      <Card>
        <p className="text-[11px] text-textSecondary">最终速度</p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[26px] font-bold text-textPrimary">{currentSpeedLabel}</p>
            <p className="text-xs text-textSecondary">基础速度 {selectedForm?.baseStats.speed ?? selected.baseStats.speed} · 性格×1.1 · SP+{speedStatPoints}</p>
          </div>
          <div className="flex gap-1">
            {(selectedForm?.types ?? selected.types).map((type) => (
              <TypeBadge key={type} type={type} />
            ))}
          </div>
        </div>
      </Card>

      <div className="flex gap-4 border-b border-divider text-sm">
        {filterLabels.map(({ id, label }) => (
          <button key={id} className={`pb-2 ${filter === id ? 'border-b-2 border-accent text-accent' : 'text-textMuted'}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <Card className="speed-grid min-h-[220px] overflow-hidden bg-page">
        <div className="relative h-[170px]">
          <div className="absolute inset-x-0 top-[86px] h-px bg-border" />
          {[50, 100, 150, 200, 250].map((tick) => (
            <span key={tick} className="absolute top-[96px] -translate-x-1/2 text-[10px] text-textMuted" style={{ left: `${(tick / 250) * 100}%` }}>
              {tick}
            </span>
          ))}
          <div className="absolute top-6 -translate-x-1/2 text-center" style={{ left: `${Math.min(96, Math.max(4, (currentSpeed / 250) * 100))}%` }}>
            <div className="mx-auto">
              <PokemonAvatar iconRef={selectedForm?.iconRef ?? selected.iconRef} label={selectedForm?.chineseName ?? selected.chineseName} size="xs" />
            </div>
            <div className="mx-auto h-12 w-px bg-accent/70" />
            <div className="mx-auto h-4 w-4 rotate-45 bg-accent" />
            <p className="mt-2 text-xs font-bold text-accent">{currentSpeedLabel}</p>
          </div>
          {benchmarks.map((benchmark, index) => {
            const left = Math.min(96, Math.max(4, (benchmark.finalSpeed / 250) * 100));
            const faster = currentSpeed > benchmark.finalSpeed;
            const top = faster ? 58 - (index % 3) * 16 : 116 + (index % 3) * 14;
            return (
              <button
                key={benchmark.id}
                className="absolute -translate-x-1/2"
                style={{ left: `${left}%`, top }}
                title={`${benchmark.name}：${benchmark.notes}`}
                aria-label={`${benchmark.name} benchmark`}
                onClick={() => setSelectedBenchmarkId(benchmark.id)}
              >
                <span className={`block h-2.5 w-2.5 rounded-full ring-2 ring-page ${faster ? 'bg-success' : 'bg-danger'}`} />
              </button>
            );
          })}
        </div>
        <div className="flex justify-center gap-3 text-[11px] text-textMuted">
          <span className="text-success">● 我更快</span>
          <span className="text-danger">● 我更慢</span>
          <span className="text-accent">◆ 当前</span>
        </div>
      </Card>

      <div className="space-y-2">
        {benchmarks.length === 0 && <Card className="bg-secondary text-center text-sm text-textSecondary">当前筛选下暂无 benchmark</Card>}
        {benchmarks.map((benchmark) => {
          const favorite = favoriteIds.includes(benchmark.id);
          return (
            <div
              key={benchmark.id}
              className="w-full text-left"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedBenchmarkId(benchmark.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setSelectedBenchmarkId(benchmark.id);
              }}
            >
              <Card className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{benchmark.name}</h3>
                  <p className="text-xs text-textSecondary">最终速度 {benchmark.finalSpeed} · {benchmark.source}</p>
                  <div className="mt-1 flex gap-1">
                    {benchmark.tags.slice(0, 2).map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))}
                  </div>
                </div>
                <Button
                  variant={favorite ? 'primary' : 'ghost'}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavoriteBenchmark(benchmark.id);
                  }}
                >
                  <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
                  收藏
                </Button>
              </Card>
            </div>
          );
        })}
      </div>
      {selectedBenchmark && (
        <BenchmarkDetailSheet
          benchmark={selectedBenchmark}
          favorite={favoriteIds.includes(selectedBenchmark.id)}
          onClose={() => setSelectedBenchmarkId(null)}
          onToggleFavorite={(benchmarkId) => toggleFavoriteBenchmark(benchmarkId)}
        />
      )}
    </div>
  );
}
