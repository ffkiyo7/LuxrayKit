import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { KitButton } from '../components/kit/KitButton';
import { Sprite } from '../components/kit/Sprite';
import { TypeDot } from '../components/kit/TypeDot';
import { typeLabels } from '../components/ui';
import { abilities } from '../data';
import {
  getEnvironmentItem,
  getEnvironmentPokemon,
  type EnvironmentBattleType,
  type EnvironmentPokemonUsage,
  type EnvironmentState,
  type EnvironmentTeamSample,
} from '../data/environment';
import { isUnresolvedPokemonId, type EnvironmentReferenceUsage } from '../lib/environmentDataset';
import { currentRuleMovesForPokemon } from '../lib/currentRuleCatalog';
import { evaluateMemberLegality } from '../lib/legality';
import { createDefaultTeamMember } from '../lib/teamMemberDefaults';
import { useAppStore } from '../state/AppContext';
import type { Move } from '../types';
import { DETAIL_RANK_LIMIT, RoundIconButton, SectionHeading } from './environmentChrome';
import { resolveSampleSlots, teamSampleScoreMeta, teamSampleTitle } from './TeamSampleCard';

const TEAM_SIZE = 6;
const VISIBLE_MOVE_ROWS = 4;
const VISIBLE_ITEM_ROWS = 3;
const VISIBLE_TRAIT_ROWS = 2;
const VISIBLE_RELATED_SAMPLES = 3;

const categoryLabels: Record<Move['category'], string> = { Physical: '物理', Special: '特殊', Status: '变化' };

const formatRate = (value: number) => `${value.toFixed(1)}%`;

const getAbility = (abilityId: string) => abilities.find((entry) => entry.id === abilityId);

/** 「物理 · 威力 100 · 命中 100」; a status move prints an em dash rather than a 0. */
const moveMetaLine = (move: Move) =>
  `${categoryLabels[move.category]} · 威力 ${move.power ?? '—'} · 命中 ${move.accuracy ?? '—'}`;

function StatRow({
  label,
  rate,
  leading,
  height,
  divider,
  dimmed,
}: {
  label: string;
  rate: number;
  leading?: ReactNode;
  height: number;
  divider: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      style={{ height }}
    >
      {leading}
      <span
        className={`min-w-0 flex-1 truncate text-[15px] tracking-[-0.01em] ${
          dimmed ? 'font-semibold text-textSecondary' : 'font-bold'
        }`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 text-[20px] font-extrabold tabular-nums ${dimmed ? 'text-textSecondary' : 'text-textLabel'}`}
      >
        {formatRate(rate)}
      </span>
    </div>
  );
}

/** N01-15: the move catalog is a lazy chunk, so the 常用招式 rows are blocked out until it lands. */
function MoveRowSkeleton() {
  return (
    <div className="flex h-[68px] flex-col justify-center gap-2 border-b border-[var(--hairline)]">
      <div className="flex items-center gap-3">
        <span className="lk-env-skeleton h-2 w-2 shrink-0 rounded-full" />
        <span className="lk-env-skeleton h-4 min-w-0 flex-1 rounded-full" />
        <span className="lk-env-skeleton h-4 w-14 shrink-0 rounded-full" />
      </div>
      <div className="lk-env-skeleton h-1 rounded-full" />
    </div>
  );
}

export function EnvironmentPokemonDetail({
  environment,
  battleType,
  pokemonId,
  movesById,
  onBack,
  onOpenPokemon,
  onOpenTeams,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
  pokemonId: string;
  movesById?: Map<string, Move>;
  onBack: () => void;
  onOpenPokemon: (pokemonId: string) => void;
  onOpenTeams: () => void;
}) {
  const [movesExpanded, setMovesExpanded] = useState(false);
  const { teams, updateMember } = useAppStore();
  const activeTeam = teams[0];
  const rankings = environment.pokemonUsage[battleType];
  const entry = getEnvironmentPokemon(pokemonId);

  // The pager walks the ranking itself, skipping rows whose Pokemon the catalog does not know:
  // those have no detail page to land on.
  const pageable = useMemo(
    () =>
      rankings
        .map((usage, index) => ({ usage, rank: index + 1 }))
        .filter(({ usage }) => !usage.unresolved && !isUnresolvedPokemonId(usage.pokemonId)),
    [rankings],
  );
  const pageIndex = pageable.findIndex(({ usage }) => usage.pokemonId === pokemonId);
  const current = pageIndex >= 0 ? pageable[pageIndex] : undefined;

  if (!entry) return null;

  const usage: EnvironmentPokemonUsage | undefined = current?.usage;
  const rank = current?.rank;
  const hasDetailStats = Boolean(rank && rank <= DETAIL_RANK_LIMIT);

  type CatalogPokemon = NonNullable<ReturnType<typeof getEnvironmentPokemon>>;
  type CatalogItem = NonNullable<ReturnType<typeof getEnvironmentItem>>;
  type CatalogAbility = NonNullable<ReturnType<typeof getAbility>>;

  const moveRows = (usage?.moveStats ?? [])
    .map((stat) => ({ stat, move: movesById?.get(stat.id) }))
    .filter((row): row is { stat: EnvironmentReferenceUsage; move: Move } => Boolean(row.move));
  const itemRows = (usage?.itemStats ?? [])
    .map((stat) => ({ stat, item: getEnvironmentItem(stat.id) }))
    .filter((row): row is { stat: EnvironmentReferenceUsage; item: CatalogItem } => Boolean(row.item));
  const abilityRows = (usage?.abilityStats ?? [])
    .map((stat) => ({ stat, ability: getAbility(stat.id) }))
    .filter((row): row is { stat: EnvironmentReferenceUsage; ability: CatalogAbility } => Boolean(row.ability));
  const natureRows = usage?.natureStats ?? [];
  // 常见队友 carries a rank-relative number that must never be shown, so the list is ordered by
  // the teammate's own environment rank and printed without any value at all.
  const teammateRows = (usage?.teammateStats ?? [])
    .map((stat) => ({ pokemon: getEnvironmentPokemon(stat.id), rank: rankings.findIndex((item) => item.pokemonId === stat.id) }))
    .filter((row): row is { pokemon: CatalogPokemon; rank: number } => Boolean(row.pokemon))
    .sort((left, right) => (left.rank < 0 ? 1 : right.rank < 0 ? -1 : left.rank - right.rank));
  const relatedSamples = environment.teamSamples
    .filter((sample) => sample.battleType === battleType && sample.slots.some((slot) => slot.pokemonId === pokemonId))
    .slice(0, VISIBLE_RELATED_SAMPLES);

  const movesPending = Boolean(usage?.moveStats?.length) && !movesById;
  const visibleMoves = movesExpanded ? moveRows : moveRows.slice(0, VISIBLE_MOVE_ROWS);

  // 「按热门配置加入队伍」: the rank-1 move / item / ability / nature, SP left at zero for the
  // user to distribute. Only offered inside the top 60, where those percentages exist at all.
  const canAddPopularBuild = hasDetailStats && Boolean(activeTeam) && (activeTeam?.members.length ?? 0) < TEAM_SIZE;
  const addPopularBuild = async () => {
    if (!activeTeam || !canAddPopularBuild) return;
    const legalMoveIds = currentRuleMovesForPokemon(entry.id).map((move) => move.id);
    const member = createDefaultTeamMember({
      pokemonId: entry.id,
      abilityId: abilityRows[0]?.ability.id,
      itemId: itemRows[0]?.item.id,
      notes: '按环境热门配置加入。',
    });
    const moveIds = (usage?.moveStats ?? [])
      .map((stat) => stat.id)
      .filter((moveId) => legalMoveIds.includes(moveId))
      .slice(0, 4);
    const nature = natureRows[0]?.id ?? member.nature;
    const next = { ...member, moveIds, nature };
    await updateMember(activeTeam.id, { ...next, legalityStatus: evaluateMemberLegality(next, activeTeam).status });
  };

  return (
    <div>
      <div className="lk-env-detail-hero relative px-6 pb-[34px] pt-5">
        <div className="flex items-center justify-between">
          <RoundIconButton label="返回" onHero onClick={onBack}>
            <ChevronLeft size={20} />
          </RoundIconButton>
          {pageIndex >= 0 && (
            <div className="flex items-center gap-2">
              <RoundIconButton
                disabled={pageIndex === 0}
                label="上一名"
                onHero
                onClick={() => onOpenPokemon(pageable[pageIndex - 1].usage.pokemonId)}
              >
                <ChevronUp size={18} />
              </RoundIconButton>
              <span className="text-xs font-bold tracking-[0.04em] text-textSecondary">
                榜单 {pageIndex + 1} / {pageable.length}
              </span>
              <RoundIconButton
                disabled={pageIndex === pageable.length - 1}
                label="下一名"
                onHero
                onClick={() => onOpenPokemon(pageable[pageIndex + 1].usage.pokemonId)}
              >
                <ChevronDown size={18} />
              </RoundIconButton>
            </div>
          )}
        </div>

        <div className="mt-1 text-center">
          <Sprite className="mx-auto" iconRef={entry.iconRef} label={entry.chineseName} size={132} />
          <h1 className="mt-1 text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">{entry.chineseName}</h1>
          <p className="mt-[5px] text-[13px] font-bold tracking-[0.12em] text-textSecondary">
            {entry.japaneseName} · 全国编号 {entry.nationalDexNo}
          </p>
          <p className="mt-3 flex items-center justify-center gap-3 text-[13px] font-bold text-textLabel">
            {entry.types.map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <TypeDot size={8} type={type} />
                {typeLabels[type]}
              </span>
            ))}
          </p>
        </div>

        {rank && (
          <div className="mt-[18px] flex items-baseline justify-center gap-2.5">
            <span className="text-[11px] font-extrabold uppercase leading-[14px] tracking-[0.14em] text-textSecondary">环境</span>
            <span className="text-[20px] font-extrabold tabular-nums text-textSecondary">No.</span>
            <span className="text-[44px] font-extrabold leading-[44px] tracking-[-0.02em] tabular-nums">{rank}</span>
          </div>
        )}
      </div>

      {hasDetailStats && (
        <div className="px-6 pt-2.5">
          <KitButton
            className="w-full"
            disabled={!canAddPopularBuild}
            height={50}
            variant="primary"
            onClick={() => void addPopularBuild()}
          >
            <Plus aria-hidden="true" size={18} />
            按热门配置加入队伍
          </KitButton>
        </div>
      )}

      {(movesPending || moveRows.length > 0) && (
        <section className="px-6 pt-[26px]">
          <SectionHeading trailing={<span className="shrink-0 text-xs font-semibold text-textSecondary">按使用率排序</span>}>
            常用招式
          </SectionHeading>
          <div className="mt-2.5">
            {movesPending ? (
              <>
                <MoveRowSkeleton />
                <MoveRowSkeleton />
              </>
            ) : (
              visibleMoves.map(({ move, stat }, index) => (
                <div
                  key={move.id}
                  className={`flex h-[68px] items-center gap-3 ${
                    index === visibleMoves.length - 1 ? '' : 'border-b border-[var(--hairline)]'
                  }`}
                >
                  <TypeDot size={8} type={move.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-bold tracking-[-0.01em]">{move.chineseName}</span>
                    <span className="mt-[3px] block text-xs font-semibold tabular-nums text-textSecondary">
                      {moveMetaLine(move)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[20px] font-extrabold tabular-nums text-textLabel">
                    {formatRate(stat.usageRate)}
                  </span>
                </div>
              ))
            )}
          </div>
          {!movesPending && moveRows.length > VISIBLE_MOVE_ROWS && (
            <button
              className="mt-3.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-surface text-[13px] font-bold text-textLabel"
              type="button"
              onClick={() => setMovesExpanded((expanded) => !expanded)}
            >
              {movesExpanded ? '收起招式' : `展开全部 ${moveRows.length} 个招式`}
              {movesExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </section>
      )}

      {itemRows.length > 0 && (
        <section className="px-6 pt-[26px]">
          <SectionHeading trailing={<span className="shrink-0 text-xs font-semibold text-textSecondary">按使用率排序</span>}>
            携带道具
          </SectionHeading>
          <div className="mt-2.5">
            {itemRows.slice(0, VISIBLE_ITEM_ROWS).map(({ item, stat }) => (
              <div key={item.id} className="flex h-16 items-center gap-3.5 border-b border-[var(--hairline)]">
                <Sprite iconRef={item.iconRef} label={item.chineseName} size={28} />
                <span className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-[-0.01em]">{item.chineseName}</span>
                <span className="shrink-0 text-[20px] font-extrabold tabular-nums text-textLabel">
                  {formatRate(stat.usageRate)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(abilityRows.length > 0 || natureRows.length > 0) && (
        <section className="flex gap-6 px-6 pt-[26px]">
          {abilityRows.length > 0 && (
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">特性</h2>
              <div className="mt-2.5">
                {abilityRows.slice(0, VISIBLE_TRAIT_ROWS).map(({ ability, stat }, index) => (
                  <StatRow
                    key={ability.id}
                    dimmed={index > 0}
                    divider={index === 0}
                    height={index === 0 ? 60 : 44}
                    label={ability.chineseName}
                    rate={stat.usageRate}
                  />
                ))}
              </div>
            </div>
          )}
          {natureRows.length > 0 && (
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">性格</h2>
              <div className="mt-2.5">
                {natureRows.slice(0, VISIBLE_TRAIT_ROWS).map((stat, index) => (
                  <StatRow
                    key={stat.id}
                    dimmed={index > 0}
                    divider={index === 0}
                    height={index === 0 ? 60 : 44}
                    label={stat.id}
                    rate={stat.usageRate}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {teammateRows.length > 0 && (
        <section className="pt-[26px]">
          <SectionHeading
            className="px-6"
            trailing={<span className="shrink-0 text-xs font-semibold text-textSecondary">按环境名次排序</span>}
          >
            常见队友
          </SectionHeading>
          <div className="hide-scrollbar mt-3.5 flex gap-4 overflow-x-auto px-6">
            {teammateRows.map(({ pokemon: mate }) => (
              <button
                key={mate.id}
                className="w-[72px] shrink-0 text-center"
                type="button"
                onClick={() => onOpenPokemon(mate.id)}
              >
                <Sprite className="mx-auto" iconRef={mate.iconRef} label={mate.chineseName} size={72} />
                <span className="mt-1.5 block truncate text-xs font-semibold text-textLabel">{mate.chineseName}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {relatedSamples.length > 0 && (
        <section className="px-6 pt-[26px]">
          <SectionHeading
            trailing={
              <button className="shrink-0 text-[13px] font-bold text-textPrimary" type="button" onClick={onOpenTeams}>
                查看全部
              </button>
            }
          >
            相关上位构筑
          </SectionHeading>
          <div className="mt-2.5">
            {relatedSamples.map((sample, index) => (
              <RelatedSampleRow
                key={sample.id}
                divider={index < relatedSamples.length - 1}
                sample={sample}
                onOpen={onOpenTeams}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RelatedSampleRow({
  sample,
  divider,
  onOpen,
}: {
  sample: EnvironmentTeamSample;
  divider: boolean;
  onOpen: () => void;
}) {
  const slots = resolveSampleSlots(sample);
  const title = teamSampleTitle(sample);

  return (
    <button
      aria-label={`在上位构筑里查看 ${title}`}
      className={`flex h-[68px] w-full items-center gap-3 text-left ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      type="button"
      onClick={onOpen}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold tracking-[-0.01em]">{title}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-textSecondary">
          {teamSampleScoreMeta(sample).join(' · ')}
        </span>
      </span>
      <span className="flex shrink-0 gap-px">
        {slots.map((entry, index) => (
          <Sprite key={`${entry.id}-${index}`} iconRef={entry.iconRef} label="" size={26} />
        ))}
      </span>
      <span className="shrink-0 text-chevron">
        <ChevronRight size={18} />
      </span>
    </button>
  );
}
