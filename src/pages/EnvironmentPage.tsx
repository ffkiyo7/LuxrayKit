import {
  ChevronDown,
  ChevronRight,
  Clock,
  CloudOff,
  ExternalLink,
  Info,
  Library,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  currentRegulation as catalogRegulation,
  getEnvironmentPokemon,
  loadEnvironmentMoves,
  type EnvironmentBattleType,
  type EnvironmentPokemonUsage,
  type EnvironmentState,
  type EnvironmentTeamSample,
} from '../data/environment';
import { currentRegulation as scheduledRegulation } from '../data/schedule';
import { currentRuleSet } from '../data';
import { isUnresolvedPokemonId } from '../lib/environmentDataset';
import {
  describeSeasonRankDelta,
  resolveSeasonRankDelta,
  selectSeasonRanks,
  type SeasonRankDelta,
} from '../lib/seasonRankDelta';
import { useHashRoute } from '../hooks/useHashRoute';
import { auraStyle, KitButton, PageHeader, SearchField, SegmentedTabs, Sprite, TypeDot } from '../components/kit';
import { typeLabels } from '../components/ui';
import { TeamBrowseView } from './TeamBrowseView';
import { sortTeamSamplesByDate } from './environmentTeamSamples';
import {
  battleTypeLabels,
  environmentSubtitle,
  formatUpdatedAt,
  PushHeader,
  SectionHeading,
} from './environmentChrome';
import { teamSampleMeta, teamSampleTitle, resolveSampleSlots } from './TeamSampleCard';
import type { Move } from '../types';

// The detail page builds a team member (「按热门配置加入队伍」), which reaches the move catalog;
// loading it on demand keeps that chunk out of the #/env first paint.
const EnvironmentPokemonDetail = lazy(() =>
  import('./EnvironmentPokemonDetail').then((module) => ({ default: module.EnvironmentPokemonDetail })),
);

const POKEDB_SITE_URL = 'https://champs.pokedb.tokyo/';
const HOME_RANKING_ROWS = 5;
const HOME_TEAM_SAMPLES = 6;
const RANKING_PAGE_SIZE = 60;
// Seen-once flag for the 数据口径 sheet (01-06). Deliberately browser storage rather than an
// IndexedDB preference: it is a one-shot UI acknowledgement with no migration story.
const METHODOLOGY_SEEN_KEY = 'luxraykit.env.methodologySeen';

const RANKING_TIERS = [
  { label: '第一梯队', minRank: 1, maxRank: 5 },
  { label: '第二梯队', minRank: 6, maxRank: 20 },
  { label: '第三梯队', minRank: 21, maxRank: 60 },
  { label: '第四梯队', minRank: 61, maxRank: Number.POSITIVE_INFINITY },
] as const;

/**
 * The move catalog is 55 KB gzip and only the Pokémon detail screen needs it, so it is kept out
 * of the environment first paint (see `loadEnvironmentMoves`) and requested when a detail
 * mounts. Until it resolves the 常用招式 rows render as skeletons (N01-15).
 */
function useEnvironmentMoveLookup(enabled: boolean) {
  const [movesById, setMovesById] = useState<Map<string, Move>>();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadEnvironmentMoves()
      .then((moves) => {
        if (active) setMovesById(new Map(moves.map((move) => [move.id, move])));
      })
      .catch((error) => {
        console.error('Failed to load the move catalog; move names stay hidden.', error);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return movesById;
}

const readMethodologySeen = () => {
  try {
    return window.localStorage.getItem(METHODOLOGY_SEEN_KEY) === '1';
  } catch {
    // Private mode / blocked storage: show nothing rather than the sheet on every visit.
    return true;
  }
};

const writeMethodologySeen = () => {
  try {
    window.localStorage.setItem(METHODOLOGY_SEEN_KEY, '1');
  } catch {
    // Nothing to do — the sheet simply reappears next launch.
  }
};

// ── Notices (N01-14 / 01-09) ──

function EnvironmentNotice({
  icon,
  iconClassName,
  title,
  description,
  trailing,
  action,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description?: string;
  /** The right-aligned value on 数据最新's single-line variant. */
  trailing?: string;
  action?: { label: string; icon: ReactNode; onClick: () => void };
}) {
  return (
    <div className="lk-env-note box-border flex gap-2.5 rounded-[14px] p-3.5" role="status">
      <span className={`mt-px shrink-0 ${iconClassName}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 text-sm font-extrabold tracking-[-0.01em]">{title}</span>
          {trailing && <span className="shrink-0 text-xs font-semibold tabular-nums text-textSecondary">{trailing}</span>}
        </span>
        {description && (
          <span className="mt-1 block text-xs font-semibold leading-[18px] text-textSecondary">{description}</span>
        )}
        {action && (
          <button
            className="mt-3 inline-flex h-11 items-center gap-[7px] rounded-[14px] bg-surface px-4 text-sm font-bold text-textLabel"
            type="button"
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * Regulations rotate on an officially announced date (`schedule.ts`); the matching catalog is
 * hand-authored and lands later (`currentRuleSet` → `currentRegulation`). While the two disagree
 * the app is showing the *previous* regulation's Pokédex, so say it plainly instead of letting it
 * pass as current. Both regulation labels are derived, never hard-coded — this notice must not
 * need editing at the next rollover. Renders nothing while catalog and schedule agree.
 */
export function CatalogRegulationLagNotice({ now = new Date() }: { now?: Date }) {
  const scheduled = scheduledRegulation(now).id;
  if (scheduled === catalogRegulation) return null;

  return (
    <EnvironmentNotice
      description={`榜单已经是 ${scheduled} 的，本机图鉴仍是 ${catalogRegulation} 的资料。`}
      icon={<Library size={18} />}
      iconClassName="text-fnAmber"
      title={`规则已切换到 ${scheduled}，图鉴还在补`}
    />
  );
}

function EnvironmentStatusNotices({
  environment,
  offline,
  onRetry,
  onOpenMethodology,
}: {
  environment: EnvironmentState;
  offline: boolean;
  onRetry: () => void;
  onOpenMethodology: () => void;
}) {
  const updatedAt = formatUpdatedAt(environment.sourceUpdatedAt);
  const notices: ReactNode[] = [];

  if (offline) {
    notices.push(
      <EnvironmentNotice
        key="offline"
        action={{ label: '重试', icon: <RefreshCw size={15} />, onClick: onRetry }}
        description={`${updatedAt} 的数据。队伍编辑、伤害计算、速度线照常可用。`}
        icon={<CloudOff size={18} />}
        iconClassName="text-textLabel"
        title="离线中，看的是本地数据"
      />,
    );
  } else if (environment.sourceStatus === 'degraded') {
    notices.push(
      <EnvironmentNotice
        key="degraded"
        action={{ label: '看数据口径', icon: <Info size={15} />, onClick: onOpenMethodology }}
        description="这次更新已丢弃，显示的是上一份能用的数据。"
        icon={<TriangleAlert size={18} />}
        iconClassName="text-danger"
        title="数据源异常"
      />,
    );
  } else if (environment.freshness === 'stale') {
    notices.push(
      <EnvironmentNotice
        key="stale"
        action={{ label: '重试更新', icon: <RefreshCw size={15} />, onClick: onRetry }}
        description={`上次成功更新是 ${updatedAt}。`}
        icon={<Clock size={18} />}
        iconClassName="text-textLabel"
        title="可能过期"
      />,
    );
  }

  const catalogLags = scheduledRegulation(new Date()).id !== catalogRegulation;
  if (catalogLags) notices.push(<CatalogRegulationLagNotice key="regulation-lag" />);
  // 01-01 has no notice strip at all when everything is current, so the wrapper must not leave
  // its own padding behind.
  if (notices.length === 0) return null;

  return <div className="flex flex-col gap-3 px-6 pb-1">{notices}</div>;
}

// ── Ranking rows (01-01 / 01-03 / N01-11) ──

const rankDeltaTone = {
  new: 'text-fnBlue',
  up: 'text-success',
  down: 'text-danger',
  hold: 'text-textSecondary',
} as const;

const rankDeltaText = (delta: SeasonRankDelta) => {
  if (delta.kind === 'new') return 'NEW';
  if (delta.kind === 'hold') return '–';
  return `${delta.kind === 'up' ? '↑' : '↓'}${delta.places}`;
};

function RankDeltaCell({ delta, previousSeasonLabel }: { delta: SeasonRankDelta; previousSeasonLabel: string }) {
  return (
    <span
      aria-label={describeSeasonRankDelta(delta, previousSeasonLabel)}
      className={`min-w-[34px] shrink-0 text-right text-[13px] font-bold tabular-nums ${rankDeltaTone[delta.kind]}`}
    >
      {rankDeltaText(delta)}
    </span>
  );
}

/**
 * A ranking row whose Pokemon is not in the local catalog yet (new regulation, catalog not
 * authored). It must still occupy its rank — dropping it would renumber everything below — but
 * there is nothing to show on a detail page, so it is a static row rather than a button.
 */
function UnresolvedRankingRow({ usage, rank, divider }: { usage: EnvironmentPokemonUsage; rank: number; divider: boolean }) {
  const label = usage.displayName?.trim() || usage.pokemonId;

  return (
    <div className={`flex h-[68px] items-center gap-3.5 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}>
      <span className="w-[26px] shrink-0 text-right text-[20px] font-extrabold tabular-nums text-textSecondary">{rank}</span>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sunken text-btnDisabledInk">?</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-bold tracking-[-0.01em] text-textSecondary">{label}</span>
        <span className="mt-1 block text-xs font-semibold text-textLabel">图鉴待补 · 本机没有它的资料</span>
      </span>
    </div>
  );
}

function RankingRow({
  usage,
  rank,
  divider,
  previousRanks,
  previousSeasonLabel,
  onOpen,
}: {
  usage: EnvironmentPokemonUsage;
  rank: number;
  divider: boolean;
  previousRanks?: Record<string, number>;
  previousSeasonLabel?: string;
  onOpen: (pokemonId: string) => void;
}) {
  const pokemonId = usage.pokemonId;
  if (usage.unresolved || isUnresolvedPokemonId(pokemonId)) {
    return <UnresolvedRankingRow divider={divider} rank={rank} usage={usage} />;
  }
  const entry = getEnvironmentPokemon(pokemonId);
  if (!entry) return null;

  const delta = resolveSeasonRankDelta(rank, previousRanks, pokemonId);

  return (
    <button
      className={`flex h-[68px] w-full items-center gap-3.5 text-left ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      type="button"
      onClick={() => onOpen(pokemonId)}
    >
      <span className="w-[26px] shrink-0 text-right text-[20px] font-extrabold tabular-nums">{rank}</span>
      <Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-bold tracking-[-0.01em]">{entry.chineseName}</span>
        <span className="mt-1 flex items-center gap-2.5 text-xs font-semibold text-textSecondary">
          {entry.types.map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <TypeDot size={7} type={type} />
              {typeLabels[type]}
            </span>
          ))}
        </span>
      </span>
      {delta && previousSeasonLabel && <RankDeltaCell delta={delta} previousSeasonLabel={previousSeasonLabel} />}
      <span className="shrink-0 text-chevron">
        <ChevronRight size={18} />
      </span>
    </button>
  );
}

function RankingList({
  rows,
  previousRanks,
  previousSeasonLabel,
  onOpenPokemon,
}: {
  rows: Array<{ item: EnvironmentPokemonUsage; rank: number }>;
  previousRanks?: Record<string, number>;
  previousSeasonLabel?: string;
  onOpenPokemon: (pokemonId: string) => void;
}) {
  return (
    <div>
      {rows.map(({ item, rank }, index) => (
        <RankingRow
          key={item.pokemonId}
          divider={index < rows.length - 1}
          previousRanks={previousRanks}
          previousSeasonLabel={previousSeasonLabel}
          rank={rank}
          usage={item}
          onOpen={onOpenPokemon}
        />
      ))}
    </div>
  );
}

// ── Full ranking (01-03 / N01-11 / N01-12 / N01-13) ──

function FullRankingPage({
  environment,
  battleType,
  rankings,
  onBattleTypeChange,
  onBack,
  onOpenPokemon,
  onOpenRule,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
  rankings: EnvironmentPokemonUsage[];
  onBattleTypeChange: (battleType: EnvironmentBattleType) => void;
  onBack: () => void;
  onOpenPokemon: (pokemonId: string) => void;
  onOpenRule?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(RANKING_PAGE_SIZE);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const rows = useMemo(() => rankings.map((item, index) => ({ item, rank: index + 1 })), [rankings]);
  const filteredRows = useMemo(
    () =>
      rows.filter(({ item }) => {
        if (!normalizedQuery) return true;
        const entry = getEnvironmentPokemon(item.pokemonId);
        if (entry) {
          return (
            entry.chineseName.toLocaleLowerCase().includes(normalizedQuery) ||
            entry.englishName.toLocaleLowerCase().includes(normalizedQuery)
          );
        }
        // Placeholder rows have no catalog entry; the source-page name is all we can match on.
        return Boolean(item.displayName?.toLocaleLowerCase().includes(normalizedQuery));
      }),
    [normalizedQuery, rows],
  );
  const previousRanks = useMemo(
    () => selectSeasonRanks(environment.previousSeason, battleType),
    [environment.previousSeason, battleType],
  );

  useEffect(() => {
    setVisibleCount(RANKING_PAGE_SIZE);
  }, [battleType]);

  const visibleRows = rows.slice(0, visibleCount);

  return (
    <div>
      <PushHeader onBack={onBack} />
      <PageHeader className="px-6 pt-3.5" subtitle={environmentSubtitle(environment)} title="使用排行" />
      <div className="px-6 pt-4">
        <SearchField
          label="搜索宝可梦"
          placeholder="搜索中文名或英文名"
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>
      <div className="px-6 pt-2.5">
        <SegmentedTabs
          options={(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => ({
            id: type,
            label: battleTypeLabels[type],
          }))}
          value={battleType}
          onChange={onBattleTypeChange}
        />
      </div>

      {normalizedQuery ? (
        <div className="px-6 pt-2.5">
          <p className="text-[13px] font-semibold text-textSecondary">
            「{searchQuery.trim()}」· {filteredRows.length} 个结果
          </p>
          {filteredRows.length > 0 ? (
            <div className="mt-3.5">
              <RankingList
                previousRanks={previousRanks}
                previousSeasonLabel={environment.previousSeason?.season}
                rows={filteredRows}
                onOpenPokemon={onOpenPokemon}
              />
            </div>
          ) : (
            <div className="pt-5">
              <h2 className="text-[20px] font-extrabold leading-7 tracking-[-0.01em]">榜上没有这只</h2>
              <p className="mt-2 text-[13px] font-semibold leading-5 text-textSecondary">
                「{searchQuery.trim()}」不在 {catalogRegulation} 规则内，榜单里没有它。
              </p>
              <div className="mt-[18px] flex flex-wrap gap-2">
                <button
                  className="inline-flex h-[34px] items-center rounded-full bg-surface px-3.5 text-[13px] font-bold text-textLabel"
                  type="button"
                  onClick={() => setSearchQuery('')}
                >
                  显示全部 {rankings.length} 只
                </button>
                {onOpenRule && (
                  <button
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-bold text-textPrimary"
                    type="button"
                    onClick={onOpenRule}
                  >
                    看规则
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : rankings.length === 0 ? (
        <p className="px-6 pt-8 text-[13px] font-semibold text-textSecondary">暂无数据</p>
      ) : (
        <>
          {RANKING_TIERS.map((tier) => {
            const tierRows = visibleRows.filter(({ rank }) => rank >= tier.minRank && rank <= tier.maxRank);
            if (tierRows.length === 0) return null;
            const tierEnd = Math.min(tier.maxRank, rankings.length);

            return (
              <section key={tier.label} className="px-6 pt-[26px]">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{tier.label}</h2>
                  <span className="text-[13px] font-semibold text-textSecondary">
                    {tier.minRank}–{tierEnd}
                  </span>
                </div>
                <div className="mt-1.5">
                  <RankingList
                    previousRanks={previousRanks}
                    previousSeasonLabel={environment.previousSeason?.season}
                    rows={tierRows}
                    onOpenPokemon={onOpenPokemon}
                  />
                </div>
              </section>
            );
          })}
          {visibleCount < rankings.length && (
            <div className="px-6 pt-3.5">
              <button
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-surface text-[13px] font-bold text-textLabel"
                type="button"
                onClick={() => setVisibleCount((count) => count + RANKING_PAGE_SIZE)}
              >
                继续加载 · 已显示 {visibleRows.length} / {rankings.length}
                <ChevronDown size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 数据口径 (N01-10 full page, 01-06 first-run sheet) ──

const methodologyRows = (environment: EnvironmentState, battleType: EnvironmentBattleType) => {
  const otherBattleType: EnvironmentBattleType = battleType === 'doubles' ? 'singles' : 'doubles';

  return [
    {
      label: '来源',
      text:
        environment.sourceKind === 'seed'
          ? '内置开发样例，不代表真实环境。'
          : 'PokeDB 公开的上位构筑样本。',
    },
    {
      label: '范围',
      text: `${environmentSubtitle(environment).split(' · ').slice(0, 2).join(' · ')} · ${battleTypeLabels[battleType]}，${battleTypeLabels[otherBattleType]}榜分开出。`,
    },
    { label: '排行', text: '榜单只给名次和名次变化，不给登场率百分比。' },
    { label: '详情', text: '前 60 名有招式、道具、特性、性格的使用率，60 名之外不出统计段。' },
    ...(environment.previousSeason ? [{ label: '变动', text: 'NEW / ↑n / ↓n / – 对比上一次更新。' }] : []),
    { label: '构筑', text: '上位构筑是原始样本本身，带作者、名次与分数。' },
  ];
};

function EnvironmentMethodologyPage({
  environment,
  battleType,
  onBack,
  onOpenRule,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
  onBack: () => void;
  onOpenRule?: () => void;
}) {
  const rows = methodologyRows(environment, battleType);

  return (
    <div className="pb-7">
      <PushHeader onBack={onBack} />
      <PageHeader className="px-6 pt-3.5" subtitle={environmentSubtitle(environment)} title="数据口径" />

      <dl className="px-6 pt-[26px]">
        {rows.map(({ label, text }, index) => (
          <div
            key={label}
            className={`flex gap-3.5 py-4 ${index < rows.length - 1 ? 'border-b border-[var(--hairline)]' : ''}`}
          >
            <dt className="w-[34px] shrink-0 text-[13px] font-extrabold tracking-[-0.01em]">{label}</dt>
            <dd className="m-0 min-w-0 flex-1 text-sm font-semibold leading-[21px] text-textLabel">{text}</dd>
          </div>
        ))}
      </dl>

      <div className="px-6 pt-[22px]">
        <div className="lk-env-note rounded-[14px] p-4">
          <p className="text-sm font-bold leading-[21px] tracking-[-0.01em]">这不是官方使用率</p>
          <p className="mt-1.5 text-[13px] font-semibold leading-[19px] text-textSecondary">
            样本只涵盖公开的上位构筑，不代表全体对战人口。
          </p>
        </div>
      </div>

      <div className="px-6 pt-[22px]">
        {onOpenRule && (
          <button
            className="flex h-[60px] w-full items-center gap-3 border-t border-[var(--hairline)] text-left"
            type="button"
            onClick={onOpenRule}
          >
            <span className="min-w-0 flex-1 text-base font-bold tracking-[-0.01em]">规则（{catalogRegulation}）</span>
            <span className="shrink-0 text-chevron">
              <ChevronRight size={18} />
            </span>
          </button>
        )}
        <a
          className="flex h-[60px] w-full items-center gap-3 border-y border-[var(--hairline)] text-left"
          href={POKEDB_SITE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="min-w-0 flex-1 text-base font-bold tracking-[-0.01em]">PokeDB 源站</span>
          <span className="shrink-0 text-chevron">
            <ExternalLink size={17} />
          </span>
        </a>
      </div>
    </div>
  );
}

/** 01-06 — shown once, the first time someone opens 环境. No close button in the frame. */
function MethodologyIntroSheet({
  environment,
  onDismiss,
}: {
  environment: EnvironmentState;
  onDismiss: () => void;
}) {
  const bullets = [
    '榜单给出的是名次，不是官方使用率。',
    `榜单每日更新，当前为 ${environmentSubtitle(environment)}。`,
    '来源与数据版本写在 我的 · 关于与数据。',
  ];

  return (
    <div
      aria-label="数据口径"
      aria-modal="true"
      className="fixed inset-0 z-50 mx-auto max-w-[430px]"
      data-bottom-nav-lock="true"
      role="dialog"
    >
      <div className="lk-sheet-overlay absolute inset-0" />
      <section className="lk-sheet absolute inset-x-0 bottom-0 rounded-t-[20px] px-6 pb-7 pt-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">数据口径</p>
        <h2 className="mt-2.5 text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">榜单来自上位构筑样本</h2>
        <div className="mt-4 flex flex-col gap-3">
          {bullets.map((bullet) => (
            <div key={bullet} className="flex gap-2.5">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-textLabel" />
              <p className="m-0 text-sm font-semibold leading-[21px] text-textLabel">{bullet}</p>
            </div>
          ))}
        </div>
        <KitButton className="mt-[22px] w-full" height={50} variant="primary" onClick={onDismiss}>
          知道了
        </KitButton>
      </section>
    </div>
  );
}

// ── Home (01-01 / 01-02) ──

function EnvironmentHero({ usage, onOpen }: { usage: EnvironmentPokemonUsage; onOpen: (pokemonId: string) => void }) {
  const entry = getEnvironmentPokemon(usage.pokemonId);
  if (!entry) return null;

  return (
    <div className="px-6">
      <button
        aria-label={`查看 ${entry.chineseName} 的环境详情`}
        className="lk-env-hero relative w-full overflow-hidden rounded-[20px] p-[22px] text-left"
        // The halo is this Pokémon's own body colours sampled off its artwork, as on a team member
        // card; a Mega or form swap changes `entry.iconRef` and the wash follows. A sprite with no
        // sampled row falls back to its two type colours.
        style={auraStyle(entry.types, entry.iconRef)}
        type="button"
        onClick={() => onOpen(entry.id)}
      >
        <span className="relative z-10 flex items-end gap-3">
          <span className="min-w-0 flex-1">
            <span className="lk-on-hero-strong inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold tracking-[0.06em]">
              本赛季 No.1
            </span>
            <span className="mt-3 block truncate text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">
              {entry.chineseName}
            </span>
            <span className="mt-1 block text-[13px] font-semibold tracking-[0.04em] text-textSecondary">
              {entry.englishName.toLocaleUpperCase()} · NO.{entry.nationalDexNo}
            </span>
            <span className="mt-3.5 flex items-center gap-2">
              {entry.types.map((type) => (
                <span
                  key={type}
                  className="lk-on-hero inline-flex h-[30px] items-center gap-[7px] rounded-full px-3 text-xs font-bold"
                >
                  <TypeDot size={8} type={type} />
                  {typeLabels[type]}
                </span>
              ))}
            </span>
          </span>
          <Sprite iconRef={entry.iconRef} label={entry.chineseName} size={132} />
        </span>
      </button>
    </div>
  );
}

function TeamSampleTeaser({
  sample,
  onSelect,
}: {
  sample: EnvironmentTeamSample;
  onSelect: (sample: EnvironmentTeamSample) => void;
}) {
  const slots = resolveSampleSlots(sample);

  return (
    <button
      aria-label={`导入「${teamSampleTitle(sample)}」`}
      className="w-[236px] shrink-0 rounded-2xl bg-surface p-3.5 text-left"
      type="button"
      onClick={() => onSelect(sample)}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {slots.map((entry, index) => (
          <span key={`${entry.id}-${index}`} className="grid h-[52px] place-items-center">
            <Sprite iconRef={entry.iconRef} label={entry.chineseName} size={52} />
          </span>
        ))}
      </div>
      <span className="mt-3.5 block truncate text-[15px] font-bold">{teamSampleTitle(sample)}</span>
      <span className="mt-[3px] block truncate text-xs font-semibold text-textSecondary">
        {teamSampleMeta(sample).join(' · ')}
      </span>
    </button>
  );
}

export function EnvironmentPage({
  environment,
  onImportSample,
  onRetryLoad,
  onOpenRule,
}: {
  environment: EnvironmentState;
  onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void;
  onRetryLoad?: () => void;
  /** 规则页 is opened by P6; until it exists the entries that need it simply do not render. */
  onOpenRule?: () => void;
}) {
  // Default to the current regulation's primary format (M-B → doubles) so every
  // battle-type toggle across the app lands on the same default. Single source: currentRuleSet.
  const [battleType, setBattleType] = useState<EnvironmentBattleType>(currentRuleSet.battleType);
  // Which environment screen is showing comes from the URL (#/env, #/env/ranking, …) so the
  // hardware back button and deep links work. `battleType` stays local: it is a view toggle,
  // not a destination, and putting it in the URL would double the number of shareable states
  // for no gain.
  const { route, navigate, back } = useHashRoute();
  const view: 'home' | 'ranking' | 'methodology' | 'teams' =
    route.name === 'env-ranking'
      ? 'ranking'
      : route.name === 'env-methodology'
        ? 'methodology'
        : route.name === 'env-teams'
          ? 'teams'
          : 'home';
  const detailPokemonId = route.name === 'env-pokemon' ? route.pokemonId : null;
  const movesById = useEnvironmentMoveLookup(Boolean(detailPokemonId));
  const [introDismissed, setIntroDismissed] = useState(() => readMethodologySeen());
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);

  useEffect(() => {
    const sync = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const rankings = useMemo(() => environment.pokemonUsage[battleType], [battleType, environment.pokemonUsage]);
  // Newest first, not 07-01's 「按分数」 order. That sorter puts ladder samples ahead of every
  // event team (they are the only ones carrying a score), and the ladder samples come from the
  // PokeDB snapshot, which lags the VGCPastes library by months — so the home strip looked
  // frozen while the library refreshed weekly. The browse list now opens the same way.
  const teamSamples = useMemo(
    () => sortTeamSamplesByDate(environment.teamSamples.filter((sample) => sample.battleType === battleType), 'newest'),
    [battleType, environment.teamSamples],
  );
  const visibleTeamSamples = useMemo(() => teamSamples.slice(0, HOME_TEAM_SAMPLES), [teamSamples]);
  const homePreviousRanks = useMemo(
    () => selectSeasonRanks(environment.previousSeason, battleType),
    [environment.previousSeason, battleType],
  );
  const openPokemon = useCallback((pokemonId: string) => navigate({ name: 'env-pokemon', pokemonId }), [navigate]);
  const openTeams = useCallback(() => navigate({ name: 'env-teams' }), [navigate]);
  const dismissIntro = () => {
    writeMethodologySeen();
    setIntroDismissed(true);
  };

  // Home / ranking / methodology / detail are swapped inside the same window-level
  // scroll container, so the browser keeps the previous scroll offset. Reset to the
  // top whenever the visible screen changes, otherwise opening a Pokemon from far down
  // the list lands mid-page (e.g. on the items card) instead of the avatar header.
  // useLayoutEffect runs before paint so the correction is invisible (no flicker of
  // the old scroll position on slower devices).
  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, left: 0 });
    }
  }, [view, detailPokemonId]);

  if (detailPokemonId) {
    return (
      <Suspense fallback={null}>
        <EnvironmentPokemonDetail
          battleType={battleType}
          environment={environment}
          movesById={movesById}
          pokemonId={detailPokemonId}
          // back() pops the real history entry, so 返回 lands on whichever screen opened this
          // detail — the previous detail in a 常见队友 chain, or the list that started it —
          // without tracking a returnView by hand.
          onBack={back}
          onImportSample={onImportSample}
          onOpenPokemon={openPokemon}
          // The header chevrons page through the ranking in place; they are a control on this
          // screen, not a new destination, so they must not each leave a history entry behind.
          onPageToPokemon={(pokemonId) => navigate({ name: 'env-pokemon', pokemonId }, { replace: true })}
          onOpenTeams={openTeams}
        />
      </Suspense>
    );
  }

  if (view === 'ranking') {
    return (
      <FullRankingPage
        battleType={battleType}
        environment={environment}
        rankings={rankings}
        onBack={back}
        onBattleTypeChange={setBattleType}
        onOpenPokemon={openPokemon}
        onOpenRule={onOpenRule}
      />
    );
  }

  if (view === 'methodology') {
    return (
      <EnvironmentMethodologyPage
        battleType={battleType}
        environment={environment}
        onBack={back}
        onOpenRule={onOpenRule}
      />
    );
  }

  if (view === 'teams') {
    return (
      <TeamBrowseView
        battleType={battleType}
        samples={environment.teamSamples}
        subtitle={environmentSubtitle(environment)}
        onBack={back}
        onImportSample={onImportSample}
      />
    );
  }

  const visibleRankings = rankings.slice(0, HOME_RANKING_ROWS).map((item, index) => ({ item, rank: index + 1 }));

  return (
    <div>
      <div className="px-6 pb-4 pt-[38px]">
        <h1 className="mt-1.5 text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">今日环境</h1>
        {onOpenRule ? (
          <button
            className="mt-1.5 block text-left text-[13px] leading-[18px] text-textSecondary"
            type="button"
            onClick={onOpenRule}
          >
            {environmentSubtitle(environment)}
          </button>
        ) : (
          <p className="mt-1.5 text-[13px] leading-[18px] text-textSecondary">{environmentSubtitle(environment)}</p>
        )}
      </div>

      <EnvironmentStatusNotices
        environment={environment}
        offline={offline}
        onOpenMethodology={() => navigate({ name: 'env-methodology' })}
        onRetry={() => onRetryLoad?.()}
      />

      {rankings[0] && <EnvironmentHero usage={rankings[0]} onOpen={openPokemon} />}

      <div className="px-6 pt-5">
        <SegmentedTabs
          options={(Object.keys(battleTypeLabels) as EnvironmentBattleType[]).map((type) => ({
            id: type,
            label: battleTypeLabels[type],
          }))}
          value={battleType}
          onChange={setBattleType}
        />
      </div>

      <section className="px-6 pt-7">
        <SectionHeading
          trailing={
            <button
              aria-label="查看完整使用排行"
              className="shrink-0 text-sm font-semibold text-textLabel"
              type="button"
              onClick={() => navigate({ name: 'env-ranking' })}
            >
              全部 {rankings.length}
            </button>
          }
        >
          使用排行
        </SectionHeading>
        <div className="mt-2">
          <RankingList
            previousRanks={homePreviousRanks}
            previousSeasonLabel={environment.previousSeason?.season}
            rows={visibleRankings}
            onOpenPokemon={openPokemon}
          />
        </div>
      </section>

      {visibleTeamSamples.length > 0 && (
        <section className="pt-7">
          <SectionHeading
            className="px-6"
            trailing={
              <button
                aria-label="查看全部上位构筑"
                className="shrink-0 text-sm font-semibold text-textLabel"
                type="button"
                onClick={openTeams}
              >
                全部
              </button>
            }
          >
            上位构筑
          </SectionHeading>
          <div className="hide-scrollbar mt-3.5 flex gap-3 overflow-x-auto px-6">
            {visibleTeamSamples.map((sample) => (
              <TeamSampleTeaser key={sample.id} sample={sample} onSelect={onImportSample} />
            ))}
          </div>
        </section>
      )}

      {!introDismissed && <MethodologyIntroSheet environment={environment} onDismiss={dismissIntro} />}
    </div>
  );
}
