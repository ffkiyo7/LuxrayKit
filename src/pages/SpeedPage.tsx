import { ArrowDown, ArrowUp, Check, ChevronDown, Search, Wind, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { currentRuleNatureOptions, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { speedTierSeason, speedTierSnapshots } from '../data/speedTiers';
import { findBattleForm, getDexFormEntries, type BattleFormView, type DexFormEntry } from '../lib/pokemonForms';
import {
  buildOutspeedPlan,
  calculateSpeedForBuild,
  CHOICE_SCARF_ID,
  getPokemonSpeedAbility,
  getScarfUsageRate,
  getSpeedAbilityProfile,
  groupTiersBySpeed,
  markerInsertIndex,
  SCARF_SUGGESTION_USAGE_THRESHOLD,
  speedNatureLabel,
  type OutspeedPlanOption,
  type SpeedAbilityProfile,
  type SpeedBuild,
  type SpeedNature,
  type SpeedTierGroup,
} from '../lib/speedTier';
import { MAX_STAT_POINTS_PER_STAT } from '../lib/statPoints';
import type { Pokemon, Team, TeamMember } from '../types';
import { Button, Card, OverlappingAvatars, PokemonAvatar } from '../components/ui';

type BattleType = 'singles' | 'doubles';
type ScrollDirection = 'up' | 'down' | null;

const ROW_HEIGHT = 46;
const AXIS_PAD = 64;
const AXIS_AVATAR_LIMIT = 5;
const SHEET_AVATAR_LIMIT = 12;

const groupAvatarItems = (group: SpeedTierGroup) =>
  group.variants.flatMap((variant) => variant.pokemon).map((entry) => ({ key: entry.key, iconRef: entry.iconRef, label: entry.displayName }));

const groupPrimaryLabel = (group: SpeedTierGroup) => group.variants[0].displayLabel;

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

function PlanCard({ option, recommended, onApply }: { option: OutspeedPlanOption; recommended?: boolean; onApply: (option: OutspeedPlanOption) => void }) {
  return (
    <section className={`rounded-lg border p-3 ${recommended ? 'border-accent bg-accent/10 shadow-[0_0_18px_rgb(var(--color-accent)/0.15)]' : 'border-border bg-secondary'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          {recommended && <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[9px] font-bold text-page">推荐</span>}
          <span className="truncate">{option.deltas.join(' + ')}</span>
        </p>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold leading-none text-accent">{option.finalSpeed}</p>
          <p className="mt-0.5 text-[10px] text-success">超出 +{option.margin}</p>
        </div>
      </div>
      <Button className="mt-3 w-full" type="button" onClick={() => onApply(option)}>
        <Check size={14} />
        应用此方案
      </Button>
    </section>
  );
}

function VariantRoster({ variant }: { variant: SpeedTierGroup['variants'][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-secondary p-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: variant.color }} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{variant.displayLabel}</span>
        <button
          className="shrink-0 text-[11px] font-semibold text-accent"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      {expanded ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-divider pt-2">
          {variant.pokemon.map((entry) => (
            <div key={entry.key} className="flex min-w-0 items-center gap-1.5">
              <PokemonAvatar iconRef={entry.iconRef} label={entry.displayName} size="xs" />
              <span className="truncate text-[11px]">{entry.displayName}</span>
            </div>
          ))}
        </div>
      ) : (
        <OverlappingAvatars
          className="mt-2"
          items={variant.pokemon.map((entry) => ({ key: entry.key, iconRef: entry.iconRef, label: entry.displayName }))}
          limit={SHEET_AVATAR_LIMIT}
        />
      )}
    </div>
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

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px]" role="dialog" aria-label={`超速 实数 ${group.speed}`} aria-modal="true">
      <button className="absolute inset-0 h-full w-full bg-overlay/75" type="button" aria-label="关闭超速方案" onClick={onClose} />
      <section className="surface-shadow absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-textSecondary">超速目标</p>
            <p className="text-lg font-bold tabular-nums">实数 {group.speed}</p>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" type="button" aria-label="关闭超速方案" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 space-y-2">
          <p className="text-[11px] font-semibold text-textSecondary">这条线上的宝可梦</p>
          {group.variants.map((variant) => (
            <VariantRoster key={`${variant.label}-${variant.code}`} variant={variant} />
          ))}
        </div>

        {plan.status === 'already' && (
          <div className="rounded-lg border border-success/30 bg-legalBg p-4">
            <p className="font-semibold text-success">你已经更快 +{plan.gap}</p>
            <p className="mt-1 text-xs text-textSecondary">当前配置无需调整。</p>
          </div>
        )}

        {plan.status === 'infeasible' && (
          <div className="rounded-lg border border-warning/30 bg-reviewBg p-4">
            <p className="font-semibold text-warning">当前手段无法超速</p>
            <p className="mt-1 text-xs text-textSecondary">全部可用手段叠加后，最高只能到 {plan.bestFinal}。</p>
          </div>
        )}

        {plan.status === 'suggestions' && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-textSecondary">超速方案</p>
            <PlanCard option={plan.primary} recommended onApply={onApply} />
            {plan.safer && <PlanCard option={plan.safer} onApply={onApply} />}
          </div>
        )}

        {!scarfEligible && !build.scarf && (
          <p className="mt-3 text-[11px] leading-5 text-textMuted">
            围巾环境携带率 {scarfUsageRate.toFixed(1)}%，未达 {SCARF_SUGGESTION_USAGE_THRESHOLD}% 门槛，本次建议不占用围巾。
          </p>
        )}
      </section>
    </div>
  );
}

export function SpeedPage({ environment, activeTeam, presetMember }: { environment: EnvironmentState; activeTeam?: Team; presetMember?: TeamMember }) {
  const defaultMember = activeTeam?.members.find((member) => member.pokemonId);
  const defaultPokemon = pokemon.find((entry) => entry.id === defaultMember?.pokemonId) ?? pokemon.find((entry) => entry.id === 'staraptor') ?? pokemon[0];
  const [battleType, setBattleType] = useState<BattleType>('doubles');
  const [selectedPokemonId, setSelectedPokemonId] = useState(defaultPokemon.id);
  const [selectedFormId, setSelectedFormId] = useState(defaultMember?.formId);
  const [build, setBuild] = useState(() => createBuild(defaultPokemon, findBattleForm(defaultPokemon.id, defaultMember?.formId), defaultMember));
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SpeedTierGroup | null>(null);
  const [jumpDirection, setJumpDirection] = useState<ScrollDirection>(null);
  const [centerRequest, setCenterRequest] = useState(0);
  const axisScrollRef = useRef<HTMLDivElement>(null);
  const nextScrollBehaviorRef = useRef<ScrollBehavior>('auto');

  const selected = pokemon.find((entry) => entry.id === selectedPokemonId) ?? defaultPokemon;
  const selectedForm = findBattleForm(selected.id, selectedFormId) ?? findBattleForm(selected.id, selected.id);
  const matchingMember = activeTeam?.members.find(
    (member) => member.pokemonId === selected.id && (member.formId ?? selected.id) === (selectedForm?.id ?? selected.id),
  );
  const memberAbility = getSpeedAbilityProfile(matchingMember?.abilityId);
  const availableAbility = matchingMember ? memberAbility : getPokemonSpeedAbility(selectedForm?.abilities ?? selected.abilities);
  const finalSpeed = calculateSpeedForBuild(build);
  const scarfUsageRate = getScarfUsageRate(environment, selected.id, battleType);
  const snapshot = speedTierSnapshots.find((entry) => entry.rule === (battleType === 'singles' ? 0 : 1)) ?? speedTierSnapshots[0];
  const tiers = useMemo(() => groupTiersBySpeed(snapshot.tiers), [snapshot]);
  // Rank-ordered, evenly spaced rows (PokeDB style) instead of value-proportional
  // spacing — keeps the axis short to scroll and gives the marker its own slot.
  const markerIndex = markerInsertIndex(tiers, finalSpeed);
  const axisHeight = (tiers.length + 1) * ROW_HEIGHT + AXIS_PAD * 2;
  const rowTop = useCallback((index: number) => AXIS_PAD + index * ROW_HEIGHT, []);
  const markerTop = rowTop(markerIndex);
  const markerCenter = markerTop + ROW_HEIGHT / 2;

  // Base species + mega forms as independent entries (dex mapping), so a mega is
  // searchable on its own instead of via a separate form picker.
  const allForms = useMemo(() => getDexFormEntries().filter((entry) => entry.legalInCurrentRule), []);
  const filteredForms = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return allForms;
    const needle = trimmed.toLowerCase();
    return allForms.filter((entry) =>
      entry.chineseName.includes(trimmed) ||
      entry.englishName.toLowerCase().includes(needle) ||
      String(entry.baseStats.speed).includes(needle),
    );
  }, [allForms, query]);

  const updateJumpDirection = useCallback(() => {
    const viewport = axisScrollRef.current;
    if (!viewport) return;
    const top = viewport.scrollTop + 18;
    const bottom = viewport.scrollTop + viewport.clientHeight - 18;
    if (markerCenter < top) setJumpDirection('up');
    else if (markerCenter > bottom) setJumpDirection('down');
    else setJumpDirection(null);
  }, [markerCenter]);

  const centerMarker = useCallback(
    (behavior: ScrollBehavior) => {
      const viewport = axisScrollRef.current;
      if (!viewport) return;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      viewport.scrollTo({
        top: Math.max(0, markerCenter - viewport.clientHeight / 2),
        behavior: reducedMotion ? 'auto' : behavior,
      });
      window.requestAnimationFrame(updateJumpDirection);
    },
    [markerCenter, updateJumpDirection],
  );

  useLayoutEffect(() => {
    centerMarker(nextScrollBehaviorRef.current);
    const frame = window.requestAnimationFrame(() => centerMarker(nextScrollBehaviorRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [axisHeight, centerMarker, centerRequest]);

  const requestCenter = (behavior: ScrollBehavior) => {
    nextScrollBehaviorRef.current = behavior;
    setCenterRequest((value) => value + 1);
  };

  const updateBuild = (patch: Partial<SpeedBuild>, behavior: ScrollBehavior) => {
    setBuild((current) => ({ ...current, ...patch }));
    requestCenter(behavior);
  };

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
    setSearchOpen(false);
    requestCenter('smooth');
  };

  // Jump-in from a team member: carry the saved pokemon/form/nature/scarf/SP.
  const presetAppliedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!presetMember || presetAppliedRef.current === presetMember.id) return;
    const entry = pokemon.find((candidate) => candidate.id === presetMember.pokemonId);
    if (!entry) return;
    presetAppliedRef.current = presetMember.id;
    const form = findBattleForm(entry.id, presetMember.formId);
    setSelectedPokemonId(entry.id);
    setSelectedFormId(presetMember.formId);
    setBuild(createBuild(entry, form, presetMember));
    requestCenter('smooth');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetMember]);

  const natureCardLabel = build.nature === 'neutral' ? '无修正' : `${speedNatureLabel[build.nature]}性格`;
  const markerDetails = [
    `性格${speedNatureLabel[build.nature]}`,
    `SP${build.statPoints}`,
    build.scarf ? '围巾' : undefined,
    build.speedAbility ? availableAbility?.label : undefined,
    build.tailwind ? '顺风' : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">速度线</h2>
          <p className="text-[11px] text-textMuted">PokeDB M-{speedTierSeason} 静态参照</p>
        </div>
        <div className="flex rounded-full border border-border bg-secondary p-0.5">
          {(['singles', 'doubles'] as const).map((type) => (
            <button
              key={type}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${battleType === type ? 'bg-accent text-page' : 'text-textSecondary'}`}
              type="button"
              onClick={() => {
                setBattleType(type);
                requestCenter('smooth');
              }}
            >
              {type === 'singles' ? '单打' : '双打'}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-3">
          <PokemonAvatar iconRef={selectedForm?.iconRef ?? selected.iconRef} label={selectedForm?.chineseName ?? selected.chineseName} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{selectedForm?.chineseName ?? selected.chineseName}</p>
            <p className="mt-0.5 text-[11px] text-textSecondary">速度种族值 {build.baseSpeed} · {natureCardLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-[38px] font-bold leading-none tabular-nums">{finalSpeed}</p>
            <p className="mt-1 text-[11px] font-semibold text-textSecondary">最终速度</p>
          </div>
        </div>
      </Card>

      <div className="relative z-20">
        <button
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left"
          type="button"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((value) => !value)}
        >
          <Search size={16} className="text-textMuted" />
          <span className="flex-1 text-sm">搜索宝可梦</span>
          <ChevronDown size={16} className="text-textMuted" />
        </button>
        {searchOpen && (
          <div className="surface-shadow absolute inset-x-0 top-full mt-1 overflow-hidden rounded-lg border border-border bg-card p-2">
            <input
              autoFocus
              aria-label="搜索宝可梦"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="名称 / 速度种族值"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="mt-2 max-h-52 overflow-y-auto">
              {filteredForms.map((entry) => (
                <button key={entry.id} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-secondary" type="button" onClick={() => selectForm(entry)}>
                  <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{entry.chineseName}</span>
                    <span className="block truncate text-[10px] text-textMuted">{entry.englishName}</span>
                  </span>
                  <span className="text-xs font-semibold text-textSecondary">种族 {entry.baseStats.speed}</span>
                </button>
              ))}
              {filteredForms.length === 0 && <p className="px-2 py-4 text-center text-xs text-textMuted">没有匹配结果</p>}
            </div>
          </div>
        )}
      </div>

      <Card className="space-y-3 bg-secondary">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">速度 SP</p>
            <p className="text-[11px] text-textSecondary">拖动时实时跟随 marker</p>
          </div>
          <span className="text-lg font-bold text-accent">{build.statPoints}</span>
        </div>
        <input
          aria-label="速度 SP"
          aria-valuemin={0}
          aria-valuemax={MAX_STAT_POINTS_PER_STAT}
          aria-valuenow={build.statPoints}
          className="h-8 w-full accent-accent"
          max={MAX_STAT_POINTS_PER_STAT}
          min={0}
          step={1}
          type="range"
          value={build.statPoints}
          onChange={(event) => updateBuild({ statPoints: Number(event.target.value) }, 'auto')}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            aria-pressed={build.nature === 'increased'}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${build.nature === 'increased' ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-card text-textSecondary'}`}
            type="button"
            onClick={() => updateBuild({ nature: build.nature === 'increased' ? 'neutral' : 'increased' }, 'smooth')}
          >
            + 速度性格
          </button>
          <button
            aria-pressed={build.nature === 'decreased'}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${build.nature === 'decreased' ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-card text-textSecondary'}`}
            type="button"
            onClick={() => updateBuild({ nature: build.nature === 'decreased' ? 'neutral' : 'decreased' }, 'smooth')}
          >
            − 速度性格
          </button>
          <button
            aria-pressed={build.scarf}
            className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${build.scarf ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-card text-textSecondary'}`}
            type="button"
            onClick={() => updateBuild({ scarf: !build.scarf }, 'smooth')}
          >
            <img src="/assets/items/choice-scarf.png" alt="" className="h-4 w-4 shrink-0" /> 围巾 ×1.5
          </button>
          <button
            aria-pressed={build.tailwind}
            className={`inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${build.tailwind ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-card text-textSecondary'}`}
            type="button"
            onClick={() => updateBuild({ tailwind: !build.tailwind }, 'smooth')}
          >
            <Wind size={13} /> 顺风 ×2
          </button>
        </div>
        {availableAbility && (
          <button
            aria-pressed={build.speedAbility}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${build.speedAbility ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-card text-textSecondary'}`}
            type="button"
            onClick={() => updateBuild({ speedAbility: !build.speedAbility }, 'smooth')}
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><Zap size={13} />{availableAbility.label} ×2</span>
            <span className="text-[10px]">{availableAbility.requirement}</span>
          </button>
        )}
      </Card>

      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] font-semibold tracking-wide text-textSecondary">环境速度梯队</p>
        <p className="text-[11px] text-textMuted">上下滑动 · 点档位看方案</p>
      </div>

      <div className="relative h-[calc(100dvh-480px)] min-h-[340px] max-h-[60vh] overflow-hidden rounded-lg border border-border bg-secondary">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-secondary to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-secondary to-transparent" />
        <span className="pointer-events-none absolute left-3 top-2 z-20 text-[10px] font-bold text-textMuted">↑ 快</span>
        <span className="pointer-events-none absolute bottom-2 left-3 z-20 text-[10px] font-bold text-textMuted">↓ 慢</span>

        <div ref={axisScrollRef} data-speed-axis className="hide-scrollbar absolute inset-0 overflow-y-auto overscroll-contain" onScroll={updateJumpDirection}>
          <div className="relative" style={{ height: axisHeight }}>
            {tiers.map((group, groupIndex) => {
              const rowIndex = groupIndex < markerIndex ? groupIndex : groupIndex + 1;
              const difference = group.speed - finalSpeed;
              const relation = difference > 0 ? '▲' : difference < 0 ? '▼' : '=';
              const items = groupAvatarItems(group);
              return (
                <button
                  key={group.speed}
                  aria-label={`超速 实数 ${group.speed}，${groupPrimaryLabel(group)}，共 ${group.pokemonCount} 只`}
                  className="absolute inset-x-0 flex items-center gap-2 pl-3 pr-2 text-left"
                  style={{ top: rowTop(rowIndex), height: ROW_HEIGHT }}
                  type="button"
                  onClick={() => setSelectedTier(group)}
                >
                  <span className="w-9 shrink-0 text-sm font-bold tabular-nums">{group.speed}</span>
                  <span className={`w-3 shrink-0 text-[10px] ${difference > 0 ? 'text-danger' : difference < 0 ? 'text-success' : 'text-accent'}`}>{relation}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.variants[0].color }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-textSecondary">{groupPrimaryLabel(group)}</span>
                  <OverlappingAvatars items={items} limit={AXIS_AVATAR_LIMIT} className="shrink-0 pr-1" />
                </button>
              );
            })}

            <div
              data-speed-marker
              className="absolute inset-x-2 z-10 flex items-center gap-2 rounded-lg border border-accent bg-card pl-3 pr-2 shadow-[0_0_22px_rgb(var(--color-accent)/0.2)]"
              style={{ top: markerTop, height: ROW_HEIGHT }}
            >
              <span className="w-9 shrink-0 text-lg font-bold leading-none tabular-nums text-accent">{finalSpeed}</span>
              <span className="shrink-0 rounded bg-accent/15 px-1 text-[10px] font-semibold text-accent">我的</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-textSecondary">{selectedForm?.chineseName ?? selected.chineseName} · {markerDetails}</span>
              <PokemonAvatar iconRef={selectedForm?.iconRef ?? selected.iconRef} label={selectedForm?.chineseName ?? selected.chineseName} size="xs" />
            </div>
          </div>
        </div>

        {jumpDirection && (
          <button
            className={`absolute right-3 z-30 inline-flex items-center gap-1 rounded-full border border-accent bg-card px-3 py-2 text-[11px] font-semibold text-accent ${jumpDirection === 'up' ? 'top-3' : 'bottom-3'}`}
            type="button"
            aria-label={`跳回我那只，位于${jumpDirection === 'up' ? '上方' : '下方'}`}
            onClick={() => centerMarker('smooth')}
          >
            {jumpDirection === 'up' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            我那只
          </button>
        )}
      </div>

      {selectedTier && (
        <OutspeedSheet
          group={selectedTier}
          build={build}
          scarfUsageRate={scarfUsageRate}
          ability={availableAbility}
          onClose={() => setSelectedTier(null)}
          onApply={(option) => {
            setBuild(option.build);
            setSelectedTier(null);
            requestCenter('smooth');
          }}
        />
      )}
    </div>
  );
}
