import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { auraStyle } from '../components/kit/aura';
import { KitButton } from '../components/kit/KitButton';
import { Sprite } from '../components/kit/Sprite';
import { ADDED_TOAST_DURATION_MS, TeamPickerSheet, teamChoicesFor } from '../components/TeamPickerSheet';
import { Toast } from '../components/kit/Toast';
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
import {
  isUnresolvedPokemonId,
  type EnvironmentReferenceUsage,
  type EnvironmentStatPointUsage,
} from '../lib/environmentDataset';
import { currentRuleMovesForPokemon } from '../lib/currentRuleCatalog';
import { evaluateMemberLegality } from '../lib/legality';
import { MAX_TOTAL_STAT_POINTS, statPointKeys, statPointLabels } from '../lib/statPoints';
import { createDefaultTeamMember } from '../lib/teamMemberDefaults';
import { useAppStore } from '../state/AppContext';
import type { Move, Team, TeamMember } from '../types';
import { DETAIL_RANK_LIMIT, RoundIconButton, SectionHeading } from './environmentChrome';
import { resolveSampleSlots, teamSampleScoreMeta, teamSampleTitle } from './TeamSampleCard';

const VISIBLE_MOVE_ROWS = 4;
const VISIBLE_ITEM_ROWS = 3;
const VISIBLE_TRAIT_ROWS = 2;
const VISIBLE_SPREAD_ROWS = 3;
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

/**
 * One SP spread: a 66-point rail on top, the same numbers as chips below.
 *
 * The rail is the whole Champions budget — every segment grows by its own point count out of
 * `MAX_TOTAL_STAT_POINTS`, so a row PokeDB merged (`hasRemainder`) visibly stops short and ends
 * in a dashed tail worth the points it never named. A row that already totals 66 has no tail,
 * and a short row without `hasRemainder` simply leaves the rail unfilled rather than inventing one.
 */
function StatPointSpreadRow({
  stat,
  lead,
  divider,
}: {
  stat: EnvironmentStatPointUsage;
  lead: boolean;
  divider: boolean;
}) {
  const terms = statPointKeys
    .map((key) => ({ key, label: statPointLabels[key], value: Number(stat.points[key] ?? 0) }))
    .filter((term) => term.value > 0);
  const assigned = terms.reduce((total, term) => total + term.value, 0);
  const remainder = stat.hasRemainder ? Math.max(0, MAX_TOTAL_STAT_POINTS - assigned) : 0;
  const rate = formatRate(stat.usageRate);
  const spoken = [
    terms.map((term) => `${term.label} ${term.value}`).join('、'),
    ...(remainder > 0 ? [`余 ${remainder} 点`] : []),
    `使用率 ${rate}`,
  ].join('，');

  return (
    <div
      aria-label={spoken}
      className={`py-3.5 ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      role="group"
    >
      <span aria-hidden="true" className="flex h-2.5 items-stretch gap-[3px]">
        {terms.map((term) => (
          <span
            key={term.key}
            className={`min-w-[8px] basis-0 rounded-[3px] ${lead ? 'bg-data' : 'bg-[var(--env-sp-seg2)]'}`}
            style={{ flexGrow: term.value }}
          />
        ))}
        {remainder > 0 && (
          <span
            className="min-w-[8px] basis-0 rounded-[3px] border border-dashed border-[var(--env-sp-dash)]"
            style={{ flexGrow: remainder }}
          />
        )}
      </span>
      <span className="mt-2.5 flex items-center gap-2.5">
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {terms.map((term) => (
            <span
              key={term.key}
              className="lk-chip inline-flex h-[22px] items-baseline gap-1 rounded-full px-[7px] pt-[3px]"
            >
              <span className="text-[11px] font-bold leading-[14px] text-textLabel">{term.label}</span>
              <span
                className={`text-xs font-extrabold leading-[14px] tabular-nums ${lead ? 'text-data' : 'text-textLabel'}`}
              >
                {term.value}
              </span>
            </span>
          ))}
          {remainder > 0 && (
            <span className="inline-flex h-[22px] items-baseline gap-1 rounded-full border border-dashed border-[var(--env-sp-dash)] px-[7px] pt-[3px]">
              <span className="text-[11px] font-bold leading-[14px] text-textSecondary">余</span>
              <span className="text-xs font-extrabold leading-[14px] tabular-nums text-textSecondary">{remainder}</span>
              <span className="text-[10px] font-bold leading-[14px] text-textSecondary">点</span>
            </span>
          )}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[20px] font-extrabold tabular-nums text-textLabel">
          {rate}
        </span>
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
  onImportSample,
  onOpenPokemon,
  onPageToPokemon,
  onOpenTeams,
}: {
  environment: EnvironmentState;
  battleType: EnvironmentBattleType;
  pokemonId: string;
  movesById?: Map<string, Move>;
  onBack: () => void;
  onImportSample: (sample: EnvironmentTeamSample) => Promise<void> | void;
  /** Pushes another detail, so 返回 walks back down a 常见队友 chain. */
  onOpenPokemon: (pokemonId: string) => void;
  /** Replaces this detail — the header chevrons page in place. */
  onPageToPokemon: (pokemonId: string) => void;
  onOpenTeams: () => void;
}) {
  const [movesExpanded, setMovesExpanded] = useState(false);
  const [pickingTeam, setPickingTeam] = useState(false);
  const [addedToTeamName, setAddedToTeamName] = useState<string>();
  const { teams, addTeam, saveTeam, updateMember } = useAppStore();
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

  useEffect(() => {
    if (!addedToTeamName) return;
    const timeoutId = window.setTimeout(() => setAddedToTeamName(undefined), ADDED_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [addedToTeamName]);

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
  const spreadRows = (usage?.statPointStats ?? []).slice(0, VISIBLE_SPREAD_ROWS);
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
  // user to distribute. Only offered inside the top 60, where those percentages exist at all;
  // which team it lands in is always asked, never assumed — silently writing into the first team
  // is what let repeated taps pile five copies of one Pokémon into it.
  const teamChoices = teamChoicesFor(teams, entry.id);

  const buildPopularMember = (team: Team): TeamMember => {
    const legalMoveIds = currentRuleMovesForPokemon(entry.id).map((move) => move.id);
    const popularItemId = itemRows[0]?.item.id;
    const member = createDefaultTeamMember({
      pokemonId: entry.id,
      abilityId: abilityRows[0]?.ability.id,
      // A held item is unique within a team, so a teammate already carrying the popular one
      // leaves this slot empty rather than starting a hand-over the user did not ask for.
      itemId: team.members.some((existing) => existing.itemId === popularItemId) ? undefined : popularItemId,
      notes: '按环境热门配置加入。',
    });
    const moveIds = (usage?.moveStats ?? [])
      .map((stat) => stat.id)
      .filter((moveId) => legalMoveIds.includes(moveId))
      .slice(0, 4);
    const next = { ...member, moveIds, nature: natureRows[0]?.id ?? member.nature };
    return { ...next, legalityStatus: evaluateMemberLegality(next, team).status };
  };

  const addToTeam = async (team: Team) => {
    setPickingTeam(false);
    await updateMember(team.id, buildPopularMember(team));
    setAddedToTeamName(team.name);
  };

  const addToNewTeam = async () => {
    setPickingTeam(false);
    // `teams` in this render does not know about the fresh team yet, so the member is written
    // through the returned object instead of going back through `updateMember`.
    const team = await addTeam();
    await saveTeam({ ...team, members: [buildPopularMember(team)] });
    setAddedToTeamName(team.name);
  };

  return (
    <div>
      {/* The header halo is this Pokémon's own body colours sampled off its artwork, as on a team
          member card; a sprite with no sampled row falls back to its two type colours. */}
      <div className="lk-env-detail-hero relative px-6 pb-[34px] pt-5" style={auraStyle(entry.types, entry.iconRef)}>
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
                onClick={() => onPageToPokemon(pageable[pageIndex - 1].usage.pokemonId)}
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
                onClick={() => onPageToPokemon(pageable[pageIndex + 1].usage.pokemonId)}
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
          <KitButton className="w-full" height={50} variant="primary" onClick={() => setPickingTeam(true)}>
            <Plus aria-hidden="true" size={18} />
            按热门配置加入队伍
          </KitButton>
        </div>
      )}

      {(movesPending || moveRows.length > 0) && (
        <section className="px-6 pt-[26px]">
          <SectionHeading>常用招式</SectionHeading>
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
          <SectionHeading>携带道具</SectionHeading>
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

      {spreadRows.length > 0 && (
        <section className="px-6 pt-[26px]">
          <SectionHeading>SP 分配</SectionHeading>
          <div className="mt-2.5">
            {spreadRows.map((stat, index) => (
              <StatPointSpreadRow
                key={`${stat.label}-${index}`}
                divider={index < spreadRows.length - 1}
                lead={index === 0}
                stat={stat}
              />
            ))}
          </div>
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
                onImport={onImportSample}
              />
            ))}
          </div>
        </section>
      )}

      {pickingTeam && (
        <TeamPickerSheet
          choices={teamChoices}
          pokemonName={entry.chineseName}
          onClose={() => setPickingTeam(false)}
          onCreate={() => void addToNewTeam()}
          onPick={(team) => void addToTeam(team)}
        />
      )}
      {addedToTeamName && <Toast title={`已加入${addedToTeamName}`} />}
    </div>
  );
}

function RelatedSampleRow({
  sample,
  divider,
  onImport,
}: {
  sample: EnvironmentTeamSample;
  divider: boolean;
  onImport: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const slots = resolveSampleSlots(sample);
  const title = teamSampleTitle(sample);

  return (
    <button
      aria-label={`导入「${title}」`}
      className={`flex h-[68px] w-full items-center gap-3 text-left ${divider ? 'border-b border-[var(--hairline)]' : ''}`}
      type="button"
      onClick={() => void onImport(sample)}
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
