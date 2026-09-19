import { ChevronDown, ChevronRight, ChevronUp, Wind } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { currentRuleNatureOptions, currentRuleSet, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { speedTierSeason, speedTierSnapshots } from '../data/speedTiers';
import { findBattleForm, getDexFormEntries, type BattleFormView, type DexFormEntry } from '../lib/pokemonForms';
import {
  buildOutspeedPlan,
  calculateSpeedForBuild,
  CHOICE_SCARF_ID,
  getPokemonSpeedAbility,
  getPokemonUsageRate,
  getScarfUsageRate,
  getSpeedAbilityProfile,
  groupTiersBySpeed,
  markerInsertIndex,
  sortVariantsByUsage,
  SCARF_SUGGESTION_USAGE_THRESHOLD,
  type OutspeedPlanOption,
  type SpeedAbilityProfile,
  type SpeedBuild,
  type SpeedNature,
  type SpeedTierGroup,
} from '../lib/speedTier';
import { MAX_STAT_POINTS_PER_STAT } from '../lib/statPoints';
import { recordToolResult } from '../lib/toolActivity';
import type { Pokemon, Team, TeamMember } from '../types';
import { ListRow, PageHeader, Pill, SearchField, SectionLabel, Sheet, Sprite, Switch } from '../components/kit';

type BattleType = 'singles' | 'doubles';
type MarkerOffscreen = 'up' | 'down' | null;

/** Debounce before a settled build reaches 04-01's card. */
const RESULT_RECORD_DELAY_MS = 800;
/** Tier rows the card's sparkline shows around the member, the member's own bar included. */
const SPARKLINE_WINDOW = 6;

const groupPrimaryLabel = (group: SpeedTierGroup) => group.variants[0].displayLabel;

const groupRoster = (group: SpeedTierGroup) =>
  group.variants.flatMap((variant) =>
    variant.pokemon.map((entry) => ({ key: `${variant.code}-${entry.key}`, label: entry.displayName, variant: variant.label, iconRef: entry.iconRef })),
  );

/** `tierSpeeds` runs fastest → slowest and the member's own bar belongs at `markerIndex`. */
const sparklineWindow = (tierSpeeds: number[], markerIndex: number, finalSpeed: number) => {
  const neighbours = SPARKLINE_WINDOW - 1;
  const start = Math.max(0, Math.min(markerIndex - Math.floor(neighbours / 2), tierSpeeds.length - neighbours));
  const around = tierSpeeds.slice(start, start + neighbours);
  const index = Math.max(0, Math.min(markerIndex - start, around.length));
  return { speeds: [...around.slice(0, index), finalSpeed, ...around.slice(index)], index };
};

const natureFromMember = (member?: TeamMember): SpeedNature => {
  const option = currentRuleNatureOptions.find((candidate) => member?.nature.includes(candidate.id));
  if ((option?.up as readonly string[] | undefined)?.includes('速度')) return 'increased';
  if ((option?.down as readonly string[] | undefined)?.includes('速度')) return 'decreased';
  return 'neutral';
};

const createBuild = (entry: Pokemon, form: BattleFormView | undefined, member?: TeamMember): SpeedBuild => ({
  baseSpeed: form?.baseStats.speed ?? entry.baseStats.speed,
  statPoints: member?.statPoints.speed ?? MAX_STAT_POINTS_PER_STAT,
  nature: natureFromMember(member),
  scarf: member?.itemId === CHOICE_SCARF_ID,
  speedAbility: false,
  tailwind: false,
});

// ── Outspeed sheet (05-06 / N05-17 / N05-18) ──

function PlanRow({
  option,
  currentFinal,
  onApply,
  divider,
}: {
  option: OutspeedPlanOption;
  currentFinal: number;
  onApply: (option: OutspeedPlanOption) => void;
  divider: boolean;
}) {
  const leading = option.build.scarf ? (
    <Sprite iconRef="/assets/items/choice-scarf.png" label="讲究围巾" size={26} />
  ) : option.build.tailwind ? (
    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center text-textSecondary">
      <Wind size={20} />
    </span>
  ) : undefined;

  return (
    <ListRow
      ariaLabel="应用此方案"
      divider={divider}
      height={60}
      leading={leading}
      subtitle={`${currentFinal} → ${option.finalSpeed} · 超出 ${option.margin}`}
      title={<span className="text-[15px]">{option.deltas.join(' + ')}</span>}
      trailing={<span className="shrink-0 text-[13px] font-bold text-textPrimary">应用</span>}
      onClick={() => onApply(option)}
    />
  );
}

function OutspeedSheet({
  group,
  build,
  scarfUsageRate,
  ability,
  onApply,
  onClose,
}: {
  group: SpeedTierGroup;
  build: SpeedBuild;
  scarfUsageRate: number;
  ability?: SpeedAbilityProfile;
  onApply: (option: OutspeedPlanOption) => void;
  onClose: () => void;
}) {
  const scarfEligible = scarfUsageRate >= SCARF_SUGGESTION_USAGE_THRESHOLD;
  const plan = buildOutspeedPlan({ target: group.speed, current: build, scarfEligible, speedAbility: ability });
  const roster = groupRoster(group).slice(0, 8);

  return (
    <Sheet label={`超速 ${group.speed}`} variant="handle" onClose={onClose}>
      <SectionLabel>超速目标</SectionLabel>
      <p className="mt-1.5 flex items-baseline gap-2.5">
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{group.speed}</span>
        <span className="text-sm font-bold text-textSecondary">{groupPrimaryLabel(group)}</span>
      </p>

      <SectionLabel className="pt-3.5">这条线上的宝可梦</SectionLabel>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {roster.map((entry) => (
          <Sprite key={entry.key} iconRef={entry.iconRef} label={entry.label} size={40} />
        ))}
      </div>

      {plan.status === 'already' && (
        <div className="mt-4 rounded-[14px] bg-success/[0.12] p-3.5">
          <p className="text-sm font-extrabold text-success">已经更快 · 快 {plan.gap} 点</p>
          <p className="mt-1 text-xs font-semibold leading-[18px] text-textLabel">
            当前 {plan.currentFinal}，这条线 {group.speed}。不需要任何手段。
          </p>
        </div>
      )}

      {plan.status === 'infeasible' && (
        <div className="mt-4 rounded-[14px] bg-surface p-3.5">
          <p className="text-sm font-extrabold">当前手段无法超速</p>
          <p className="mt-1 text-xs font-semibold leading-[18px] text-textLabel">
            速度 SP 拉满 {MAX_STAT_POINTS_PER_STAT}、换讲究围巾、开顺风全用上，最高 {plan.bestFinal}，仍然差 {group.speed - plan.bestFinal + 1} 点。
          </p>
        </div>
      )}

      {plan.status === 'suggestions' && (
        <>
          <div className="mt-4 rounded-[14px] bg-danger/[0.12] p-3.5">
            <p className="text-sm font-extrabold text-danger">还差 {group.speed - plan.currentFinal + 1} 点</p>
            <p className="mt-1 text-xs font-semibold text-textLabel">
              当前 {plan.currentFinal}，需要 {group.speed + 1} 才能先手。
            </p>
          </div>
          <SectionLabel className="pt-4">超速方案</SectionLabel>
          <div className="mt-2">
            <PlanRow currentFinal={plan.currentFinal} divider={Boolean(plan.safer)} option={plan.primary} onApply={onApply} />
            {plan.safer && <PlanRow currentFinal={plan.currentFinal} divider={false} option={plan.safer} onApply={onApply} />}
          </div>
        </>
      )}

      {!scarfEligible && !build.scarf && (
        <p className="mt-3 text-xs font-semibold leading-[18px] text-textSecondary">
          围巾环境携带率 {scarfUsageRate.toFixed(1)}%，未过 {SCARF_SUGGESTION_USAGE_THRESHOLD}% 门槛，默认不建议占用围巾位。
        </p>
      )}
    </Sheet>
  );
}

/**
 * One tier line (05-05) plus N05-16's form breakdown. The row itself opens the outspeed sheet
 * — the frame's 「点档位看方案」 — so the expander is its own button rather than a nested
 * click target inside it.
 */
function TierRow({
  group,
  difference,
  expanded,
  onToggle,
  onOpen,
}: {
  group: SpeedTierGroup;
  difference: number;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const roster = groupRoster(group);
  const expandable = roster.length > 1;

  return (
    <>
      <div className="flex items-center border-b border-[var(--hairline)]">
        <button
          aria-label={`超速 实数 ${group.speed}，${groupPrimaryLabel(group)}，共 ${group.pokemonCount} 只`}
          className="flex h-[60px] min-w-0 flex-1 items-center gap-3 text-left"
          type="button"
          onClick={onOpen}
        >
          <span className="w-11 shrink-0 text-[20px] font-extrabold tabular-nums text-textSecondary">{group.speed}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-textSecondary">{groupPrimaryLabel(group)}</span>
          <span className={`shrink-0 text-xs font-bold ${difference > 0 ? 'text-danger' : difference < 0 ? 'text-success' : 'text-textLabel'}`}>
            {difference > 0 ? `快 ${difference}` : difference < 0 ? `慢 ${-difference}` : '同速'}
          </span>
        </button>
        {expandable && (
          <button
            aria-expanded={expanded}
            aria-label={`${group.speed} 这条线上的 ${roster.length} 个形态`}
            className="grid h-[60px] w-8 shrink-0 place-items-center text-chevron"
            type="button"
            onClick={onToggle}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>
      {expandable && expanded && (
        <div className="-mx-6 border-b border-[var(--hairline)] bg-sunken px-6 py-1.5">
          {roster.map((entry, index) => (
            <div key={entry.key} className={`flex h-11 items-center gap-3 ${index > 0 ? 'border-t border-[var(--hairline)]' : ''}`}>
              <span className="w-11 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-textLabel">{entry.label}</span>
              <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-btn1 px-2.5 text-[11px] font-extrabold text-textLabel">
                {entry.variant}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Page ──

export function SpeedPage({
  environment,
  activeTeam,
  presetMember,
  onOpenDex,
}: {
  environment: EnvironmentState;
  activeTeam?: Team;
  presetMember?: TeamMember;
  onOpenDex?: () => void;
}) {
  // Open on a neutral default that is independent of any team. Carrying a specific member's
  // config only happens via an explicit "send to speed" (presetMember, below).
  const defaultPokemon = pokemon.find((entry) => entry.id === 'staraptor') ?? pokemon[0];
  const [battleType, setBattleType] = useState<BattleType>(currentRuleSet.battleType);
  const [selectedPokemonId, setSelectedPokemonId] = useState(defaultPokemon.id);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>(undefined);
  const [build, setBuild] = useState(() => createBuild(defaultPokemon, findBattleForm(defaultPokemon.id, undefined)));
  const [query, setQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<SpeedTierGroup | null>(null);
  const [expandedTier, setExpandedTier] = useState<number | null>(null);
  const [markerOffscreen, setMarkerOffscreen] = useState<MarkerOffscreen>(null);
  // The opening pokemon is a neutral default, not a choice — 04-01 only speaks for a member the
  // user actually settled on.
  const [memberChosen, setMemberChosen] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);

  const selected = pokemon.find((entry) => entry.id === selectedPokemonId) ?? defaultPokemon;
  const selectedForm = findBattleForm(selected.id, selectedFormId) ?? findBattleForm(selected.id, selected.id);
  const selectedName = selectedForm?.chineseName ?? selected.chineseName;
  const selectedFormIconRef = selectedForm?.iconRef;
  const selectedIconRef = selected.iconRef;
  const matchingMember = activeTeam?.members.find(
    (member) => member.pokemonId === selected.id && (member.formId ?? selected.id) === (selectedForm?.id ?? selected.id),
  );
  const memberAbility = getSpeedAbilityProfile(matchingMember?.abilityId);
  const availableAbility = matchingMember ? memberAbility : getPokemonSpeedAbility(selectedForm?.abilities ?? selected.abilities);
  const finalSpeed = calculateSpeedForBuild(build);
  const scarfUsageRate = getScarfUsageRate(environment, selected.id, battleType);
  const snapshot = speedTierSnapshots.find((entry) => entry.rule === (battleType === 'singles' ? 0 : 1)) ?? speedTierSnapshots[0];
  const tiers = useMemo(
    () => sortVariantsByUsage(groupTiersBySpeed(snapshot.tiers), (pid) => getPokemonUsageRate(environment, pid, battleType)),
    [snapshot, environment, battleType],
  );
  const markerIndex = markerInsertIndex(tiers, finalSpeed);

  // Base species + mega forms as independent entries (dex mapping), so a mega is searchable on
  // its own instead of via a separate form picker.
  const legalForms = useMemo(() => getDexFormEntries().filter((entry) => entry.legalInCurrentRule), []);
  const trimmedQuery = query.trim();
  const matchesQuery = useCallback(
    (entry: DexFormEntry) => {
      const needle = trimmedQuery.toLowerCase();
      return (
        entry.chineseName.includes(trimmedQuery) ||
        entry.englishName.toLowerCase().includes(needle) ||
        String(entry.baseStats.speed).includes(needle)
      );
    },
    [trimmedQuery],
  );
  const searchResults = useMemo(() => (trimmedQuery ? legalForms.filter(matchesQuery) : []), [legalForms, matchesQuery, trimmedQuery]);

  const updateMarkerOffscreen = useCallback(() => {
    const node = markerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    // jsdom (and an unlaid-out tree) reports a zero-height rect; treat that as "in view".
    if (rect.height === 0) {
      setMarkerOffscreen(null);
      return;
    }
    if (rect.bottom < 72) setMarkerOffscreen('up');
    else if (rect.top > window.innerHeight - 120) setMarkerOffscreen('down');
    else setMarkerOffscreen(null);
  }, []);

  useEffect(() => {
    updateMarkerOffscreen();
    window.addEventListener('scroll', updateMarkerOffscreen, { passive: true });
    window.addEventListener('resize', updateMarkerOffscreen);
    return () => {
      window.removeEventListener('scroll', updateMarkerOffscreen);
      window.removeEventListener('resize', updateMarkerOffscreen);
    };
  }, [updateMarkerOffscreen]);

  const updateBuild = (patch: Partial<SpeedBuild>) => setBuild((current) => ({ ...current, ...patch }));

  const selectForm = (entry: DexFormEntry) => {
    const member = activeTeam?.members.find(
      (candidate) => candidate.pokemonId === entry.pokemonId && (candidate.formId ?? entry.pokemonId) === entry.id,
    );
    setSelectedPokemonId(entry.pokemonId);
    setSelectedFormId(entry.id === entry.pokemonId ? undefined : entry.id);
    setBuild({
      baseSpeed: entry.baseStats.speed,
      statPoints: member?.statPoints.speed ?? MAX_STAT_POINTS_PER_STAT,
      nature: natureFromMember(member),
      scarf: member?.itemId === CHOICE_SCARF_ID,
      speedAbility: false,
      tailwind: false,
    });
    setQuery('');
    setMemberChosen(true);
  };

  // Jump-in from a team member: carry the saved pokemon/form/nature/scarf/SP.
  const presetAppliedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!presetMember || presetAppliedRef.current === presetMember.id) return;
    const entry = pokemon.find((candidate) => candidate.id === presetMember.pokemonId);
    if (!entry) return;
    presetAppliedRef.current = presetMember.id;
    setSelectedPokemonId(entry.id);
    setSelectedFormId(presetMember.formId);
    setBuild(createBuild(entry, findBattleForm(entry.id, presetMember.formId), presetMember));
    setMemberChosen(true);
  }, [presetMember]);

  // 04-01's 速度线 card. Debounced so dragging the SP slider does not write a row per frame.
  useEffect(() => {
    if (!memberChosen) return;
    const timer = window.setTimeout(() => {
      const nextTier = markerIndex > 0 ? tiers[markerIndex - 1] : undefined;
      const plan = nextTier
        ? buildOutspeedPlan({
            target: nextTier.speed,
            current: build,
            scarfEligible: scarfUsageRate >= SCARF_SUGGESTION_USAGE_THRESHOLD,
            speedAbility: availableAbility,
          })
        : undefined;
      // 「超 N 档需 +M」 only holds when the cheapest plan is speed SP alone on the same nature.
      const extraStatPoints =
        plan?.status === 'suggestions' && plan.primary.rung === 'investment' && plan.primary.build.nature === build.nature
          ? plan.primary.build.statPoints - build.statPoints
          : 0;
      const sparkline = sparklineWindow(tiers.map((group) => group.speed), markerIndex, finalSpeed);
      recordToolResult({
        tool: 'speed',
        label: selectedName,
        iconRef: selectedFormIconRef ?? selectedIconRef,
        speed: finalSpeed,
        nextTierSpeed: extraStatPoints > 0 ? nextTier?.speed : undefined,
        nextTierStatPoints: extraStatPoints > 0 ? extraStatPoints : undefined,
        window: sparkline.speeds,
        windowIndex: sparkline.index,
      });
    }, RESULT_RECORD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    availableAbility,
    build,
    finalSpeed,
    markerIndex,
    memberChosen,
    scarfUsageRate,
    selectedFormIconRef,
    selectedIconRef,
    selectedName,
    tiers,
  ]);

  const scrollToMarker = () => markerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const speedAfter = (patch: Partial<SpeedBuild>) => calculateSpeedForBuild({ ...build, ...patch });

  return (
    <div className="pb-8">
      <PageHeader
        className="px-6 pt-5"
        subtitle={trimmedQuery ? '换一只来看它在哪一档' : `PokeDB M-${speedTierSeason} 静态参照 · 上下滑动看档位`}
        title="速度线"
      />

      <SearchField className="mx-6 mt-4" label="搜索宝可梦" placeholder="名称 / 速度种族值" value={query} onChange={setQuery} />

      {trimmedQuery ? (
        <>
          <p className="px-6 pt-2.5 text-xs font-semibold text-textSecondary">{searchResults.length} 个结果</p>
          <div className="mt-2 px-6">
            {searchResults.slice(0, 40).map((entry, index) => (
              <ListRow
                key={entry.id}
                active={entry.id === (selectedForm?.id ?? selected.id)}
                ariaLabel={`${entry.chineseName} ${entry.englishName}`}
                bleed
                divider={index < Math.min(searchResults.length, 40) - 1}
                height={68}
                leading={<Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />}
                subtitle={`${entry.englishName} · 速度种族值 ${entry.baseStats.speed}`}
                title={entry.chineseName}
                onClick={() => selectForm(entry)}
              />
            ))}
          </div>
          {searchResults.length === 0 && (
            <div className="px-6 pt-5">
              <h2 className="text-[20px] font-extrabold leading-7 tracking-[-0.01em]">当前规则里没有这只</h2>
              <p className="mt-2 text-[13px] font-semibold leading-5 text-textSecondary">
                「{trimmedQuery}」不在 {currentRuleSet.name} 规则内，所以速度线里没有它的档位。
              </p>
              <div className="mt-4 flex gap-2">
                <Pill onClick={() => setQuery('')}>显示全部 {legalForms.length} 只</Pill>
                {onOpenDex && (
                  <Pill onClick={onOpenDex}>
                    去规则内图鉴
                    <ChevronRight size={14} />
                  </Pill>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mx-6 mt-4 flex gap-2">
            <Pill selected={battleType === 'doubles'} onClick={() => setBattleType('doubles')}>
              双打
            </Pill>
            <Pill selected={battleType === 'singles'} onClick={() => setBattleType('singles')}>
              单打
            </Pill>
          </div>

          <section className="mx-6 mt-[18px] rounded-[18px] bg-surface p-4">
            <div className="flex items-center gap-3.5">
              <Sprite iconRef={selectedForm?.iconRef ?? selected.iconRef} label={selectedName} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-extrabold tracking-[-0.01em]">{selectedName}</p>
                <p className="mt-[3px] text-xs font-semibold text-textSecondary">速度种族值 {build.baseSpeed}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-textSecondary">最终速度</p>
                <p className="mt-0.5 text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-data">{finalSpeed}</p>
              </div>
            </div>

            <div className="mt-3.5 flex gap-2">
              <Pill
                grow
                selected={build.nature === 'increased'}
                tone="plain"
                onClick={() => updateBuild({ nature: 'increased' })}
              >
                ＋ 速度性格
              </Pill>
              <Pill grow selected={build.nature === 'neutral'} tone="plain" onClick={() => updateBuild({ nature: 'neutral' })}>
                无修正
              </Pill>
              <Pill
                grow
                selected={build.nature === 'decreased'}
                tone="plain"
                onClick={() => updateBuild({ nature: 'decreased' })}
              >
                − 速度性格
              </Pill>
            </div>

            <div className="mt-3.5 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-textSecondary">速度 SP</span>
              <span className="text-sm font-extrabold tabular-nums text-data">
                {build.statPoints} / {MAX_STAT_POINTS_PER_STAT}
              </span>
            </div>
            <input
              aria-label="速度 SP"
              className="lk-speed-slider mt-2"
              max={MAX_STAT_POINTS_PER_STAT}
              min={0}
              step={1}
              style={{ '--lk-slider-fill': `${(build.statPoints / MAX_STAT_POINTS_PER_STAT) * 100}%` } as React.CSSProperties}
              type="range"
              value={build.statPoints}
              onChange={(event) => updateBuild({ statPoints: Number(event.target.value) })}
            />
          </section>

          <div className="px-6 pt-[22px]">
            <SectionLabel>加速手段</SectionLabel>
            <div className="mt-1.5">
              <ListRow
                height={60}
                subtitle={`×1.5 · ${finalSpeed} → ${speedAfter({ scarf: !build.scarf })}，锁一招`}
                title={<span className="text-[15px]">讲究围巾</span>}
                trailing={<Switch checked={build.scarf} label="讲究围巾" onChange={(next) => updateBuild({ scarf: next })} />}
              />
              <ListRow
                divider={Boolean(availableAbility)}
                height={60}
                subtitle={`×2 · ${finalSpeed} → ${speedAfter({ tailwind: !build.tailwind })}，四回合内有效`}
                title={<span className="text-[15px]">顺风</span>}
                trailing={<Switch checked={build.tailwind} label="顺风" onChange={(next) => updateBuild({ tailwind: next })} />}
              />
              {availableAbility && (
                <ListRow
                  divider={false}
                  height={60}
                  subtitle={`速度特性 · ${availableAbility.requirement} ×2`}
                  title={<span className="text-[15px]">{availableAbility.label}</span>}
                  trailing={
                    <Switch
                      checked={build.speedAbility}
                      label={availableAbility.label}
                      onChange={(next) => updateBuild({ speedAbility: next })}
                    />
                  }
                />
              )}
            </div>
          </div>

          <div className="px-6 pt-[22px]">
            <SectionLabel trailing="点档位看方案">环境速度梯队</SectionLabel>
            <div className="mt-2.5" data-speed-axis>
              {tiers.map((group, index) => (
                <div key={group.speed}>
                  {index === markerIndex && renderMarker()}
                  <TierRow
                    difference={group.speed - finalSpeed}
                    expanded={expandedTier === group.speed}
                    group={group}
                    onOpen={() => setSelectedTier(group)}
                    onToggle={() => setExpandedTier(expandedTier === group.speed ? null : group.speed)}
                  />
                </div>
              ))}
              {markerIndex >= tiers.length && renderMarker()}
            </div>
          </div>

          {markerOffscreen && (
            <button
              aria-label={`回到我，位于${markerOffscreen === 'up' ? '上方' : '下方'}`}
              className="lk-float-pill fixed bottom-[88px] left-1/2 z-30 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-elevated/90 px-[18px] text-sm font-bold text-textPrimary backdrop-blur-lg"
              type="button"
              onClick={scrollToMarker}
            >
              {markerOffscreen === 'up' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              回到我 · {finalSpeed}
            </button>
          )}
        </>
      )}

      {selectedTier && (
        <OutspeedSheet
          ability={availableAbility}
          build={build}
          group={selectedTier}
          scarfUsageRate={scarfUsageRate}
          onApply={(option) => {
            setBuild(option.build);
            setSelectedTier(null);
          }}
          onClose={() => setSelectedTier(null)}
        />
      )}
    </div>
  );

  function renderMarker() {
    return (
      <div
        key="speed-marker"
        ref={markerRef}
        className="lk-marker flex h-[60px] items-center gap-3 rounded-[14px] px-3"
        data-speed-marker
      >
        <span className="w-11 shrink-0 text-[20px] font-extrabold tabular-nums text-textPrimary">{finalSpeed}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-textPrimary">我的{selectedName}</span>
      </div>
    );
  }
}
