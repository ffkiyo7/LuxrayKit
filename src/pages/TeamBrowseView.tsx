import { Dices, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageHeader, SearchField } from '../components/kit';
import {
  getEnvironmentPokemon,
  type EnvironmentBattleType,
  type EnvironmentTeamSample,
} from '../data/environment';
import { PushHeader, RoundIconButton } from './environmentChrome';
import { TeamSampleCard } from './TeamSampleCard';
import {
  nextTeamSampleShuffleSeed,
  shuffleTeamSamples,
  sortTeamSamplesByDate,
  sortTeamSamplesByScore,
} from './environmentTeamSamples';

type SampleFilterId = 'hasMoves' | 'hasSpread' | 'replicaCode';
type SampleSort = 'score' | 'date';

const sampleFilters: Array<{ id: SampleFilterId; label: string; matches: (sample: EnvironmentTeamSample) => boolean }> = [
  { id: 'hasMoves', label: '带配招', matches: (sample) => Boolean(sample.hasMoves) },
  { id: 'hasSpread', label: '带 SP', matches: (sample) => Boolean(sample.hasSpread) },
  { id: 'replicaCode', label: '有队伍码', matches: (sample) => Boolean(sample.replicaCode) },
];

const sortLabels: Record<SampleSort, string> = { score: '按分数', date: '按时间' };

const chineseCount = ['零', '一', '两', '三'];

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

function FilterChip({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`inline-flex h-[34px] shrink-0 items-center rounded-full px-3.5 text-[13px] font-bold ${
        selected ? 'lk-pill-on text-textPrimary' : 'bg-surface text-textSecondary'
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function TeamBrowseView({
  battleType,
  samples,
  subtitle,
  onBack,
  onImportSample,
}: {
  battleType: EnvironmentBattleType;
  samples: EnvironmentTeamSample[];
  subtitle: string;
  onBack: () => void;
  onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState<SampleFilterId[]>([]);
  const [sort, setSort] = useState<SampleSort>('score');
  const [drawnSample, setDrawnSample] = useState<EnvironmentTeamSample | null>(null);

  const battleSamples = useMemo(
    () => samples.filter((sample) => sample.battleType === battleType),
    [battleType, samples],
  );

  const applyFilters = useCallback(
    (filterIds: SampleFilterId[]) =>
      battleSamples.filter(
        (sample) =>
          filterIds.every((id) => sampleFilters.find((filter) => filter.id === id)!.matches(sample)) &&
          matchesTeamSearch(sample, searchTerm),
      ),
    [battleSamples, searchTerm],
  );

  const visibleSamples = useMemo(() => {
    const filtered = applyFilters(activeFilters);
    return sort === 'score' ? sortTeamSamplesByScore(filtered) : sortTeamSamplesByDate(filtered, 'newest');
  }, [activeFilters, applyFilters, sort]);

  useEffect(() => {
    if (!drawnSample) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawnSample(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawnSample]);

  // Changing the battle type re-scopes the whole list, so a drawn sample from the old one
  // would no longer be reachable in the list behind the dialog.
  useEffect(() => {
    setDrawnSample(null);
  }, [battleType]);

  const toggleFilter = (id: SampleFilterId) => {
    setActiveFilters((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const resetFilters = () => {
    setActiveFilters([]);
    setSearchTerm('');
  };

  const drawSample = () => {
    const shuffled = shuffleTeamSamples(visibleSamples, nextTeamSampleShuffleSeed());
    setDrawnSample(shuffled.find((sample) => sample.id !== drawnSample?.id) ?? shuffled[0] ?? null);
  };

  const dropHints = activeFilters.map((id) => {
    const filter = sampleFilters.find((candidate) => candidate.id === id)!;
    return `去掉「${filter.label}」还有 ${applyFilters(activeFilters.filter((value) => value !== id)).length} 支`;
  });

  return (
    <div>
      <PushHeader
        onBack={onBack}
        trailing={
          <div className="flex items-center gap-2">
            <RoundIconButton label="随机一队" onClick={drawSample}>
              <span className="text-data">
                <Dices size={19} />
              </span>
            </RoundIconButton>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-[13px] text-[13px] font-bold text-textLabel"
              type="button"
              onClick={() => setSort((current) => (current === 'score' ? 'date' : 'score'))}
            >
              <SlidersHorizontal size={15} />
              {sortLabels[sort]}
            </button>
          </div>
        }
      />
      <PageHeader className="px-6 pt-3.5" subtitle={subtitle} title="上位构筑" />
      <div className="px-6 pt-3.5">
        <SearchField
          label="搜索队伍或宝可梦"
          placeholder="队伍名、宝可梦、作者"
          value={searchTerm}
          onChange={setSearchTerm}
        />
      </div>

      <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto px-6">
        <FilterChip selected={activeFilters.length === 0} onClick={() => setActiveFilters([])}>
          全部 {battleSamples.length}
        </FilterChip>
        {sampleFilters.map((filter) => (
          <FilterChip
            key={filter.id}
            selected={activeFilters.includes(filter.id)}
            onClick={() => toggleFilter(filter.id)}
          >
            {filter.label} {battleSamples.filter(filter.matches).length}
          </FilterChip>
        ))}
      </div>

      {visibleSamples.length > 0 ? (
        <div className="mt-5 flex flex-col gap-3.5 px-6" role="region" aria-label="上位构筑列表">
          {visibleSamples.map((sample) => (
            <TeamSampleCard key={sample.id} sample={sample} onImport={onImportSample} />
          ))}
        </div>
      ) : (
        <div className="px-6 pt-5" role="region" aria-label="上位构筑列表">
          <p className="text-[13px] font-semibold text-textSecondary">
            {activeFilters.length >= 2 ? `${chineseCount[activeFilters.length] ?? activeFilters.length}个条件同时满足 · ` : ''}
            0 支
          </p>
          <h2 className="mt-6 text-[20px] font-extrabold leading-7 tracking-[-0.01em]">这一季没有同时满足的样本</h2>
          {dropHints.length > 0 && (
            <p className="mt-2 text-[13px] font-semibold leading-5 text-textSecondary">{dropHints.join('；')}。</p>
          )}
          <div className="mt-[18px] flex flex-wrap gap-2">
            <button
              className="inline-flex h-[34px] items-center rounded-full bg-surface px-3.5 text-[13px] font-bold text-textPrimary"
              type="button"
              onClick={resetFilters}
            >
              重置筛选
            </button>
            {activeFilters.length >= 2 && (
              <button
                className="inline-flex h-[34px] items-center rounded-full bg-surface px-3.5 text-[13px] font-bold text-textLabel"
                type="button"
                onClick={() => setActiveFilters([activeFilters[0]])}
              >
                只留{sampleFilters.find((filter) => filter.id === activeFilters[0])!.label}
              </button>
            )}
          </div>
        </div>
      )}

      {drawnSample && (
        <div
          aria-label="随机一队"
          aria-modal="true"
          className="fixed inset-0 z-50 mx-auto max-w-[430px]"
          data-bottom-nav-lock="true"
          role="dialog"
        >
          <button
            aria-label="关闭随机一队"
            className="lk-sheet-overlay absolute inset-0 h-full w-full"
            type="button"
            onClick={() => setDrawnSample(null)}
          />
          <section className="lk-sheet absolute inset-x-4 top-1/2 max-h-[calc(100vh-2rem)] -translate-y-1/2 overflow-y-auto rounded-[20px] p-[18px]">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex text-data">
                <Dices size={19} />
              </span>
              <h2 className="flex-1 text-[17px] font-extrabold leading-6 tracking-[-0.01em]">随机一队</h2>
              <button
                aria-label="关闭随机一队"
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-btn1 text-textLabel"
                type="button"
                onClick={() => setDrawnSample(null)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-4">
              <TeamSampleCard
                sample={drawnSample}
                variant="draw"
                onDrawAgain={drawSample}
                onImport={(sample) => {
                  setDrawnSample(null);
                  return onImportSample(sample);
                }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
