import {
  ArrowLeft,
  Check,
  ChevronDown,
  Dices,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState } from '../components/ui';
import {
  currentRegulation,
  getEnvironmentPokemon,
  type EnvironmentBattleType,
  type EnvironmentTeamSample,
  type RegulationId,
} from '../data/environment';
import { TeamSampleCard } from './TeamSampleCard';
import {
  nextTeamSampleShuffleSeed,
  sampleRegulation,
  shuffleTeamSamples,
  sortTeamSamplesByDate,
  teamSampleCategory,
} from './environmentTeamSamples';

const battleTypeLabels: Record<EnvironmentBattleType, string> = {
  singles: '单打',
  doubles: '双打',
};

type CategoryFilter = 'all' | 'event' | 'ranked';
type RegulationFilter = 'all' | RegulationId;
type DateSort = 'newest' | 'oldest';

const categoryFilters: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'event', label: '赛事' },
  { value: 'ranked', label: '排位高分' },
];

const regulationFilters: Array<{ value: RegulationFilter; label: string }> = [
  { value: 'M-B', label: 'M-B' },
  { value: 'M-A', label: 'M-A' },
  { value: 'all', label: '全部规则' },
];

const matchesTeamSearch = (sample: EnvironmentTeamSample, searchTerm: string) => {
  const query = searchTerm.trim().toLocaleLowerCase();
  if (!query) return true;

  const pokemonNames = sample.slots.flatMap((slot) => {
    const entry = getEnvironmentPokemon(slot.pokemonId);
    return entry ? [entry.chineseName, entry.englishName] : [slot.pokemonId];
  });
  return [sample.title, sample.author, sample.tournament, sample.eventRank, ...pokemonNames]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase().includes(query));
};

export function TeamBrowseView({
  battleType,
  samples,
  onBattleTypeChange,
  onBack,
  onImportSample,
}: {
  battleType: EnvironmentBattleType;
  samples: EnvironmentTeamSample[];
  onBattleTypeChange: (battleType: EnvironmentBattleType) => void;
  onBack: () => void;
  onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [regulation, setRegulation] = useState<RegulationFilter>(currentRegulation);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [withReplicaCode, setWithReplicaCode] = useState(false);
  const [dateSort, setDateSort] = useState<DateSort>('newest');
  const [inspiration, setInspiration] = useState<EnvironmentTeamSample | null>(null);

  const visibleSamples = useMemo(() => {
    const filtered = samples.filter(
      (sample) =>
        sample.battleType === battleType &&
        (regulation === 'all' || sampleRegulation(sample) === regulation) &&
        (category === 'all' || teamSampleCategory(sample) === category) &&
        (!withReplicaCode || Boolean(sample.replicaCode)) &&
        matchesTeamSearch(sample, searchTerm),
    );
    return sortTeamSamplesByDate(filtered, dateSort);
  }, [battleType, category, dateSort, regulation, samples, searchTerm, withReplicaCode]);

  const hasActiveFilters =
    Boolean(searchTerm) || regulation !== currentRegulation || category !== 'all' || withReplicaCode;
  const resetFilters = () => {
    setSearchTerm('');
    setRegulation(currentRegulation);
    setCategory('all');
    setWithReplicaCode(false);
  };

  useEffect(() => {
    if (!inspiration) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspiration(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspiration]);

  const changeBattleType = (nextBattleType: EnvironmentBattleType) => {
    setInspiration(null);
    onBattleTypeChange(nextBattleType);
  };

  const drawInspiration = () => {
    const shuffled = shuffleTeamSamples(visibleSamples, nextTeamSampleShuffleSeed());
    setInspiration(shuffled.find((sample) => sample.id !== inspiration?.id) ?? shuffled[0] ?? null);
  };

  return (
    <div className="space-y-3">
      <button className="inline-flex items-center gap-2 text-sm text-textSecondary" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回环境
      </button>

      <Card className="bg-gradient-to-b from-elevated to-page">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-textMuted">Team Library</p>
            <h2 className="mt-1 text-xl font-semibold">队伍一览</h2>
            <p className="mt-1 text-xs text-textSecondary">搜索公开队伍，或随机找一点构筑灵感。</p>
          </div>
          <div className="grid shrink-0 grid-cols-2 rounded-lg border border-border bg-page p-1 text-sm font-semibold">
            {(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => (
              <button
                key={type}
                className={`whitespace-nowrap rounded-md px-3 py-2 ${battleType === type ? 'bg-accent text-page' : 'text-textSecondary'}`}
                type="button"
                onClick={() => changeBattleType(type)}
              >
                {battleTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>
        <Button className="mt-4 w-full" type="button" onClick={drawInspiration} disabled={visibleSamples.length === 0}>
          <Sparkles aria-hidden="true" size={15} />
          试试灵感
        </Button>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="text-accent" size={16} />
          <h3 className="text-sm font-semibold">筛选队伍</h3>
        </div>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
          <input
            aria-label="搜索队伍或宝可梦"
            className="h-10 w-full rounded-lg border border-border bg-page pl-9 pr-3 text-sm outline-none placeholder:text-textMuted focus:border-accent"
            type="search"
            value={searchTerm}
            placeholder="搜索宝可梦名或队伍名"
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-textMuted">规则</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {regulationFilters.map((filter) => (
              <button
                key={filter.value}
                aria-pressed={regulation === filter.value}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  regulation === filter.value
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-secondary text-textSecondary'
                }`}
                type="button"
                onClick={() => setRegulation(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-textMuted">队伍类别</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {categoryFilters.map((filter) => (
              <button
                key={filter.value}
                aria-pressed={category === filter.value}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  category === filter.value
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-secondary text-textSecondary'
                }`}
                type="button"
                onClick={() => setCategory(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${
            withReplicaCode ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-secondary text-textSecondary'
          }`}>
            <input
              checked={withReplicaCode}
              className="sr-only"
              type="checkbox"
              onChange={(event) => setWithReplicaCode(event.target.checked)}
            />
            <span className={`grid h-4 w-4 place-items-center rounded border ${withReplicaCode ? 'border-accent bg-accent text-page' : 'border-border bg-card'}`}>
              {withReplicaCode && <Check aria-hidden="true" size={11} strokeWidth={3} />}
            </span>
            含队伍码
          </label>
          <label className="relative">
            <span className="sr-only">时间排序</span>
            <select
              aria-label="时间排序"
              className="h-10 w-full appearance-none rounded-lg border border-border bg-secondary px-3 pr-8 text-xs font-semibold text-textSecondary outline-none focus:border-accent"
              value={dateSort}
              onChange={(event) => setDateSort(event.target.value as DateSort)}
            >
              <option value="newest">时间：最新优先</option>
              <option value="oldest">时间：最旧优先</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-textMuted" size={15} />
          </label>
        </div>
      </Card>

      <section className="space-y-2" aria-label="队伍列表">
        <div className="flex items-center justify-between px-1 text-xs text-textSecondary">
          <span>{visibleSamples.length} 支队伍</span>
          {hasActiveFilters && (
            <button className="text-accent" type="button" onClick={resetFilters}>
              清除筛选
            </button>
          )}
        </div>
        {visibleSamples.length > 0 ? (
          visibleSamples.map((sample) => <TeamSampleCard key={sample.id} sample={sample} onImport={onImportSample} />)
        ) : (
          <EmptyState title="没有找到匹配的队伍" />
        )}
      </section>

      {inspiration && (
        <div
          className="fixed inset-0 z-40 mx-auto max-w-[430px]"
          role="dialog"
          aria-label="队伍灵感"
          aria-modal="true"
          data-bottom-nav-lock="true"
        >
          <button className="absolute inset-0 h-full w-full bg-overlay/75" type="button" aria-label="关闭试试灵感" onClick={() => setInspiration(null)} />
          <section className="absolute inset-x-4 top-1/2 max-h-[calc(100vh-2rem)] -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-[0_18px_60px_rgb(0_0_0/0.35)]">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Dices className="text-accent" size={17} />
                <h2 className="text-base font-semibold">试试灵感</h2>
              </div>
              <button
                aria-label="关闭试试灵感"
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-secondary text-textSecondary"
                type="button"
                onClick={() => setInspiration(null)}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <TeamSampleCard
              sample={inspiration}
              onImport={(sample) => {
                setInspiration(null);
                return onImportSample(sample);
              }}
            />
            {visibleSamples.length > 1 && (
              <Button className="mt-2 w-full" variant="ghost" type="button" onClick={drawInspiration}>
                <Dices aria-hidden="true" size={14} />
                再来一队
              </Button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
