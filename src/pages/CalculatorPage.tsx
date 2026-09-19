import { ArrowLeftRight, Check, ChevronDown, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { abilities as allAbilities, currentRuleNatureOptions, currentRuleSet, items as allItems, moves, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { currentRuleMovesForPokemon, currentRuleNatures, natureOptionLabel } from '../lib/currentRuleCatalog';
import {
  buildCalcConfigFromTeamMember,
  buildTemporaryCalcConfig,
  computeDamage,
  totalStatPoints,
  validateStatPoints,
  type BattleTypeOption,
  type CalcSideConfig,
} from '../lib/damageAdapter';
import { findBattleForm } from '../lib/pokemonForms';
import { clampStatPointValue, MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS } from '../lib/statPoints';
import { recordToolResult } from '../lib/toolActivity';
import { useAppStore } from '../state/AppContext';
import type { Move as AppMove, StatPoints, TeamMember } from '../types';
import { StatPointPicker } from '../components/StatPointPicker';
import { KitButton, ListRow, PageHeader, Pill, SearchField, SectionLabel, SegmentedTabs, Sheet, Sprite, Switch, TypeDot } from '../components/kit';

export type CalcSide = 'attacker' | 'defender';

/** Top slice of the environment ranking offered as ready-made picks (plan: 仅名次前 60). */
const ENVIRONMENT_PICK_LIMIT = 60;

/** Debounce before a settled result reaches 04-01's card. */
const RESULT_RECORD_DELAY_MS = 800;

const weatherOptions: Array<{ id: string; note?: string }> = [
  { id: '无天气' },
  { id: '晴天', note: '火 ×1.5 · 水 ×0.5' },
  { id: '雨天', note: '水 ×1.5 · 火 ×0.5' },
  { id: '沙暴', note: '岩石 特防 ×1.5' },
  { id: '雪天', note: '冰 防御 ×1.5' },
];

const STAT_LABELS: Array<{ key: keyof StatPoints; label: string; stageKey?: keyof NonNullable<CalcSideConfig['statStages']> }> = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击', stageKey: 'attack' },
  { key: 'defense', label: '防御', stageKey: 'defense' },
  { key: 'specialAttack', label: '特攻', stageKey: 'specialAttack' },
  { key: 'specialDefense', label: '特防', stageKey: 'specialDefense' },
  { key: 'speed', label: '速度', stageKey: 'speed' },
];
const STAGE_LABELS: Array<{ key: keyof NonNullable<CalcSideConfig['statStages']>; label: string }> = [
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'specialAttack', label: '特攻' },
  { key: 'specialDefense', label: '特防' },
  { key: 'speed', label: '速度' },
];

const NATURE_STAT_PRIORITY: Record<string, number> = { '攻击': 0, '防御': 1, '特攻': 2, '特防': 3, '速度': 4 };
const sortedNatureOptions = () => {
  const selectable = new Set(currentRuleNatures());
  return [...currentRuleNatureOptions]
    .filter((option) => selectable.has(option.id))
    .sort((a, b) => {
      const aGroup = a.up[0] ? (NATURE_STAT_PRIORITY[a.up[0]] ?? 5) : 5;
      const bGroup = b.up[0] ? (NATURE_STAT_PRIORITY[b.up[0]] ?? 5) : 5;
      return aGroup - bGroup || a.id.localeCompare(b.id, 'zh-Hans-CN');
    });
};

const buildBlankCalcConfig = (role: CalcSide): CalcSideConfig =>
  buildTemporaryCalcConfig({ pokemonId: '', role });

const sideLabelText = (side: CalcSide) => (side === 'attacker' ? '进攻方' : '防守方');

/** `SP 攻击 32 · 速度 30` — invested stats only, biggest first, never wrapped (owner call). */
const statPointLine = (statPoints: StatPoints) => {
  const invested = STAT_LABELS.map(({ key, label }) => ({ label, value: clampStatPointValue(statPoints[key] ?? 0) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  if (invested.length === 0) return 'SP 未分配';
  return `SP ${invested.map((entry) => `${entry.label} ${entry.value}`).join(' · ')}`;
};

const configSummaryLine = (config: CalcSideConfig) => {
  const ability = allAbilities.find((entry) => entry.id === config.abilityId);
  return [config.nature, ability?.chineseName, statPointLine(config.statPoints)].filter(Boolean).join(' · ');
};

const moveMetaLine = (move: AppMove, withAccuracy = false) => {
  const category = move.category === 'Physical' ? '物理' : move.category === 'Special' ? '特殊' : '变化';
  const power = move.power ? `威力 ${move.power}` : undefined;
  const accuracy = withAccuracy && move.accuracy ? `命中 ${move.accuracy}` : undefined;
  return [move.type, category, power, accuracy].filter(Boolean).join(' · ');
};

/** Overflow rows for the result card (N05-12): one per breached limit, per side. */
const statPointOverflows = (config: CalcSideConfig, side: CalcSide) => {
  const rows: Array<{ label: string; note: string }> = [];
  const total = totalStatPoints(config.statPoints);
  if (total > MAX_TOTAL_STAT_POINTS) {
    rows.push({ label: `${sideLabelText(side)} 总计 ${total}/${MAX_TOTAL_STAT_POINTS}`, note: `超 ${total - MAX_TOTAL_STAT_POINTS} 点` });
  }
  for (const { key, label } of STAT_LABELS) {
    const value = Number(config.statPoints[key] ?? 0);
    if (value > MAX_STAT_POINTS_PER_STAT) {
      rows.push({ label: `${sideLabelText(side)} ${label} ${value}`, note: `单项上限 ${MAX_STAT_POINTS_PER_STAT}` });
    }
  }
  return rows;
};

/** N05-08's in-place advice: name the two heaviest stats and the value that clears the total. */
const totalOverflowAdvice = (statPoints: StatPoints) => {
  const total = totalStatPoints(statPoints);
  const over = total - MAX_TOTAL_STAT_POINTS;
  if (over <= 0) return undefined;
  const heaviest = STAT_LABELS.map(({ key, label }) => ({ label, value: clampStatPointValue(statPoints[key] ?? 0) }))
    .filter((entry) => entry.value > over)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2);
  if (heaviest.length === 0) return `总计超了 ${over} 点。`;
  const fixes = heaviest.map((entry) => `把「${entry.label}」减到 ${entry.value - over}`);
  return `总计超了 ${over} 点。${fixes.join('，或')}。`;
};

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\-_/·・]+/g, '');

const moveSearchRank = (move: AppMove, query: string) => {
  const names = [move.chineseName, move.englishName].map(normalizeSearchText);
  const id = normalizeSearchText(move.id);
  const type = normalizeSearchText(move.type);

  if (names.some((field) => field === query) || id === query) return 0;
  if (names.some((field) => field.startsWith(query))) return 1;
  if (id.startsWith(query)) return 2;
  if (names.some((field) => field.includes(query)) || id.includes(query)) return 3;
  if (type.startsWith(query)) return 4;
  return Number.POSITIVE_INFINITY;
};

const filterMovesByQuery = (availableMoves: AppMove[], query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return availableMoves;

  return availableMoves
    .map((move, index) => ({ index, move, rank: moveSearchRank(move, normalizedQuery) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((a, b) => (
      a.rank - b.rank
      || a.move.chineseName.localeCompare(b.move.chineseName, 'zh-Hans-CN')
      || a.index - b.index
    ))
    .map(({ move }) => move);
};

// ── Side summary card (05-01) ──

function SideCard({ config, side, onPick, onEdit }: { config: CalcSideConfig; side: CalcSide; onPick: () => void; onEdit: () => void }) {
  const entry = pokemon.find((candidate) => candidate.id === config.pokemonId);
  const battleForm = findBattleForm(entry?.id ?? '', config.formId) ?? (entry ? findBattleForm(entry.id, entry.id) : undefined);
  const ability = allAbilities.find((candidate) => candidate.id === config.abilityId);
  const name = battleForm?.chineseName ?? entry?.chineseName;
  const label = sideLabelText(side);

  return (
    <section className="min-w-0 flex-1 rounded-2xl bg-surface p-3.5" data-calc-side={side}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-textSecondary">{label}</p>
      {!name ? (
        <button aria-label={`选择${label}`} className="mt-2 block w-full text-left text-[15px] font-extrabold tracking-[-0.01em] text-chevron" type="button" onClick={onPick}>
          未选
        </button>
      ) : (
        <>
          <button aria-label={`选择${label} ${name}`} className="mt-2 flex w-full items-center gap-2.5 text-left" type="button" onClick={onPick}>
            <Sprite iconRef={battleForm?.iconRef ?? entry?.iconRef} label={name} size={48} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold tracking-[-0.01em]">{name}</span>
          </button>
          <button aria-label={`编辑${label}配置`} className="mt-2.5 block w-full text-left" type="button" onClick={onEdit}>
            <span className="flex flex-col gap-1">
              <span className="flex gap-2 text-[11px] font-semibold text-textSecondary">
                <span className="w-6 shrink-0">性格</span>
                <span className="min-w-0 flex-1 truncate text-textLabel">{config.nature}</span>
              </span>
              <span className="flex gap-2 text-[11px] font-semibold text-textSecondary">
                <span className="w-6 shrink-0">特性</span>
                <span className="min-w-0 flex-1 truncate text-textLabel">{ability?.chineseName ?? '未选'}</span>
              </span>
            </span>
            <span className="mt-2.5 block truncate text-[11px] font-bold tabular-nums text-textSecondary">{statPointLine(config.statPoints)}</span>
          </button>
        </>
      )}
    </section>
  );
}

// ── Pickers ──

function OptionSheet({
  title,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  title: string;
  options: Array<{ id: string; label: string; note?: string }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="mt-3.5">
        {options.map((option, index) => (
          <ListRow
            key={option.id}
            active={option.id === selectedId}
            ariaLabel={option.label}
            bleed
            divider={index < options.length - 1}
            height={60}
            title={<span className="text-[16px]">{option.label}</span>}
            trailing={
              option.id === selectedId ? (
                <Check className="shrink-0 text-textPrimary" size={18} />
              ) : option.note ? (
                <span className="shrink-0 text-[13px] font-semibold text-textSecondary">{option.note}</span>
              ) : undefined
            }
            onClick={() => onSelect(option.id)}
          />
        ))}
      </div>
    </Sheet>
  );
}

function SidePicker({
  side,
  environment,
  battleType,
  teamMembers,
  selectedPokemonId,
  onPickMember,
  onPickPokemon,
  onClose,
}: {
  side: CalcSide;
  environment: EnvironmentState | null;
  battleType: BattleTypeOption;
  teamMembers: Array<{ teamName: string; member: TeamMember }>;
  selectedPokemonId?: string;
  onPickMember: (member: TeamMember) => void;
  onPickPokemon: (pokemonId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'team' | 'environment'>('team');
  const [query, setQuery] = useState('');
  const label = sideLabelText(side);

  const environmentPicks = useMemo(() => {
    const usage = environment?.pokemonUsage[battleType] ?? [];
    return usage
      .slice(0, ENVIRONMENT_PICK_LIMIT)
      .map((row) => pokemon.find((entry) => entry.id === row.pokemonId))
      .filter((entry): entry is (typeof pokemon)[number] => Boolean(entry));
  }, [battleType, environment]);

  const normalized = query.trim().toLowerCase();
  const searchResults = useMemo(
    () =>
      normalized
        ? pokemon.filter((entry) => `${entry.chineseName} ${entry.englishName}`.toLowerCase().includes(normalized)).slice(0, 40)
        : [],
    [normalized],
  );

  return (
    <Sheet title={`选择${label}`} onClose={onClose}>
      <SegmentedTabs
        className="mt-4"
        options={[
          { id: 'team', label: '我的队伍' },
          { id: 'environment', label: '环境常用' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <SearchField className="mt-3" label="搜索名称" placeholder="搜索名称" value={query} onChange={setQuery} />

      <div className="mt-3">
        {normalized
          ? searchResults.map((entry, index) => (
              <ListRow
                key={entry.id}
                active={entry.id === selectedPokemonId}
                ariaLabel={entry.chineseName}
                bleed
                divider={index < searchResults.length - 1}
                height={68}
                leading={<Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />}
                subtitle={entry.types.join(' · ')}
                title={entry.chineseName}
                onClick={() => onPickPokemon(entry.id)}
              />
            ))
          : tab === 'team'
            ? teamMembers.map(({ member }, index) => {
                const entry = pokemon.find((candidate) => candidate.id === member.pokemonId);
                if (!entry) return null;
                const active = member.pokemonId === selectedPokemonId;
                return (
                  <ListRow
                    key={member.id}
                    active={active}
                    ariaLabel={entry.chineseName}
                    bleed
                    divider={index < teamMembers.length - 1}
                    height={68}
                    leading={<Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />}
                    subtitle={configSummaryLine(buildCalcConfigFromTeamMember(member))}
                    title={entry.chineseName}
                    trailing={active ? <Check className="shrink-0 text-textPrimary" size={18} /> : undefined}
                    onClick={() => onPickMember(member)}
                  />
                );
              })
            : environmentPicks.map((entry, index) => (
                <ListRow
                  key={entry.id}
                  active={entry.id === selectedPokemonId}
                  ariaLabel={entry.chineseName}
                  bleed
                  divider={index < environmentPicks.length - 1}
                  height={68}
                  leading={<Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />}
                  subtitle={`环境 No.${index + 1}`}
                  title={entry.chineseName}
                  onClick={() => onPickPokemon(entry.id)}
                />
              ))}
        {!normalized && tab === 'team' && teamMembers.length === 0 && (
          <p className="py-6 text-center text-[13px] font-semibold text-textSecondary">还没有队伍成员</p>
        )}
      </div>

      <p className="mt-3.5 text-xs font-semibold leading-[18px] text-textSecondary">取的是该成员当前保存的配置。在这里的临时改动不写回队伍。</p>
    </Sheet>
  );
}

// ── Side editor (N05-07 / N05-08) ──

function SideEditor({
  config,
  side,
  showMoves,
  onChange,
  onClose,
}: {
  config: CalcSideConfig;
  side: CalcSide;
  showMoves: boolean;
  onChange: (next: CalcSideConfig) => void;
  onClose: () => void;
}) {
  const [moveQuery, setMoveQuery] = useState('');
  const [optionSheet, setOptionSheet] = useState<'nature' | 'ability' | 'item' | null>(null);
  const [editingStatKey, setEditingStatKey] = useState<keyof StatPoints | null>(null);

  const entry = pokemon.find((candidate) => candidate.id === config.pokemonId);
  const battleForm = findBattleForm(entry?.id ?? '', config.formId) ?? (entry ? findBattleForm(entry.id, entry.id) : undefined);
  const ability = allAbilities.find((candidate) => candidate.id === config.abilityId);
  const item = allItems.find((candidate) => candidate.id === config.itemId);
  const natureOptions = useMemo(sortedNatureOptions, []);
  const availableMoves = entry ? currentRuleMovesForPokemon(entry.id).filter((move) => move.category !== 'Status') : [];
  const filteredMoves = filterMovesByQuery(availableMoves, moveQuery);
  const spTotal = totalStatPoints(config.statPoints);
  const spIssues = validateStatPoints(config.statPoints);
  const advice = totalOverflowAdvice(config.statPoints);
  const editingStat = STAT_LABELS.find((stat) => stat.key === editingStatKey);
  const label = sideLabelText(side);

  const selectMove = (moveId: string) =>
    onChange({
      ...config,
      selectedMoveId: moveId,
      moveIds: Array.from(new Set([moveId, ...config.moveIds.filter(Boolean)])).slice(0, 4),
    });

  return (
    <div className="pb-8" data-calc-editor={side}>
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <button
          aria-label="返回"
          className="grid h-9 w-9 place-items-center rounded-full bg-surface text-textLabel"
          type="button"
          onClick={onClose}
        >
          <ChevronLeft size={20} />
        </button>
        <KitButton ariaLabel="完成" disabled={spIssues.length > 0} height={32} shape="pill" onClick={onClose}>
          完成
        </KitButton>
      </div>

      <PageHeader className="px-6 pt-3.5" subtitle={`${battleForm?.chineseName ?? entry?.chineseName ?? '未选'} · 临时修改不写回队伍`} title={label} />

      {entry && entry.megaForms.length > 0 && (
        <>
          <SectionLabel className="px-6 pt-6">形态</SectionLabel>
          <div className="mt-2.5 flex gap-2 overflow-x-auto px-6">
            <Pill height={32} selected={(config.formId ?? entry.id) === entry.id} onClick={() => onChange({ ...config, formId: undefined })}>
              普通
            </Pill>
            {entry.megaForms.map((form) => (
              <Pill key={form.id} height={32} selected={config.formId === form.id} onClick={() => onChange({ ...config, formId: form.id })}>
                {form.chineseName}
              </Pill>
            ))}
          </div>
        </>
      )}

      <div className="px-6 pt-5">
        {(
          [
            { key: 'nature' as const, label: '性格', value: natureOptionLabel(config.nature) },
            { key: 'ability' as const, label: '特性', value: ability?.chineseName ?? '未选' },
            { key: 'item' as const, label: '道具', value: item?.chineseName ?? '无道具' },
          ]
        ).map((row) => (
          <ListRow
            key={row.key}
            ariaLabel={`${row.label} ${row.value}`}
            height={64}
            leading={<span className="w-[52px] shrink-0 text-[13px] font-semibold text-textSecondary">{row.label}</span>}
            title={<span className="text-[16px]">{row.value}</span>}
            trailing={<ChevronRight className="shrink-0 text-chevron" size={18} />}
            onClick={() => setOptionSheet(row.key)}
          />
        ))}
      </div>

      {showMoves && (
        <>
          <SectionLabel className="px-6 pt-6">招式</SectionLabel>
          <div className="px-6 pt-2.5">
            <SearchField label="搜索攻击招式" placeholder="搜索攻击招式" value={moveQuery} onChange={setMoveQuery} />
            <p className="mt-2.5 text-xs font-semibold text-textSecondary">{filteredMoves.length} 个结果</p>
            <div className="mt-2">
              {filteredMoves.slice(0, 40).map((move, index) => (
                <ListRow
                  key={move.id}
                  active={move.id === config.selectedMoveId}
                  ariaLabel={`${move.chineseName} ${moveMetaLine(move, true)}`}
                  bleed
                  divider={index < Math.min(filteredMoves.length, 40) - 1}
                  height={68}
                  leading={<TypeDot type={move.type} />}
                  subtitle={moveMetaLine(move, true)}
                  title={move.chineseName}
                  trailing={move.id === config.selectedMoveId ? <Check className="shrink-0 text-textPrimary" size={18} /> : undefined}
                  onClick={() => selectMove(move.id)}
                />
              ))}
              {filteredMoves.length === 0 && <p className="py-6 text-center text-[13px] font-semibold text-textSecondary">没有匹配的攻击招式</p>}
            </div>
          </div>
        </>
      )}

      <div className="px-6 pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">SP 分配</h2>
          <span className={`text-[20px] font-extrabold tabular-nums ${spIssues.length > 0 ? 'text-danger' : 'text-data'}`}>
            {spTotal} / {MAX_TOTAL_STAT_POINTS}
          </span>
        </div>
        {advice ? (
          <p className="mt-1.5 text-[13px] font-bold leading-[19px] text-danger">{advice}</p>
        ) : (
          <p className="mt-1.5 text-xs font-semibold text-textSecondary">
            单项最多 {MAX_STAT_POINTS_PER_STAT}，剩余 {Math.max(0, MAX_TOTAL_STAT_POINTS - spTotal)} 点可分配
          </p>
        )}
        <div className="mt-2">
          {STAT_LABELS.map(({ key, label: statLabel }, index) => {
            const value = Number(config.statPoints[key] ?? 0);
            const over = value > MAX_STAT_POINTS_PER_STAT;
            const tone = over ? 'text-danger' : value > 0 ? 'text-data' : 'text-textSecondary';
            return (
              <ListRow
                key={key}
                ariaLabel={`${statLabel} ${clampStatPointValue(value)}`}
                divider={index < STAT_LABELS.length - 1}
                height={60}
                leading={<span className="w-[38px] shrink-0 text-[13px] font-semibold text-textSecondary">{statLabel}</span>}
                title={
                  <span className="block h-1.5 overflow-hidden rounded-full bg-textPrimary/[0.09]">
                    <span
                      className={`block h-full rounded-full ${over ? 'bg-danger' : value > 0 ? 'bg-data' : 'bg-disabled'}`}
                      style={{ width: `${Math.min(100, (value / MAX_STAT_POINTS_PER_STAT) * 100)}%` }}
                    />
                  </span>
                }
                trailing={<span className={`w-[34px] shrink-0 text-right text-[20px] font-extrabold tabular-nums ${tone}`}>{value}</span>}
                onClick={() => setEditingStatKey(key)}
              />
            );
          })}
        </div>
        {spIssues.length > 0 && (
          <div className="mt-3.5 flex gap-2.5 rounded-[14px] bg-danger/[0.12] p-3.5">
            <TriangleAlert className="mt-px shrink-0 text-danger" size={18} />
            <p className="min-w-0 flex-1 text-sm font-extrabold tracking-[-0.01em] text-danger">
              总计回到 {MAX_TOTAL_STAT_POINTS} 以内才会出结果
            </p>
          </div>
        )}
      </div>

      <div className="px-6 pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">能力阶级</h2>
          <span className="text-xs font-semibold text-textSecondary">−6 … +6</span>
        </div>
        <div className="mt-2">
          {STAGE_LABELS.map(({ key, label: stageLabel }, index) => {
            const stage = config.statStages?.[key] ?? 0;
            const setStage = (next: number) =>
              onChange({ ...config, statStages: { ...(config.statStages ?? {}), [key]: Math.max(-6, Math.min(6, next)) } });
            return (
              <div
                key={key}
                className={`flex items-center gap-2.5 ${index < STAGE_LABELS.length - 1 ? 'border-b border-[var(--hairline)]' : ''}`}
                style={{ height: 60 }}
              >
                <span className="w-[38px] shrink-0 text-[13px] font-semibold text-textSecondary">{stageLabel}</span>
                <button
                  aria-label={`${stageLabel} 能力阶级 −1`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-btn1 text-textLabel"
                  type="button"
                  onClick={() => setStage(stage - 1)}
                >
                  −
                </button>
                <span
                  aria-label={`${stageLabel} 能力阶级`}
                  className={`min-w-0 flex-1 text-center text-[20px] font-extrabold tabular-nums ${stage === 0 ? 'text-textLabel' : 'text-textPrimary'}`}
                  role="status"
                >
                  {stage > 0 ? `+${stage}` : stage < 0 ? `−${Math.abs(stage)}` : '0'}
                </span>
                <button
                  aria-label={`${stageLabel} 能力阶级 +1`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-btn1 text-textLabel"
                  type="button"
                  onClick={() => setStage(stage + 1)}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {optionSheet === 'nature' && (
        <OptionSheet
          options={natureOptions.map((option) => ({ id: option.id, label: natureOptionLabel(option.id) }))}
          selectedId={config.nature}
          title="性格"
          onClose={() => setOptionSheet(null)}
          onSelect={(id) => {
            onChange({ ...config, nature: id });
            setOptionSheet(null);
          }}
        />
      )}
      {optionSheet === 'ability' && entry && (
        <OptionSheet
          options={entry.abilities.map((abilityId) => ({
            id: abilityId,
            label: allAbilities.find((candidate) => candidate.id === abilityId)?.chineseName ?? abilityId,
          }))}
          selectedId={config.abilityId}
          title="特性"
          onClose={() => setOptionSheet(null)}
          onSelect={(id) => {
            onChange({ ...config, abilityId: id });
            setOptionSheet(null);
          }}
        />
      )}
      {optionSheet === 'item' && (
        <OptionSheet
          options={[
            { id: '', label: '无道具' },
            ...allItems.filter((candidate) => candidate.legalInCurrentRule).map((candidate) => ({ id: candidate.id, label: candidate.chineseName })),
          ]}
          selectedId={config.itemId ?? ''}
          title="道具"
          onClose={() => setOptionSheet(null)}
          onSelect={(id) => {
            onChange({ ...config, itemId: id || undefined });
            setOptionSheet(null);
          }}
        />
      )}
      {editingStat && (
        <StatPointPicker
          boundsVariant="plain"
          label={editingStat.label}
          value={config.statPoints[editingStat.key] ?? 0}
          onChange={(value) =>
            onChange({ ...config, statPoints: { ...config.statPoints, [editingStat.key]: clampStatPointValue(value) } })
          }
          onClose={() => setEditingStatKey(null)}
        />
      )}
    </div>
  );
}

// ── Result card (05-01 / N05-11 / N05-12 / N05-13) ──

function RaisedCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`lk-raised rounded-[18px] p-[18px] ${className}`}>{children}</section>;
}

function ResultCard({
  result,
  move,
  attackerConfig,
  defenderConfig,
  onEditSide,
}: {
  result: ReturnType<typeof computeDamage> | null;
  move?: AppMove;
  attackerConfig: CalcSideConfig;
  defenderConfig: CalcSideConfig;
  onEditSide: (side: CalcSide) => void;
}) {
  const overflows = [...statPointOverflows(attackerConfig, 'attacker'), ...statPointOverflows(defenderConfig, 'defender')];

  if (overflows.length > 0) {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <SectionLabel tone="danger">SP 分配需要调整</SectionLabel>
        <p className="mt-2.5 text-[17px] font-bold leading-6 tracking-[-0.01em]">先把超限的地方改回来再算。</p>
        <div className="mt-3 rounded-[14px] bg-sunken px-3.5 py-1">
          {overflows.map((row, index) => (
            <ListRow
              key={row.label}
              divider={index < overflows.length - 1}
              height={44}
              title={<span className="text-[13px] font-semibold text-textLabel">{row.label}</span>}
              trailing={<span className="shrink-0 text-[13px] font-bold text-danger">{row.note}</span>}
            />
          ))}
        </div>
        <div className="mt-3.5 flex gap-2.5">
          <KitButton grow onClick={() => onEditSide('attacker')}>
            改进攻方
          </KitButton>
          <KitButton grow onClick={() => onEditSide('defender')}>
            改防守方
          </KitButton>
        </div>
      </RaisedCard>
    );
  }

  const checklist = [
    { label: `进攻方${attackerConfig.pokemonId ? ` ${pokemon.find((entry) => entry.id === attackerConfig.pokemonId)?.chineseName ?? ''}` : ''}`, ok: Boolean(attackerConfig.pokemonId) },
    { label: `防守方${defenderConfig.pokemonId ? ` ${pokemon.find((entry) => entry.id === defenderConfig.pokemonId)?.chineseName ?? ''}` : ''}`, ok: Boolean(defenderConfig.pokemonId) },
    { label: `招式${move ? ` ${move.chineseName}` : ''}`, ok: Boolean(attackerConfig.selectedMoveId) },
  ];

  if (checklist.some((row) => !row.ok)) {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <SectionLabel>伤害区间</SectionLabel>
        <p className="mt-2.5 text-[17px] font-bold leading-6 tracking-[-0.01em] text-textLabel">请先选择进攻方、防守方和招式。</p>
        <div className="mt-3.5 flex flex-col gap-2">
          {checklist.map((row) => (
            <span key={row.label} className={`flex items-center gap-2.5 text-[13px] font-semibold ${row.ok ? 'text-textLabel' : 'text-textSecondary'}`}>
              <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${row.ok ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                {row.ok ? <Check size={11} /> : '×'}
              </span>
              {row.label}
            </span>
          ))}
        </div>
      </RaisedCard>
    );
  }

  if (move?.category === 'Status') {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <p className="text-[17px] font-bold leading-6 tracking-[-0.01em]">「{move.chineseName}」不造成伤害，算不出区间。</p>
        <p className="mt-2 text-[13px] font-semibold leading-[19px] text-textSecondary">换一个物理或特殊招式即可。</p>
      </RaisedCard>
    );
  }

  if (!result) {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <SectionLabel>伤害区间</SectionLabel>
        <p className="mt-2.5 text-[17px] font-bold leading-6 tracking-[-0.01em] text-textLabel">正在计算…</p>
      </RaisedCard>
    );
  }

  if (result.status !== 'experimental-success') {
    const reasons = result.blockedReasons ?? [];
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <p className="text-[17px] font-bold leading-6 tracking-[-0.01em]">这一组合算不出来。</p>
        <div className="mt-3 flex flex-col gap-2.5">
          {reasons.map((reason) => (
            <span key={reason} className="flex gap-2.5 text-[13px] font-semibold leading-[19px] text-textLabel">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
              <span className="min-w-0 flex-1">{reason}</span>
            </span>
          ))}
        </div>
        {result.assumptions.length > 0 && (
          <div className="mt-3.5 rounded-[14px] bg-sunken p-3.5">
            {result.assumptions.map((assumption) => (
              <p key={assumption} className="text-xs font-semibold leading-[18px] text-textSecondary">{assumption}</p>
            ))}
          </div>
        )}
      </RaisedCard>
    );
  }

  const typeMultiplier = result.typeEffectiveness ?? 1;
  const chips = [
    (result.stabMultiplier ?? 1) !== 1 ? `本系 ×${result.stabMultiplier}` : '本系 ×1',
    `属性 ×${typeMultiplier}`,
    (result.weatherMultiplier ?? 1) !== 1 ? `${result.weatherText} ×${result.weatherMultiplier}` : undefined,
    result.derivedSpreadDamage ? `分摊 ×${result.spreadMultiplier}` : undefined,
    ...(result.abilityEffects ?? []).map((effect) => `${effect.label} · ${effect.text}`),
    ...(result.itemEffects ?? []).map((effect) => `${effect.label} · ${effect.text}`),
  ].filter((chip): chip is string => Boolean(chip));

  return (
    <RaisedCard className="mx-6 mt-[18px]">
      <SectionLabel>伤害区间</SectionLabel>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-[44px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{result.minPercent}</span>
        <span className="text-[20px] font-extrabold text-textLabel">– {result.maxPercent}%</span>
      </p>
      <p className="mt-2 text-[13px] font-semibold tabular-nums text-textSecondary">
        {result.minDamage} – {result.maxDamage} 伤害 / 对方 HP {result.defenderHp ?? '-'}
      </p>
      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-textPrimary/[0.08]">
        <div className="lk-damage-bar h-full" style={{ width: `${Math.min(100, result.maxPercent ?? 0)}%` }} />
      </div>
      <p className="lk-damage-pill mt-3 inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[13px] font-extrabold text-data">
        {result.possibleHkoText}
      </p>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span key={chip} className="lk-chip inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-bold text-textLabel">
            {chip}
          </span>
        ))}
      </div>
    </RaisedCard>
  );
}

// ── Page ──

export function CalculatorPage({
  selectedMemberId,
  onPickMember,
  presetMember,
  environment,
}: {
  selectedMemberId?: string;
  onPickMember: (memberId: string) => void;
  presetMember?: { memberId: string; side: CalcSide };
  environment?: EnvironmentState | null;
}) {
  const { teams } = useAppStore();

  const teamMembers = useMemo(
    () => teams.flatMap((team) => team.members.filter((member) => member.pokemonId).map((member) => ({ teamName: team.name, member }))),
    [teams],
  );

  const [activeSide, setActiveSide] = useState<CalcSide>('attacker');
  const [attackerConfig, setAttackerConfig] = useState<CalcSideConfig>(() => buildBlankCalcConfig('attacker'));
  const [defenderConfig, setDefenderConfig] = useState<CalcSideConfig>(() => buildBlankCalcConfig('defender'));
  const [attackerDirty, setAttackerDirty] = useState(false);
  const [defenderDirty, setDefenderDirty] = useState(false);
  const [battleType, setBattleType] = useState<BattleTypeOption>(currentRuleSet.battleType);
  const [weather, setWeather] = useState(weatherOptions[0].id);
  const [isCritical, setIsCritical] = useState(false);
  const [pickerSide, setPickerSide] = useState<CalcSide | null>(null);
  const [editorSide, setEditorSide] = useState<CalcSide | null>(null);
  const [weatherOpen, setWeatherOpen] = useState(false);

  const configFor = (side: CalcSide) => (side === 'attacker' ? attackerConfig : defenderConfig);
  const setConfigFor = (side: CalcSide, next: CalcSideConfig, dirty: boolean) => {
    if (side === 'attacker') {
      setAttackerConfig(next);
      setAttackerDirty(dirty);
    } else {
      setDefenderConfig(next);
      setDefenderDirty(dirty);
    }
  };

  // Guard: only apply selectedMemberId ONCE, never overwrite user edits
  const lastAppliedMemberIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedMemberId) {
      lastAppliedMemberIdRef.current = undefined;
      return;
    }
    if (lastAppliedMemberIdRef.current === selectedMemberId) return;
    lastAppliedMemberIdRef.current = selectedMemberId;

    const found = teams.flatMap((team) => team.members).find((member) => member.id === selectedMemberId);
    if (found) {
      setAttackerConfig(buildCalcConfigFromTeamMember(found));
      setAttackerDirty(false);
      return;
    }

    const pokeId = pokemon.find((entry) => entry.id === selectedMemberId)?.id;
    if (pokeId) {
      const firstMove = currentRuleMovesForPokemon(pokeId).find((move) => move.category !== 'Status');
      const cfg = buildTemporaryCalcConfig({ pokemonId: pokeId, role: 'attacker', moveCategory: firstMove?.category ?? 'unknown' });
      setAttackerConfig(firstMove ? { ...cfg, selectedMoveId: firstMove.id, moveIds: [firstMove.id] } : cfg);
      setAttackerDirty(false);
    }
  }, [selectedMemberId, teams]);

  // Jump-in from a team member: carry the saved build into the chosen side, but reset moves to
  // the current-rule attacking list.
  const lastPresetRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!presetMember) {
      lastPresetRef.current = undefined;
      return;
    }
    const key = `${presetMember.memberId}:${presetMember.side}`;
    if (lastPresetRef.current === key) return;
    lastPresetRef.current = key;
    const found = teams.flatMap((team) => team.members).find((member) => member.id === presetMember.memberId);
    if (!found) return;
    const base = buildCalcConfigFromTeamMember(found);
    const firstMove = found.pokemonId
      ? currentRuleMovesForPokemon(found.pokemonId).find((move) => move.category !== 'Status')
      : undefined;
    setConfigFor(presetMember.side, { ...base, moveIds: firstMove ? [firstMove.id] : [], selectedMoveId: firstMove?.id }, false);
    setActiveSide(presetMember.side);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetMember, teams]);

  const currentMove = attackerConfig.selectedMoveId ? moves.find((move) => move.id === attackerConfig.selectedMoveId) : undefined;

  function pickPokemon(side: CalcSide, pokemonId: string) {
    const firstMove = currentRuleMovesForPokemon(pokemonId).find((move) => move.category !== 'Status');
    const cfg = buildTemporaryCalcConfig({ pokemonId, role: side, moveCategory: firstMove?.category ?? 'unknown' });
    const next = firstMove
      ? { ...cfg, selectedMoveId: firstMove.id, moveIds: Array.from(new Set([firstMove.id, ...cfg.moveIds.filter(Boolean)])).slice(0, 4) }
      : cfg;
    setConfigFor(side, next, false);
    if (side === 'attacker') onPickMember(pokemonId);
    setPickerSide(null);
  }

  function pickTeamMember(side: CalcSide, member: TeamMember) {
    if (!member.pokemonId) return;
    setConfigFor(side, buildCalcConfigFromTeamMember(member), false);
    if (side === 'attacker') onPickMember(member.id);
    setPickerSide(null);
  }

  function swapSides() {
    setAttackerConfig(defenderConfig);
    setDefenderConfig(attackerConfig);
    setAttackerDirty(defenderDirty);
    setDefenderDirty(attackerDirty);
  }

  const attackerSpIssues = validateStatPoints(attackerConfig.statPoints);
  const defenderSpIssues = validateStatPoints(defenderConfig.statPoints);
  const blockedBySp = attackerSpIssues.length > 0 || defenderSpIssues.length > 0;

  const damageKey = `${attackerConfig.pokemonId}|${attackerConfig.formId}|${attackerConfig.selectedMoveId}|${attackerConfig.nature}|${JSON.stringify(attackerConfig.statPoints)}|${JSON.stringify(attackerConfig.statStages)}|${attackerConfig.abilityId}|${attackerConfig.itemId}||${defenderConfig.pokemonId}|${defenderConfig.formId}|${defenderConfig.nature}|${JSON.stringify(defenderConfig.statPoints)}|${JSON.stringify(defenderConfig.statStages)}|${defenderConfig.abilityId}|${defenderConfig.itemId}||${battleType}|${weather}|${isCritical}|${currentMove?.category}`;
  const damageResult = useMemo(() => {
    if (!attackerConfig.selectedMoveId || !attackerConfig.pokemonId || !defenderConfig.pokemonId) return null;
    if (currentMove?.category === 'Status') return null;
    if (blockedBySp) return null;
    return computeDamage({ attacker: attackerConfig, defender: defenderConfig, battleType, weather, isCritical, attackStage: 0 });
    // eslint-disable-next-line
  }, [damageKey]);

  // 04-01 shows the last run on the tools landing. Wait for the inputs to settle so dragging an
  // SP slider does not write a row per frame.
  useEffect(() => {
    if (damageResult?.status !== 'experimental-success') return;
    const { minDamage, maxDamage, minPercent, maxPercent, possibleHkoText } = damageResult;
    if (minDamage === undefined || maxDamage === undefined || minPercent === undefined || maxPercent === undefined) return;
    if (!possibleHkoText) return;
    const entry = pokemon.find((candidate) => candidate.id === attackerConfig.pokemonId);
    const form = findBattleForm(entry?.id ?? '', attackerConfig.formId);
    const label = form?.chineseName ?? entry?.chineseName;
    if (!label) return;
    const timer = window.setTimeout(
      () => recordToolResult({
        tool: 'calculator',
        label,
        iconRef: form?.iconRef ?? entry?.iconRef,
        minDamage,
        maxDamage,
        minPercent,
        maxPercent,
        hko: possibleHkoText,
      }),
      RESULT_RECORD_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [attackerConfig.formId, attackerConfig.pokemonId, damageResult]);

  if (editorSide) {
    return (
      <SideEditor
        config={configFor(editorSide)}
        showMoves={editorSide === 'attacker'}
        side={editorSide}
        onChange={(next) => setConfigFor(editorSide, next, true)}
        onClose={() => setEditorSide(null)}
      />
    );
  }

  return (
    <div className="pb-8" data-calc-active-side={activeSide}>
      <PageHeader className="px-6 pt-5" subtitle="可从图鉴或队伍取配置 · 临时修改不写回队伍" title="伤害计算" />

      <div className="flex items-stretch gap-2.5 px-6 pt-5">
        <SideCard
          config={attackerConfig}
          side="attacker"
          onEdit={() => {
            setActiveSide('attacker');
            setEditorSide('attacker');
          }}
          onPick={() => {
            setActiveSide('attacker');
            setPickerSide('attacker');
          }}
        />
        <button
          aria-label="交换攻守双方"
          className="grid h-9 w-9 shrink-0 self-center place-items-center rounded-full bg-surface text-textLabel"
          type="button"
          onClick={swapSides}
        >
          <ArrowLeftRight size={17} />
        </button>
        <SideCard
          config={defenderConfig}
          side="defender"
          onEdit={() => {
            setActiveSide('defender');
            setEditorSide('defender');
          }}
          onPick={() => {
            setActiveSide('defender');
            setPickerSide('defender');
          }}
        />
      </div>

      <div className="px-6 pt-[18px]">
        <ListRow
          ariaLabel={currentMove ? `招式 ${currentMove.chineseName}` : '选择招式'}
          height={68}
          leading={currentMove ? <TypeDot type={currentMove.type} /> : <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-disabled" />}
          subtitle={currentMove ? moveMetaLine(currentMove) : '从进攻方的可学招式里选'}
          title={currentMove?.chineseName ?? '未选招式'}
          trailing={<ChevronRight className="shrink-0 text-chevron" size={18} />}
          onClick={() => setEditorSide('attacker')}
        />

        <div className="mt-3.5 flex gap-2">
          <Pill selected={battleType === 'doubles'} onClick={() => setBattleType('doubles')}>
            双打
          </Pill>
          <Pill selected={battleType === 'singles'} onClick={() => setBattleType('singles')}>
            单打
          </Pill>
          <span className="flex-1" />
          <Pill ariaLabel={`天气 ${weather}`} className="px-[13px]" onClick={() => setWeatherOpen(true)}>
            {weather}
            <ChevronDown size={14} />
          </Pill>
        </div>

        <div className="mt-3 flex h-12 items-center gap-3">
          <span className="min-w-0 flex-1 text-sm font-bold">会心一击</span>
          <Switch checked={isCritical} label="会心一击" onChange={setIsCritical} />
        </div>
      </div>

      <ResultCard
        attackerConfig={attackerConfig}
        defenderConfig={defenderConfig}
        move={currentMove}
        result={damageResult}
        onEditSide={setEditorSide}
      />

      <div className="px-6 pt-5">
        <SectionLabel>代入能力值</SectionLabel>
        <div className="mt-2">
          <ListRow
            height={44}
            title={<span className="text-[13px] font-semibold text-textSecondary">进攻方 攻击 / 速度</span>}
            trailing={
              <span className="shrink-0 text-sm font-extrabold tabular-nums">
                {damageResult?.attackerStats ? `${damageResult.attackerStats.attack} / ${damageResult.attackerStats.speed}` : '— / —'}
              </span>
            }
          />
          <ListRow
            divider={false}
            height={44}
            title={<span className="text-[13px] font-semibold text-textSecondary">防守方 HP / 防御</span>}
            trailing={
              <span className="shrink-0 text-sm font-extrabold tabular-nums">
                {damageResult?.defenderStats ? `${damageResult.defenderStats.hp} / ${damageResult.defenderStats.defense}` : '— / —'}
              </span>
            }
          />
        </div>
        <p className="mt-3 text-xs font-semibold text-textSecondary">公式 Gen9 · 招式参数取自 Champions 目录 · 结果为实验性近似</p>
      </div>

      {pickerSide && (
        <SidePicker
          battleType={battleType}
          environment={environment ?? null}
          selectedPokemonId={configFor(pickerSide).pokemonId}
          side={pickerSide}
          teamMembers={teamMembers}
          onClose={() => setPickerSide(null)}
          onPickMember={(member) => pickTeamMember(pickerSide, member)}
          onPickPokemon={(pokemonId) => pickPokemon(pickerSide, pokemonId)}
        />
      )}

      {weatherOpen && (
        <OptionSheet
          options={weatherOptions.map((option) => ({ id: option.id, label: option.id, note: option.note }))}
          selectedId={weather}
          title="天气"
          onClose={() => setWeatherOpen(false)}
          onSelect={(id) => {
            setWeather(id);
            setWeatherOpen(false);
          }}
        />
      )}
    </div>
  );
}
