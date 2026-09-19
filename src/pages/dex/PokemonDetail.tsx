import { ChevronDown, ChevronLeft, ChevronUp, Search, Swords, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { abilities } from '../../data';
import { pokemonPhysicalMetricsByDexNo } from '../../data/seed/regMA/physicalMetrics';
import { attackingTypes, defensiveMatchupMultiplier, statRows } from '../../lib/calculations';
import { currentRuleMovesForPokemon } from '../../lib/currentRuleCatalog';
import { evaluateMemberLegality } from '../../lib/legality';
import type { DexFormEntry } from '../../lib/pokemonForms';
import { createDefaultTeamMember } from '../../lib/teamMemberDefaults';
import { useAppStore } from '../../state/AppContext';
import type { PokemonType, Team, TeamMember } from '../../types';
import { auraStyle, Sprite, TypeDot } from '../../components/kit';
import { Toast } from '../../components/kit/Toast';
import { ADDED_TOAST_DURATION_MS, TeamPickerSheet, teamChoicesFor } from '../../components/TeamPickerSheet';
import { hiddenAbilityIdsByPokemonId } from '../../data/seed/regMA/hiddenAbilities';
import {
  filterMovesByQuery,
  formatDexNo,
  formatHeight,
  formatMultiplier,
  formatWeight,
  learnableMoveMeta,
  sortMoves,
  statLabels,
  STAT_BAR_CEILING,
  typeLabelByValue,
  typeOrder,
  type MoveSortKey,
} from './dexShared';

const moveSortOptions: Array<{ id: MoveSortKey; label: string }> = [
  { id: 'power-asc', label: '威力 ↑' },
  { id: 'power-desc', label: '威力 ↓' },
  { id: 'type', label: '属性' },
];

function SectionHeading({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{title}</h2>
      {trailing && <span className="shrink-0 text-[13px] font-bold text-textPrimary">{trailing}</span>}
    </div>
  );
}

/** 04-09 matchup chip: a type dot, the type name and its multiplier on one neutral capsule. */
function MatchupChip({ type, multiplier }: { type: PokemonType; multiplier: number }) {
  return (
    <span className="lk-chip inline-flex h-8 items-center gap-1.5 rounded-full px-[11px] text-xs font-bold text-textLabel">
      <TypeDot size={7} type={type} />
      {typeLabelByValue[type]} {formatMultiplier(multiplier)}
    </span>
  );
}

function MatchupGroup({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: 'danger' | 'success';
  rows: Array<{ type: PokemonType; multiplier: number }>;
}) {
  if (rows.length === 0) return null;
  // The frame prints the multipliers the group actually contains next to its label.
  const legend = [...new Set(rows.map((row) => formatMultiplier(row.multiplier)))].join(' · ');
  const ink = tone === 'danger' ? 'text-danger' : 'text-success';

  return (
    <>
      <p className={`mt-4 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] ${ink}`}>
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone === 'danger' ? 'bg-danger' : 'bg-success'}`} />
        {title}
        <span className="tracking-[0.08em] tabular-nums">{legend}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-[7px]">
        {rows.map((row) => (
          <MatchupChip key={`${title}-${row.type}`} multiplier={row.multiplier} type={row.type} />
        ))}
      </div>
    </>
  );
}

/**
 * N04-10: the artwork alone on a plane tinted with the Pokémon's own body colours — the same halo
 * the team member card paints, so a Mega or an alternate form re-tints the plane with its own
 * artwork's colours (and with its own types, for a sprite that has no sampled row).
 */
function LargeArtwork({ entry, onClose }: { entry: DexFormEntry; onClose: () => void }) {
  const src = entry.artworkRef ?? entry.iconRef;
  // Until the file has decoded, `filter: drop-shadow()` has no alpha to follow and WebKit paints
  // the shadow of the whole 132px box — a grey rectangle on the first open, gone once cached.
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>();
  const loaded = loadedSrc === src;

  return (
    <div
      aria-label={`${entry.chineseName}大图`}
      aria-modal="true"
      className="lk-p4a-artwork-aura fixed inset-0 z-50 mx-auto max-w-[430px]"
      data-bottom-nav-lock="true"
      role="dialog"
      style={auraStyle(entry.types, entry.iconRef)}
    >
      <div className="flex justify-end px-6 pt-5">
        <button
          aria-label="关闭大图"
          className="grid h-9 w-9 place-items-center rounded-full bg-textPrimary/10 text-textPrimary"
          type="button"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="grid place-items-center px-6 pt-[120px]">
        <img
          alt={entry.chineseName}
          className={`h-[132px] w-[132px] object-contain ${loaded ? 'lk-p4a-artwork' : 'opacity-0'}`}
          src={src}
          onError={() => setLoadedSrc(src)}
          onLoad={() => setLoadedSrc(src)}
        />
        <p className="mt-[26px] text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{entry.chineseName}</p>
        <p className="mt-1 text-[13px] font-semibold tracking-[0.04em] text-textSecondary">
          {entry.japaneseName} · 全国编号 {entry.basePokemon.nationalDexNo}
        </p>
      </div>
    </div>
  );
}

export function PokemonDetail({
  entry,
  onBack,
  onOpenCalculator,
}: {
  entry: DexFormEntry;
  onBack: () => void;
  onOpenCalculator: (pokemonId: string) => void;
}) {
  const { teams, addTeam, saveTeam, updateMember } = useAppStore();
  const [showArtwork, setShowArtwork] = useState(false);
  const [pickingTeam, setPickingTeam] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [expandedMoveId, setExpandedMoveId] = useState<string | null>(null);
  const [moveQuery, setMoveQuery] = useState('');
  const [moveSortKey, setMoveSortKey] = useState<MoveSortKey>('power-asc');

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(undefined), ADDED_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const entryAbilities = entry.abilities
    .map((id) => abilities.find((ability) => ability.id === id))
    .filter(Boolean) as typeof abilities;
  // Marked against the species: a Mega's single fixed ability is never a hidden one, and the table
  // only ever marks abilities the catalog already lists for this Pokémon.
  const hiddenAbilityIds = hiddenAbilityIdsByPokemonId[entry.basePokemon.id] ?? [];
  const entryMoves = useMemo(() => currentRuleMovesForPokemon(entry.basePokemon.id), [entry.basePokemon.id]);
  const visibleMoves = useMemo(
    () => sortMoves(filterMovesByQuery(entryMoves, moveQuery), moveSortKey),
    [entryMoves, moveQuery, moveSortKey],
  );

  const statTotal = Object.values(entry.baseStats).reduce((a, b) => a + b, 0);
  const matchups = attackingTypes
    .map((type) => ({ type, multiplier: defensiveMatchupMultiplier(type, entry.types) }))
    .filter(({ multiplier }) => multiplier !== 1);
  const weaknesses = matchups
    .filter(({ multiplier }) => multiplier > 1)
    .sort((a, b) => b.multiplier - a.multiplier || typeOrder[a.type] - typeOrder[b.type]);
  const resistances = matchups
    .filter(({ multiplier }) => multiplier < 1)
    .sort((a, b) => b.multiplier - a.multiplier || typeOrder[a.type] - typeOrder[b.type]);

  const metrics = pokemonPhysicalMetricsByDexNo[entry.basePokemon.nationalDexNo];
  const heightLabel = formatHeight(metrics?.heightDm);
  const weightLabel = formatWeight(metrics?.weightHg);

  // Which team it lands in is always asked (the same sheet 环境 uses). Writing silently into the
  // first team is what made this button look dead: a full team, a duplicate or no team at all
  // each returned without a word.
  const buildMember = (team: Team): TeamMember => {
    const member = createDefaultTeamMember({
      pokemonId: entry.basePokemon.id,
      formId: entry.id,
      abilityId: entry.abilities[0],
      // A held item is unique within a team; a clash leaves the slot empty for the user to sort out.
      itemId: team.members.some((existing) => existing.itemId && existing.itemId === entry.requiredItemId)
        ? undefined
        : entry.requiredItemId,
      notes: '从图鉴加入。',
    });
    return { ...member, legalityStatus: evaluateMemberLegality(member, team).status };
  };

  const addToTeam = async (team: Team) => {
    setPickingTeam(false);
    const result = await updateMember(team.id, buildMember(team));
    setNotice(result.ok ? `已加入${team.name}` : result.message);
  };

  const addToNewTeam = async () => {
    setPickingTeam(false);
    // `teams` in this render does not know about the fresh team yet, so the member is written
    // through the returned object instead of going back through `updateMember`.
    const team = await addTeam();
    await saveTeam({ ...team, members: [buildMember(team)] });
    setNotice(`已加入${team.name}`);
  };

  return (
    <div>
      <div className="px-6 pt-5">
        <button
          aria-label="返回图鉴列表"
          className="grid h-9 w-9 place-items-center rounded-full bg-surface text-textLabel"
          type="button"
          onClick={onBack}
        >
          <ChevronLeft size={20} />
        </button>
      </div>

      <div className="flex items-center gap-4 px-6 pt-2.5">
        <button
          aria-label={`查看${entry.chineseName}大图`}
          className="shrink-0"
          type="button"
          onClick={() => setShowArtwork(true)}
        >
          <Sprite iconRef={entry.iconRef} label={entry.chineseName} size={84} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">{entry.chineseName}</h1>
          <p className="mt-1 text-xs font-bold tracking-[0.1em] text-textSecondary">
            {entry.japaneseName} · {formatDexNo(entry.basePokemon.nationalDexNo)}
          </p>
          <p className="mt-2.5 flex items-center gap-2.5 text-xs font-bold text-textLabel">
            {entry.types.map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <TypeDot size={8} type={type} />
                {typeLabelByValue[type]}
              </span>
            ))}
          </p>
        </div>
      </div>

      <section className="px-6 pt-6">
        <SectionHeading title="种族值" trailing={`总和 ${statTotal}`} />
        <div className="mt-3 flex flex-col gap-2.5">
          {statRows(entry.baseStats).map(([label, value], _index, rows) => {
            // The lit bar is this Pokémon's best stat (every one of them on a tie), not a fixed row.
            const isBest = value === Math.max(...rows.map(([, other]) => other));
            return (
              <div key={label} className="flex items-center gap-3">
                <span className={`w-[34px] shrink-0 text-xs ${isBest ? 'font-bold text-textPrimary' : 'font-semibold text-textSecondary'}`}>
                  {statLabels[label]}
                </span>
                <span className="lk-p4a-stat-track h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
                  <span
                    className={`block h-full ${isBest ? 'bg-data' : 'bg-btnDisabledInk'}`}
                    style={{ width: `${Math.min(100, (value / STAT_BAR_CEILING) * 100)}%` }}
                  />
                </span>
                <span className="w-8 text-right text-sm font-extrabold tabular-nums">{value}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-6 pt-[26px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">属性关系</h2>
          <span className="shrink-0 text-xs font-normal text-textSecondary">受到攻击时</span>
        </div>
        <MatchupGroup rows={weaknesses} title="弱点" tone="danger" />
        <MatchupGroup rows={resistances} title="抵抗与免疫" tone="success" />
      </section>

      <section className="px-6 pt-[26px]">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">基础资料</h2>
        <div className="mt-2.5">
          {[
            heightLabel ? (['身高', heightLabel] as const) : undefined,
            weightLabel ? (['体重', weightLabel] as const) : undefined,
            ['图鉴编号', formatDexNo(entry.basePokemon.nationalDexNo)] as const,
          ]
            .filter(Boolean)
            .map((row, index, rows) => (
              <div
                key={row![0]}
                className={`flex h-[60px] items-center gap-3 ${index === rows.length - 1 ? '' : 'border-b border-[var(--hairline)]'}`}
              >
                <span className="min-w-0 flex-1 text-[15px] font-semibold text-textSecondary">{row![0]}</span>
                <span className="shrink-0 text-xl font-extrabold tabular-nums">{row![1]}</span>
              </div>
            ))}
        </div>
      </section>

      {/* A plain list: no card fill and no disclosure, every ability reads its whole effect at
          once, hairlines only. A hidden ability (「梦特」) is marked by the colour of its name and
          nothing else. */}
      <section className="px-6 pt-[26px]">
        <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">特性</h2>
        <div className="mt-2.5">
          {entryAbilities.map((ability, index) => (
            <div
              key={ability.id}
              className={`py-3.5 ${index === entryAbilities.length - 1 ? '' : 'border-b border-[var(--hairline)]'}`}
            >
              <p className="flex items-baseline gap-2">
                <span
                  className={`min-w-0 truncate text-[17px] font-bold tracking-[-0.01em] ${
                    hiddenAbilityIds.includes(ability.id) ? 'text-data' : ''
                  }`}
                >
                  {ability.chineseName}
                </span>
                <span className="shrink-0 text-xs font-semibold tracking-[0.04em] text-chevron">{ability.englishName}</span>
              </p>
              <p className="mt-2 text-[13px] font-semibold leading-5 text-textLabel">{ability.effectSummary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pt-[26px]">
        <SectionHeading title="可学会招式" trailing={String(entryMoves.length)} />
        <label className="mt-3 flex h-10 items-center gap-2.5 rounded-xl bg-surface px-3">
          <Search className="shrink-0 text-chevron" size={16} />
          <input
            aria-label="搜索当前宝可梦招式"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-textSecondary"
            placeholder="搜索当前宝可梦招式"
            type="text"
            value={moveQuery}
            onChange={(event) => setMoveQuery(event.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {moveSortOptions.map((option) => (
            <button
              key={option.id}
              aria-pressed={moveSortKey === option.id}
              className={`inline-flex h-8 items-center rounded-full px-3 text-[13px] ${
                moveSortKey === option.id ? 'lk-pill-on font-bold text-textPrimary' : 'bg-surface font-semibold text-textLabel'
              }`}
              type="button"
              onClick={() => setMoveSortKey(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-xs font-semibold text-textSecondary">变化招式置后</p>
        <div className="mt-2">
          {visibleMoves.map((move, index) => {
            const expanded = expandedMoveId === move.id;
            const divider = index === visibleMoves.length - 1 ? '' : 'border-b border-[var(--hairline)]';
            if (expanded) {
              return (
                <div key={move.id} className={`lk-row-active -mx-6 px-6 py-3.5 ${divider}`}>
                  <button
                    aria-expanded
                    aria-label={`收起${move.chineseName}说明`}
                    className="flex w-full items-center gap-3 text-left"
                    type="button"
                    onClick={() => setExpandedMoveId(null)}
                  >
                    <TypeDot size={9} type={move.type} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-extrabold tracking-[-0.01em] text-textPrimary">{move.chineseName}</span>
                      <span className="mt-[3px] block truncate text-xs font-semibold text-textLabel">{learnableMoveMeta(move)}</span>
                    </span>
                    <ChevronUp className="shrink-0 text-textPrimary" size={18} />
                  </button>
                  <p className="mt-2.5 text-[13px] font-semibold leading-[18px] text-textLabel">{move.effectSummary}</p>
                </div>
              );
            }
            return (
              <button
                key={move.id}
                aria-expanded={false}
                aria-label={`展开${move.chineseName}说明`}
                className={`flex h-[60px] w-full items-center gap-3 text-left ${divider}`}
                type="button"
                onClick={() => setExpandedMoveId(move.id)}
              >
                <TypeDot size={9} type={move.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold tracking-[-0.01em]">{move.chineseName}</span>
                  <span className="mt-[3px] block truncate text-xs font-semibold text-textSecondary">{learnableMoveMeta(move)}</span>
                </span>
                <ChevronDown className="shrink-0 text-chevron" size={18} />
              </button>
            );
          })}
        </div>
      </section>

      {/* N04-09 anchors the two actions to the bottom edge; the floating nav sits below them, so
          the bar's own padding keeps the buttons clear of it — home-indicator inset included,
          since the nav rides on top of that inset too. */}
      <div className="sticky bottom-0 z-10 mt-6 flex gap-2.5 bg-gradient-to-t from-page via-page/70 to-transparent px-6 pb-[calc(86px+env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <button
          className="lk-btn-primary inline-flex h-[50px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-base font-extrabold text-page"
          type="button"
          onClick={() => setPickingTeam(true)}
        >
          加入队伍
        </button>
        <button
          className="inline-flex h-[50px] shrink-0 items-center justify-center gap-[7px] rounded-2xl bg-btn1 px-[18px] text-base font-bold text-textLabel"
          type="button"
          onClick={() => onOpenCalculator(entry.basePokemon.id)}
        >
          <Swords size={17} />
          计算
        </button>
      </div>

      {showArtwork && <LargeArtwork entry={entry} onClose={() => setShowArtwork(false)} />}
      {pickingTeam && (
        <TeamPickerSheet
          choices={teamChoicesFor(teams, entry.basePokemon.id)}
          pokemonName={entry.chineseName}
          onClose={() => setPickingTeam(false)}
          onCreate={addToNewTeam}
          onPick={addToTeam}
        />
      )}
      {notice && <Toast title={notice} />}
    </div>
  );
}
