import { Calculator, ChevronDown, ChevronUp, Minus, Plus, Search, Users, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { abilities as allAbilities, currentDataVersion, currentRuleNatureOptions, items as allItems, moves, pokemon } from '../data';
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
import { useAppStore } from '../state/AppContext';
import type { Move as AppMove, Pokemon, StatPoints, TeamMember } from '../types';
import { Card, PokemonAvatar, TypeBadge } from '../components/ui';

type CalcSide = 'attacker' | 'defender';

const weatherOptions = ['无天气', '晴天', '雨天', '沙暴', '雪天'];
const terrainOptions = ['无场地', '青草场地', '电气场地', '精神场地', '薄雾场地'];
const stageOptions = Array.from({ length: 13 }, (_, index) => String(index - 6));
const STAT_LABELS: Array<{ key: keyof StatPoints; label: string; stageKey?: keyof NonNullable<CalcSideConfig['statStages']> }> = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击', stageKey: 'attack' },
  { key: 'defense', label: '防御', stageKey: 'defense' },
  { key: 'specialAttack', label: '特攻', stageKey: 'specialAttack' },
  { key: 'specialDefense', label: '特防', stageKey: 'specialDefense' },
  { key: 'speed', label: '速度', stageKey: 'speed' },
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

const sourceLabel = (config: CalcSideConfig): string =>
  config.source === 'team-member' ? '来自队伍配置' : '手动临时配置';

const stageLabel = (value: number | string) => {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : String(numeric);
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

function StatPointPicker({
  label,
  value,
  onChange,
  onClose,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const nextValue = clampStatPointValue(value);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label} SP</p>
          <p className="text-xs text-textSecondary">拖动滑条，或直接设为最小 / 最大</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭 SP 调整" type="button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mb-4 text-center">
        <p className="text-[34px] font-bold text-accent">{nextValue}</p>
        <p className="text-xs text-textMuted">范围 0-{MAX_STAT_POINTS_PER_STAT}</p>
      </div>
      <input
        aria-label={`${label} SP`}
        className="mb-4 h-9 w-full accent-accent"
        max={MAX_STAT_POINTS_PER_STAT}
        min={0}
        type="range"
        value={nextValue}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="grid grid-cols-4 gap-2">
        <button className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border px-2 text-xs font-semibold text-textSecondary" type="button" onClick={() => onChange(0)}>
          min
        </button>
        <button
          aria-label={`${label} -1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
          disabled={nextValue <= 0}
          type="button"
          onClick={() => onChange(nextValue - 1)}
        >
          <Minus size={13} />
        </button>
        <button
          aria-label={`${label} +1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
          disabled={nextValue >= MAX_STAT_POINTS_PER_STAT}
          type="button"
          onClick={() => onChange(nextValue + 1)}
        >
          <Plus size={13} />
        </button>
        <button className="inline-flex min-h-8 items-center justify-center rounded-lg bg-accent px-2 text-xs font-semibold text-page" type="button" onClick={() => onChange(MAX_STAT_POINTS_PER_STAT)}>
          max
        </button>
      </div>
    </div>
  );
}

// ── SideConfigCard ──

function SummaryPokemonAvatar({
  iconRef,
  label,
  active,
}: {
  iconRef?: string;
  label: string;
  active: boolean;
}) {
  const isImage = Boolean(
    iconRef?.startsWith('http://') ||
      iconRef?.startsWith('https://') ||
      iconRef?.startsWith('/') ||
      iconRef?.startsWith('./') ||
      iconRef?.startsWith('../') ||
      iconRef?.startsWith('data:image/'),
  );

  return (
    <div
      className={`grid h-16 w-16 shrink-0 place-items-center rounded-full transition ${
        active ? 'border border-accent bg-accent/10 shadow-[0_0_0_4px_rgba(129,140,248,0.22)]' : 'border border-transparent bg-transparent'
      }`}
    >
      {isImage ? (
        <img src={iconRef} alt={label} className="h-14 w-14 object-contain" loading="lazy" decoding="async" />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-sm font-bold text-accent">
          {iconRef ?? label.charAt(0)}
        </span>
      )}
    </div>
  );
}

function SideConfigCard({
  config,
  onChange,
  showMoves,
  sideLabel,
  active,
  onSelect,
  selectorContent,
}: {
  config: CalcSideConfig;
  onChange: (next: CalcSideConfig, dirty: boolean) => void;
  showMoves?: boolean;
  configDirty: boolean;
  sideLabel: string;
  active: boolean;
  onSelect: () => void;
  selectorContent?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingStatKey, setEditingStatKey] = useState<keyof StatPoints | null>(null);
  const [moveQuery, setMoveQuery] = useState('');
  const pokemonEntry = pokemon.find((p) => p.id === config.pokemonId);
  const battleForm = findBattleForm(pokemonEntry?.id ?? '', config.formId) ?? (pokemonEntry ? findBattleForm(pokemonEntry.id, pokemonEntry.id) : undefined);
  const ability = allAbilities.find((a) => a.id === config.abilityId);
  const item = allItems.find((i) => i.id === config.itemId);
  const availableMoves = pokemonEntry ? currentRuleMovesForPokemon(pokemonEntry.id).filter((move) => move.category !== 'Status') : [];
  const filteredMoves = filterMovesByQuery(availableMoves, moveQuery);
  const selectedMove = availableMoves.find((move) => move.id === config.selectedMoveId);
  const visibleMoves = selectedMove && !filteredMoves.some((move) => move.id === selectedMove.id)
    ? [selectedMove, ...filteredMoves]
    : filteredMoves;
  const spTotal = totalStatPoints(config.statPoints);
  const spIssues = validateStatPoints(config.statPoints);
  const natureOptions = useMemo(sortedNatureOptions, []);
  const editingStat = STAT_LABELS.find((stat) => stat.key === editingStatKey);
  const currentTypes = battleForm?.types ?? pokemonEntry?.types ?? [];
  const detailVisible = active && expanded;

  const dirtyMark = (next: CalcSideConfig) => onChange(next, true);
  const selectMove = (moveId: string) => {
    if (!moveId) return;
    dirtyMark({
      ...config,
      selectedMoveId: moveId,
      moveIds: Array.from(new Set([moveId, ...config.moveIds.filter(Boolean)])).slice(0, 4),
    });
  };
  const updateMoveQuery = (nextQuery: string) => {
    setMoveQuery(nextQuery);
    const nextFilteredMoves = filterMovesByQuery(availableMoves, nextQuery);
    if (!normalizeSearchText(nextQuery) || nextFilteredMoves.length === 0) return;
    if (nextFilteredMoves.some((move) => move.id === config.selectedMoveId)) return;
    selectMove(nextFilteredMoves[0].id);
  };
  const updateStatPoint = (key: keyof StatPoints, value: number) => {
    dirtyMark({
      ...config,
      statPoints: {
        ...config.statPoints,
        [key]: clampStatPointValue(value),
      },
    });
  };
  const updateStatStage = (key: keyof NonNullable<CalcSideConfig['statStages']>, value: number) => {
    dirtyMark({
      ...config,
      statStages: {
        ...(config.statStages ?? {}),
        [key]: Math.max(-6, Math.min(6, value)),
      },
    });
  };

  return (
    <Card className={`${active ? 'border-accent bg-secondary' : 'bg-card'}`}>
      <div className="flex items-center gap-3">
        <button
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-transparent"
          type="button"
          title={`选择${sideLabel}`}
          onClick={onSelect}
        >
          <SummaryPokemonAvatar iconRef={battleForm?.iconRef ?? pokemonEntry?.iconRef} label={battleForm?.chineseName ?? pokemonEntry?.chineseName ?? '未配置'} active={active} />
        </button>
        <button
          aria-label={`选择${sideLabel} ${battleForm?.chineseName ?? pokemonEntry?.chineseName ?? '未配置 Pokemon'}`}
          className="min-w-0 flex-1 text-left"
          type="button"
          onClick={onSelect}
        >
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold text-textSecondary">{sideLabel}</p>
            {active && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">编辑中</span>}
          </div>
          <p className="mt-0.5 truncate text-base font-semibold">{battleForm?.chineseName ?? pokemonEntry?.chineseName ?? '未配置 Pokemon'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {currentTypes.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
          </div>
          <p className="mt-1 text-[11px] text-textSecondary">
            {config.nature} · {ability?.chineseName ?? '未选特性'} · {item?.chineseName ?? '无道具'}
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition ${
              detailVisible
                ? 'border-accent bg-accent text-page'
                : active
                  ? 'border-accent/50 bg-card text-accent'
                  : 'border-border bg-card text-textSecondary'
            }`}
            title={active ? (detailVisible ? '收起配置' : '编辑能力配置') : '切换到此侧'}
            aria-label={active ? (detailVisible ? '收起能力配置' : '展开能力配置') : '切换到此侧'}
            type="button"
            aria-expanded={detailVisible}
            onClick={() => {
              onSelect();
              if (active) setExpanded(!expanded);
            }}
          >
            <span>{active ? '能力配置' : '选择宝可梦'}</span>
            {detailVisible ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {active && selectorContent}

      {spIssues.length > 0 && (
        <div className="mt-2">
          {spIssues.map((issue, i) => <p key={i} className="text-[10px] text-danger">{issue}</p>)}
        </div>
      )}

      {detailVisible && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-[10px] text-textMuted">临时修改不会自动保存到队伍</p>

          {/* Form / Mega */}
          {pokemonEntry && pokemonEntry.megaForms.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-textMuted">形态</span>
              <select
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs outline-none"
                value={config.formId ?? pokemonEntry.id}
                onChange={(e) => dirtyMark({ ...config, formId: e.target.value !== pokemonEntry.id ? e.target.value : undefined })}
              >
                <option value={pokemonEntry.id}>原始形态</option>
                {pokemonEntry.megaForms.map((f) => <option key={f.id} value={f.id}>{f.chineseName}</option>)}
              </select>
            </label>
          )}

          {/* Nature */}
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-textMuted">性格</span>
            <select
              aria-label="性格"
              className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs outline-none"
              value={config.nature}
              onChange={(e) => dirtyMark({ ...config, nature: e.target.value })}
            >
              {natureOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {natureOptionLabel(opt.id)}
                </option>
              ))}
            </select>
          </label>

          {/* Abilities */}
          {pokemonEntry && (
            <label className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-textMuted">特性</span>
              <select
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs outline-none"
                value={config.abilityId ?? ''}
                onChange={(e) => dirtyMark({ ...config, abilityId: e.target.value || undefined })}
              >
                {pokemonEntry.abilities.map((aId) => {
                  const a = allAbilities.find((x) => x.id === aId);
                  return <option key={aId} value={aId}>{a?.chineseName ?? aId}</option>;
                })}
              </select>
            </label>
          )}

          {/* Item */}
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-textMuted">道具</span>
            <select
              className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs outline-none"
              value={config.itemId ?? ''}
              onChange={(e) => dirtyMark({ ...config, itemId: e.target.value || undefined })}
            >
              <option value="">无道具</option>
              {allItems.filter((i) => i.legalInCurrentRule).map((i) => <option key={i.id} value={i.id}>{i.chineseName}</option>)}
            </select>
          </label>

          {/* Moves */}
          {showMoves && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[11px] text-textMuted">招式</span>
                <label className="flex flex-1 items-center gap-2 rounded border border-border bg-card px-2 py-1">
                  <Search size={13} className="text-textMuted" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-textMuted"
                    placeholder="搜索攻击招式"
                    value={moveQuery}
                    onChange={(event) => updateMoveQuery(event.target.value)}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0" />
                <select
                  className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs outline-none"
                  value={config.selectedMoveId ?? ''}
                  onChange={(e) => {
                    const moveId = e.target.value;
                    selectMove(moveId);
                  }}
                >
                  {visibleMoves.map((m) => (
                    <option key={m.id} value={m.id}>{m.chineseName} / {m.englishName} · {m.power ?? '-'} · {m.type}</option>
                  ))}
                  {visibleMoves.length === 0 && <option value="">无匹配招式</option>}
                </select>
              </label>
            </div>
          )}

          {/* SP editor */}
          <fieldset className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-textMuted">能力配置：Champions SP 分配 / 能力阶级</p>
              <span className={`text-[11px] ${spIssues.length > 0 ? 'text-danger' : 'text-textMuted'}`}>
                已用 {spTotal}/{MAX_TOTAL_STAT_POINTS}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {STAT_LABELS.map(({ key, label, stageKey }) => {
                const stage = stageKey ? config.statStages?.[stageKey] ?? 0 : undefined;
                return (
                  <div key={key} className={`rounded-lg border bg-card p-2 ${spIssues.length > 0 ? 'border-danger' : 'border-border'}`}>
                    <button
                      aria-label={`${label} ${clampStatPointValue(config.statPoints[key] ?? 0)}`}
                      className="w-full text-left active:scale-[0.99]"
                      type="button"
                      onClick={() => setEditingStatKey(key)}
                    >
                      <span className="block text-[10px] text-textMuted">{label} SP</span>
                      <span className="mt-1 block text-base font-semibold text-textPrimary">{clampStatPointValue(config.statPoints[key] ?? 0)}</span>
                    </button>
                    {stageKey && (
                      <label className="mt-2 block">
                        <span className="mb-1 block text-[10px] text-textMuted">阶级</span>
                        <select
                          aria-label={`${label} 能力阶级`}
                          className="h-7 w-full rounded border border-border bg-secondary px-1 text-xs outline-none"
                          value={stage}
                          onChange={(event) => updateStatStage(stageKey, Number(event.target.value))}
                        >
                          {stageOptions.map((opt) => <option key={opt} value={opt}>{stageLabel(opt)}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <p className={`text-[10px] ${spIssues.length > 0 ? 'text-danger' : 'text-textMuted'}`}>
              单项最多 {MAX_STAT_POINTS_PER_STAT} · 总量最多 {MAX_TOTAL_STAT_POINTS}
            </p>
            {spIssues.length > 0 && (
              <p className="text-[10px] text-danger">
                SP 分配不合法：{spIssues.join('；')}。请修正后再计算。
              </p>
            )}
          </fieldset>
          {editingStat && (
            <StatPointPicker
              label={editingStat.label}
              value={config.statPoints[editingStat.key] ?? 0}
              onChange={(value) => updateStatPoint(editingStat.key, value)}
              onClose={() => setEditingStatKey(null)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

// ── DamageResultCard ──

function DamageResultCard({
  result,
  moveCategory,
  hasSelectedMove,
  spIssues,
}: {
  result: ReturnType<typeof computeDamage> | null;
  moveCategory?: string;
  hasSelectedMove: boolean;
  spIssues: string[];
}) {
  // SP illegal — show validation reasons without calling computeDamage
  if (spIssues.length > 0) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">伤害计算</p>
          <Calculator size={18} className="text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-textSecondary">SP 分配需要调整</p>
          <div className="mt-3 space-y-1">
            {spIssues.map((r, i) => <p key={i} className="text-[11px] text-danger">{r}</p>)}
          </div>
        </div>
      </Card>
    );
  }

  if (!hasSelectedMove) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">伤害计算</p>
          <Calculator size={18} className="text-accent" />
        </div>
        <p className="py-8 text-center text-sm text-textSecondary">请先选择招式</p>
      </Card>
    );
  }

  if (moveCategory === 'Status') {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">伤害计算</p>
          <Calculator size={18} className="text-accent" />
        </div>
        <p className="py-8 text-center text-sm text-textSecondary">变化招式不适用伤害计算</p>
      </Card>
    );
  }

  if (!result || result.status === 'invalid-input') {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">伤害计算</p>
          <Calculator size={18} className="text-accent" />
        </div>
        <div className="space-y-1">
          {(result?.blockedReasons ?? []).map((r, i) => <p key={i} className="text-[11px] text-textMuted">{r}</p>)}
        </div>
        {!result && <p className="py-8 text-center text-sm text-textSecondary">正在计算…</p>}
      </Card>
    );
  }

  if (result.status !== 'experimental-success') {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">伤害计算</p>
          <Calculator size={18} className="text-accent" />
        </div>
        <p className="text-sm font-semibold text-textSecondary">请调整当前组合</p>
        <div className="mt-3 space-y-1">
          {result.blockedReasons.map((r, i) => <p key={i} className="text-[11px] text-textMuted">{r}</p>)}
        </div>
        {result.assumptions.length > 0 && (
          <div className="mt-4 rounded-lg bg-secondary p-3">
            <p className="mb-1 text-[11px] font-semibold text-textSecondary">计算假设</p>
            {result.assumptions.map((a, i) => <p key={i} className="text-[10px] text-textMuted">{a}</p>)}
          </div>
        )}
      </Card>
    );
  }

  const typeMultiplier = result.typeEffectiveness ?? 1;
  const damageTone =
    typeMultiplier === 0
      ? 'text-textMuted'
      : typeMultiplier > 1
        ? 'text-danger'
        : typeMultiplier < 1
          ? 'text-accent'
          : 'text-textPrimary';
  const effectivenessBadge =
    typeMultiplier === 0
      ? 'border-textMuted/30 bg-textMuted/10 text-textMuted'
      : typeMultiplier > 1
        ? 'border-danger/40 bg-missingBg text-danger'
        : typeMultiplier < 1
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-border bg-secondary text-textSecondary';
  const koTone = (result.minDamage ?? 0) >= (result.defenderHp ?? Number.POSITIVE_INFINITY)
    ? 'border-danger/40 bg-missingBg text-danger'
    : (result.maxDamage ?? 0) * 2 >= (result.defenderHp ?? Number.POSITIVE_INFINITY)
      ? 'border-accent/40 bg-accent/15 text-accent'
      : 'border-border bg-secondary text-textSecondary';
  const modifierChips = [
    typeMultiplier !== 1
      ? (
          <span key="type" className={`rounded-full border px-2 py-1 font-semibold ${effectivenessBadge}`}>
            {result.typeEffectivenessText} ×{typeMultiplier}
          </span>
        )
      : null,
    (result.stabMultiplier ?? 1) !== 1
      ? (
          <span key="stab" className="rounded-full border border-accent/40 bg-accent/15 px-2 py-1 font-semibold text-accent">
            本系 ×{result.stabMultiplier}
          </span>
        )
      : null,
    (result.weatherMultiplier ?? 1) !== 1
      ? (
          <span key="weather" className="rounded-full border border-border bg-secondary px-2 py-1 text-textSecondary">
            {result.weatherText} ×{result.weatherMultiplier}
          </span>
        )
      : null,
    result.derivedSpreadDamage
      ? (
          <span key="spread" className="rounded-full border border-border bg-secondary px-2 py-1 text-textSecondary">
            分摊 ×{result.spreadMultiplier}
          </span>
        )
      : null,
    ...(result.abilityEffects ?? []).map((effect) => {
      const tone =
        effect.direction === 'boost'
          ? 'border-accent/40 bg-accent/15 text-accent'
          : effect.direction === 'immunity' || effect.direction === 'reduction'
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-border bg-secondary text-textSecondary';
      return (
        <span key={`ability-${effect.side}-${effect.abilityId}`} className={`rounded-full border px-2 py-1 font-semibold ${tone}`}>
          {effect.label} · {effect.text}
        </span>
      );
    }),
  ].filter(Boolean);

  return (
    <Card>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">伤害计算</p>
          <p className="text-[10px] text-textMuted">使用 Champions 招式参数与 SP 能力值</p>
        </div>
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">Gen9</span>
      </div>

      <div className="text-center">
        <p className={`text-[28px] font-bold ${damageTone}`}>{result.minPercent}% - {result.maxPercent}%</p>
        <p className="mt-1 text-sm text-textSecondary">{result.minDamage} - {result.maxDamage} 伤害 / 对方 HP: {result.defenderHp ?? '-'}</p>
      </div>

      {modifierChips.length > 0 && (
        <>
          <div className="my-4 h-px bg-divider" />
          <div className="flex flex-wrap justify-center gap-2 text-[11px]">
            {modifierChips}
          </div>
        </>
      )}

      <div className={`mt-4 rounded-lg border px-4 py-3 text-center ${koTone}`}>
        <p className="text-[11px] uppercase tracking-wide opacity-75">结论</p>
        <p className="mt-1 text-[18px] font-bold leading-tight">{result.possibleHkoText}</p>
      </div>
      <p className="mt-4 text-center text-[10px] text-textMuted">
        公式：Gen9 · 招式参数：Champions 目录 · 数据 {currentDataVersion.versionName}
      </p>
    </Card>
  );
}

// ── Main page ──

export function CalculatorPage({
  selectedMemberId,
  onPickMember,
}: {
  selectedMemberId?: string;
  onPickMember: (memberId: string) => void;
}) {
  const { teams } = useAppStore();

  // Stable: teamMembers only recomputed when teams change
  const teamMembers = useMemo(
    () => teams.flatMap((t) => t.members.map((m) => ({ team: t, member: m }))),
    [teams],
  );

  const firstPokemonId = pokemon[0]?.id ?? '';

  const [activeSide, setActiveSide] = useState<CalcSide>('attacker');
  const [attackerConfig, setAttackerConfig] = useState<CalcSideConfig>(() =>
    buildTemporaryCalcConfig({ pokemonId: firstPokemonId, role: 'attacker' }),
  );
  const [defenderConfig, setDefenderConfig] = useState<CalcSideConfig>(() =>
    buildTemporaryCalcConfig({ pokemonId: pokemon[1]?.id ?? firstPokemonId, role: 'defender' }),
  );
  const [attackerDirty, setAttackerDirty] = useState(false);
  const [defenderDirty, setDefenderDirty] = useState(false);

  const [query, setQuery] = useState('');
  const [battleType, setBattleType] = useState<BattleTypeOption>('doubles');
  const [weather, setWeather] = useState(weatherOptions[0]);
  const [terrain, setTerrain] = useState(terrainOptions[0]);
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  // Guard: only apply selectedMemberId ONCE, never overwrite user edits
  const lastAppliedMemberIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedMemberId) return;
    if (lastAppliedMemberIdRef.current === selectedMemberId) return;
    lastAppliedMemberIdRef.current = selectedMemberId;

    const found = teamMembers.find(({ member }) => member.id === selectedMemberId);
    if (found) {
      setAttackerConfig(buildCalcConfigFromTeamMember(found.member));
      setAttackerDirty(false);
      return;
    }

    const pokeId = pokemon.find((p) => p.id === selectedMemberId)?.id;
    if (pokeId) {
      setAttackerConfig(buildTemporaryCalcConfig({ pokemonId: pokeId, role: 'attacker' }));
      setAttackerDirty(false);
    }
  }, [selectedMemberId, teamMembers]);

  const attackerEntry = pokemon.find((p) => p.id === attackerConfig.pokemonId) ?? pokemon[0];
  const defenderEntry = pokemon.find((p) => p.id === defenderConfig.pokemonId) ?? pokemon[1] ?? pokemon[0];
  const attackerBattleForm = findBattleForm(attackerEntry.id, attackerConfig.formId) ?? findBattleForm(attackerEntry.id, attackerEntry.id);
  const defenderBattleForm = findBattleForm(defenderEntry.id, defenderConfig.formId) ?? findBattleForm(defenderEntry.id, defenderEntry.id);

  const availableMoves = currentRuleMovesForPokemon(attackerEntry.id).filter((move) => move.category !== 'Status');
  const currentMove = moves.find((m) => m.id === attackerConfig.selectedMoveId) ?? availableMoves[0];

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPokemon = useMemo(
    () => (normalizedQuery ? pokemon.filter((p) => `${p.chineseName} ${p.englishName}`.toLowerCase().includes(normalizedQuery)) : []),
    [normalizedQuery],
  );
  const recommended = useMemo(() => {
    return teamMembers
      .map(({ team, member }) => {
        const entry = pokemon.find((c) => c.id === member.pokemonId);
        return entry ? { teamName: team.name, member, entry } : undefined;
      })
      .filter(Boolean)
      .slice(0, 8) as Array<{ teamName: string; member: TeamMember; entry: Pokemon }>;
  }, [teamMembers]);

  function pickPokemon(pokemonId: string) {
    const role: 'attacker' | 'defender' = activeSide;
    const firstMove = currentRuleMovesForPokemon(pokemonId).find((move) => move.category !== 'Status');
    const cfg = buildTemporaryCalcConfig({ pokemonId, role, moveCategory: firstMove?.category ?? 'unknown' });
    const nextConfig = firstMove
      ? {
          ...cfg,
          selectedMoveId: firstMove.id,
          moveIds: Array.from(new Set([firstMove.id, ...cfg.moveIds.filter(Boolean)])).slice(0, 4),
        }
      : cfg;
    if (activeSide === 'attacker') {
      setAttackerConfig(nextConfig);
      setAttackerDirty(false);
      onPickMember(pokemonId);
    } else {
      setDefenderConfig(nextConfig);
      setDefenderDirty(false);
    }
    setQuery('');
  }

  function pickTeamMember(member: TeamMember) {
    if (!member.pokemonId) return;
    if (activeSide === 'attacker') {
      setAttackerConfig(buildCalcConfigFromTeamMember(member));
      setAttackerDirty(false);
      onPickMember(member.id);
    } else {
      setDefenderConfig(buildCalcConfigFromTeamMember(member));
      setDefenderDirty(false);
    }
  }

  // SP issues for pre-calculation display
  const attackerSpIssues = validateStatPoints(attackerConfig.statPoints);
  const defenderSpIssues = validateStatPoints(defenderConfig.statPoints);
  const allSpIssues = [
    ...attackerSpIssues.map((s) => `进攻方: ${s}`),
    ...defenderSpIssues.map((s) => `防守方: ${s}`),
  ];

  // Compute damage — illegal SP is stopped in the UI before invoking the adapter
  const damageKey = `${attackerConfig.pokemonId}|${attackerConfig.formId}|${attackerConfig.selectedMoveId}|${attackerConfig.nature}|${JSON.stringify(attackerConfig.statPoints)}|${JSON.stringify(attackerConfig.statStages)}|${attackerConfig.abilityId}|${attackerConfig.itemId}||${defenderConfig.pokemonId}|${defenderConfig.formId}|${defenderConfig.nature}|${JSON.stringify(defenderConfig.statPoints)}|${JSON.stringify(defenderConfig.statStages)}|${defenderConfig.abilityId}|${defenderConfig.itemId}||${battleType}|${weather}|${terrain}|${currentMove?.category}`;
  const damageResult = useMemo(() => {
    if (!attackerConfig.selectedMoveId || !attackerConfig.pokemonId || !defenderConfig.pokemonId) return null;
    if (currentMove?.category === 'Status') return null;
    if (allSpIssues.length > 0) return null;
    return computeDamage({
      attacker: attackerConfig,
      defender: defenderConfig,
      battleType,
      weather,
      terrain,
      attackStage: 0,
    });
    // eslint-disable-next-line
  }, [damageKey]);

  const pokemonSelectorContent = (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{activeSide === 'attacker' ? '选择进攻方' : '选择防守方'}</p>
          <p className="text-[11px] text-textSecondary">搜索图鉴，或从队伍导入配置</p>
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search size={16} className="text-textMuted" />
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-textMuted" placeholder="搜索名称" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {recommended.length > 0 && (
        <div className="mt-2">
          <button
            className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-textSecondary"
            type="button"
            onClick={() => setShowTeamPicker((value) => !value)}
          >
            <Users size={14} />
            从队伍选择
          </button>
          {showTeamPicker && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {recommended.map(({ member, entry }) => (
                <button
                  key={member.id}
                  className={`rounded-lg border bg-card px-3 py-2 text-left text-xs ${
                    (activeSide === 'attacker' ? attackerConfig.sourceMemberId === member.id : defenderConfig.sourceMemberId === member.id) ? 'border-accent' : 'border-border'
                  }`}
                  type="button"
                  onClick={() => {
                    pickTeamMember(member);
                    setShowTeamPicker(false);
                  }}
                >
                  <p className="truncate font-semibold">{entry.chineseName}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {normalizedQuery && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {filteredPokemon.map((entry) => {
            const selected = activeSide === 'attacker' ? attackerConfig.pokemonId === entry.id : defenderConfig.pokemonId === entry.id;
            return (
              <button
                key={entry.id}
                className={`rounded-lg border bg-card p-2 text-left ${selected ? 'border-accent' : 'border-border'}`}
                type="button"
                onClick={() => pickPokemon(entry.id)}
              >
                <div className="flex items-center gap-2">
                  <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{entry.chineseName}</p>
                    <div className="mt-1 flex gap-1">{entry.types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">伤害计算</h2>
        <p className="text-xs text-textSecondary">攻防双方可从当前规则图鉴或队伍选择 · 临时修改不会自动保存</p>
      </div>

      <SideConfigCard
        config={attackerConfig}
        onChange={(next, dirty) => { setAttackerConfig(next); if (dirty) setAttackerDirty(true); }}
        showMoves
        configDirty={attackerDirty}
        sideLabel="进攻方"
        active={activeSide === 'attacker'}
        onSelect={() => setActiveSide('attacker')}
        selectorContent={activeSide === 'attacker' ? pokemonSelectorContent : undefined}
      />
      <div className="flex justify-center text-textMuted">↓</div>
      <SideConfigCard
        config={defenderConfig}
        onChange={(next, dirty) => { setDefenderConfig(next); if (dirty) setDefenderDirty(true); }}
        configDirty={defenderDirty}
        sideLabel="防守方"
        active={activeSide === 'defender'}
        onSelect={() => setActiveSide('defender')}
        selectorContent={activeSide === 'defender' ? pokemonSelectorContent : undefined}
      />

      {/* Battle conditions */}
      <Card>
        <div className="flex items-center gap-3">
          {currentMove && <TypeBadge type={currentMove.type} />}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-textSecondary">招式</p>
            <p className="truncate text-base font-semibold">{currentMove ? `${currentMove.chineseName} · ${currentMove.power ?? '-'} 威力` : '未选择招式'}</p>
            <p className="text-[11px] text-textMuted">{currentMove?.category === 'Physical' ? '物理' : currentMove?.category === 'Special' ? '特殊' : '变化'}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1.15fr_1fr_1fr] gap-2">
          <div className="min-w-0">
            <span className="mb-1 block text-[10px] text-textMuted">规则</span>
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-secondary">
              {(['doubles', 'singles'] as const).map((opt) => (
                <button key={opt} className={`min-h-8 text-xs font-semibold ${battleType === opt ? 'bg-accent text-page' : 'text-textSecondary'}`} type="button" onClick={() => setBattleType(opt)}>
                  {opt === 'doubles' ? '双打' : '单打'}
                </button>
              ))}
            </div>
          </div>
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] text-textMuted">天气</span>
            <select className="h-8 w-full rounded-lg border border-border bg-secondary px-2 text-xs outline-none" value={weather} onChange={(e) => setWeather(e.target.value)}>
              {weatherOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] text-textMuted">场地</span>
            <select className="h-8 w-full rounded-lg border border-border bg-secondary px-2 text-xs outline-none" value={terrain} onChange={(e) => setTerrain(e.target.value)}>
              {terrainOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {/* Damage result */}
      <DamageResultCard
        result={damageResult}
        moveCategory={currentMove?.category}
        hasSelectedMove={Boolean(attackerConfig.selectedMoveId)}
        spIssues={allSpIssues}
      />

    </div>
  );
}
