import { AlertTriangle, Calculator, ChevronDown, ChevronUp, Minus, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { Pokemon, StatPoints, TeamMember } from '../types';
import { Badge, Card, PokemonAvatar, TypeBadge } from '../components/ui';

type CalcSide = 'attacker' | 'defender';

const weatherOptions = ['无天气', '晴天', '雨天', '沙暴', '雪天'];
const terrainOptions = ['无场地', '青草场地', '电气场地', '精神场地', '薄雾场地'];
const stageOptions = ['0', '+1', '+2', '-1', '-2'];
const STAT_LABELS: Array<{ key: keyof StatPoints; label: string }> = [
  { key: 'hp', label: 'HP' },
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

const sourceLabel = (config: CalcSideConfig): string =>
  config.source === 'team-member' ? '来自队伍配置' : '手动临时配置';

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

function SideConfigCard({
  config,
  onChange,
  showMoves,
  configDirty,
}: {
  config: CalcSideConfig;
  onChange: (next: CalcSideConfig, dirty: boolean) => void;
  showMoves?: boolean;
  configDirty: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingStatKey, setEditingStatKey] = useState<keyof StatPoints | null>(null);
  const pokemonEntry = pokemon.find((p) => p.id === config.pokemonId);
  const battleForm = findBattleForm(pokemonEntry?.id ?? '', config.formId) ?? (pokemonEntry ? findBattleForm(pokemonEntry.id, pokemonEntry.id) : undefined);
  const ability = allAbilities.find((a) => a.id === config.abilityId);
  const item = allItems.find((i) => i.id === config.itemId);
  const availableMoves = pokemonEntry ? currentRuleMovesForPokemon(pokemonEntry.id) : [];
  const spTotal = totalStatPoints(config.statPoints);
  const spIssues = validateStatPoints(config.statPoints);
  const spSummary = STAT_LABELS.map(({ key, label }) => {
    const v = clampStatPointValue(config.statPoints[key] ?? 0);
    return v > 0 ? `${label} ${v}` : null;
  }).filter(Boolean).join(' · ') || '未分配 SP';
  const natureOptions = useMemo(sortedNatureOptions, []);
  const editingStat = STAT_LABELS.find((stat) => stat.key === editingStatKey);

  const dirtyMark = (next: CalcSideConfig) => onChange(next, true);
  const updateStatPoint = (key: keyof StatPoints, value: number) => {
    dirtyMark({
      ...config,
      statPoints: {
        ...config.statPoints,
        [key]: clampStatPointValue(value),
      },
    });
  };

  return (
    <Card className="bg-secondary">
      <div className="flex items-center gap-3">
        <PokemonAvatar iconRef={battleForm?.iconRef ?? pokemonEntry?.iconRef} label={battleForm?.chineseName ?? pokemonEntry?.chineseName ?? '未配置'} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{battleForm?.chineseName ?? pokemonEntry?.chineseName ?? '未配置 Pokemon'}</p>
          <p className="text-[10px] text-textMuted">
            {sourceLabel(config)}{configDirty ? ' · 已修改未保存' : ''} · Lv.50 固定
          </p>
          <p className="mt-0.5 text-[11px] text-textSecondary">
            {config.nature} · {ability?.chineseName ?? '未选特性'} · {item?.chineseName ?? '无道具'}
          </p>
          <p className={`text-[11px] ${spIssues.length > 0 ? 'text-red-400' : 'text-textSecondary'}`}>
            Champions SP 已用 {spTotal}/66 · {spSummary}
          </p>
          {spIssues.length > 0 && (
            <div className="mt-1">
              {spIssues.map((issue, i) => <p key={i} className="text-[10px] text-red-400">{issue}</p>)}
            </div>
          )}
        </div>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-textMuted"
          title={expanded ? '收起配置' : '编辑能力配置'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
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
            <label className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-textMuted">招式</span>
              <select
                className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs outline-none"
                value={config.selectedMoveId ?? ''}
                onChange={(e) => {
                  const moveId = e.target.value;
                  if (!moveId) return;
                  dirtyMark({
                    ...config,
                    selectedMoveId: moveId,
                    moveIds: Array.from(new Set([moveId, ...config.moveIds.filter(Boolean)])).slice(0, 4),
                  });
                }}
              >
                {availableMoves.map((m) => (
                  <option key={m.id} value={m.id}>{m.chineseName} / {m.englishName}</option>
                ))}
              </select>
            </label>
          )}

          {/* SP editor */}
          <fieldset className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-textMuted">Champions SP 分配</p>
              <span className={`text-[11px] ${spIssues.length > 0 ? 'text-red-400' : 'text-textMuted'}`}>
                已用 {spTotal}/{MAX_TOTAL_STAT_POINTS}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {STAT_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`rounded-lg border bg-card p-2 text-left active:scale-[0.99] ${spIssues.length > 0 ? 'border-red-400' : 'border-border'}`}
                  type="button"
                  onClick={() => setEditingStatKey(key)}
                >
                  <span className="block text-[10px] text-textMuted">{label}</span>
                  <span className="mt-1 block text-base font-semibold text-textPrimary">{clampStatPointValue(config.statPoints[key] ?? 0)}</span>
                </button>
              ))}
            </div>
            <p className={`text-[10px] ${spIssues.length > 0 ? 'text-red-400' : 'text-textMuted'}`}>
              单项最多 {MAX_STAT_POINTS_PER_STAT} · 总量最多 {MAX_TOTAL_STAT_POINTS}
            </p>
            {spIssues.length > 0 && (
              <p className="text-[10px] text-red-400">
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
  defenderBaseHp,
  hasSelectedMove,
  spIssues,
}: {
  result: ReturnType<typeof computeDamage> | null;
  moveCategory?: string;
  defenderBaseHp: number;
  hasSelectedMove: boolean;
  spIssues: string[];
}) {
  // SP illegal — show blocked reasons even without calling computeDamage
  if (spIssues.length > 0) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">实验性伤害计算</p>
          <Calculator size={18} className="text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-textSecondary">当前组合无法进行实验性计算</p>
          <div className="mt-3 space-y-1">
            {spIssues.map((r, i) => <p key={i} className="text-[11px] text-red-400">{r}</p>)}
          </div>
        </div>
      </Card>
    );
  }

  if (!hasSelectedMove) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">实验性伤害计算</p>
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
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">实验性伤害计算</p>
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
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">实验性伤害计算</p>
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
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">实验性伤害计算</p>
          <Calculator size={18} className="text-accent" />
        </div>
        <p className="text-sm font-semibold text-textSecondary">当前组合无法进行实验性计算</p>
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

  return (
    <Card>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-textSecondary">实验性伤害计算</p>
          <p className="text-[10px] text-textMuted">主线机制近似结果</p>
        </div>
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">实验性</span>
      </div>

      <div className="text-center">
        <p className="text-[28px] font-bold text-white">{result.minPercent}% - {result.maxPercent}%</p>
        <p className="mt-1 text-sm text-textSecondary">{result.minDamage} - {result.maxDamage} 伤害 / 对方 HP: {defenderBaseHp}</p>
      </div>

      <div className="my-5 h-px bg-divider" />

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <span className={`rounded-lg border px-2 py-3 ${(result.maxPercent ?? 0) >= 100 ? 'bg-accent font-semibold text-page' : 'border-border text-textMuted'}`}>一确</span>
        <span className={`rounded-lg border px-2 py-3 ${(result.maxPercent ?? 0) >= 50 && (result.minPercent ?? 0) < 100 ? 'bg-accent font-semibold text-page' : 'border-border text-textMuted'}`}>二确</span>
        <span className={`rounded-lg border px-2 py-3 ${(result.maxPercent ?? 0) < 50 ? 'bg-accent font-semibold text-page' : 'border-border text-textMuted'}`}>三确</span>
      </div>

      <p className="mt-3 text-center text-[11px] text-textMuted">{result.possibleHkoText}</p>
      <p className="mt-4 text-center text-[10px] text-textMuted">
        非官方 Champions 正式结论 · 仅供调试和队伍比较参考 · 数据 {currentDataVersion.versionName}
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
  const [attackStage, setAttackStage] = useState('0');

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

  const availableMoves = currentRuleMovesForPokemon(attackerEntry.id);
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
    const cfg = buildTemporaryCalcConfig({ pokemonId, role, moveCategory: 'unknown' });
    if (activeSide === 'attacker') {
      setAttackerConfig(cfg);
      setAttackerDirty(false);
      onPickMember(pokemonId);
    } else {
      setDefenderConfig(cfg);
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

  // SP issues for pre-blocked display
  const attackerSpIssues = validateStatPoints(attackerConfig.statPoints);
  const defenderSpIssues = validateStatPoints(defenderConfig.statPoints);
  const allSpIssues = [
    ...attackerSpIssues.map((s) => `进攻方: ${s}`),
    ...defenderSpIssues.map((s) => `防守方: ${s}`),
  ];

  // Compute damage — illegal SP is blocked in the UI before invoking the experimental adapter
  const damageKey = `${attackerConfig.pokemonId}|${attackerConfig.formId}|${attackerConfig.selectedMoveId}|${attackerConfig.nature}|${JSON.stringify(attackerConfig.statPoints)}|${attackerConfig.abilityId}|${attackerConfig.itemId}||${defenderConfig.pokemonId}|${defenderConfig.formId}|${defenderConfig.nature}|${JSON.stringify(defenderConfig.statPoints)}|${defenderConfig.abilityId}|${defenderConfig.itemId}||${battleType}|${weather}|${terrain}|${attackStage}|${currentMove?.category}`;
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
      attackStage: Number(attackStage) || 0,
    });
    // eslint-disable-next-line
  }, [damageKey]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">伤害计算</h2>
        <p className="text-xs text-textSecondary">攻防双方可从当前规则图鉴或队伍选择 · 临时修改不会自动保存</p>
      </div>

      {/* Attacker / Defender selector */}
      <div className="grid grid-cols-[1fr_24px_1fr] items-center gap-2">
        <button
          className={`rounded-lg border p-3 text-left ${activeSide === 'attacker' ? 'border-accent bg-card' : 'border-border bg-card'}`}
          onClick={() => setActiveSide('attacker')}
        >
          <p className="text-[11px] text-textSecondary">进攻方</p>
          <p className="truncate text-sm font-semibold">{attackerBattleForm?.chineseName ?? '未配置'}</p>
          <div className="mt-1 flex gap-1">{(attackerBattleForm?.types ?? attackerEntry.types).map((t) => <TypeBadge key={t} type={t} size="sm" />)}</div>
        </button>
        <span className="text-center text-textMuted">→</span>
        <button
          className={`rounded-lg border p-3 text-left ${activeSide === 'defender' ? 'border-accent bg-card' : 'border-border bg-card'}`}
          onClick={() => setActiveSide('defender')}
        >
          <p className="text-[11px] text-textSecondary">防守方</p>
          <p className="truncate text-sm font-semibold">{defenderBattleForm?.chineseName ?? '未配置'}</p>
          <div className="mt-1 flex gap-1">{(defenderBattleForm?.types ?? defenderEntry.types).map((t) => <TypeBadge key={t} type={t} size="sm" />)}</div>
        </button>
      </div>

      {/* Config cards */}
      <SideConfigCard
        config={attackerConfig}
        onChange={(next, dirty) => { setAttackerConfig(next); if (dirty) setAttackerDirty(true); }}
        showMoves
        configDirty={attackerDirty}
      />
      <SideConfigCard
        config={defenderConfig}
        onChange={(next, dirty) => { setDefenderConfig(next); if (dirty) setDefenderDirty(true); }}
        configDirty={defenderDirty}
      />

      {/* Battle conditions */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-textSecondary">招式 · 战斗条件</p>
            <p className="text-xs font-semibold">{currentMove?.chineseName} {currentMove?.englishName} · {currentMove?.type} · {currentMove?.power ?? '-'} 威力</p>
          </div>
          <Badge status="version">实验性</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="mb-1 block text-[11px] text-textMuted">规则</span>
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">
              {(['doubles', 'singles'] as const).map((opt) => (
                <button key={opt} className={`min-h-9 text-xs font-semibold ${battleType === opt ? 'bg-accent text-page' : 'bg-secondary text-textSecondary'}`} type="button" onClick={() => setBattleType(opt)}>
                  {opt === 'doubles' ? '双打' : '单打'}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="mb-1 block text-[11px] text-textMuted">进攻能力</span>
            <select className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none" value={attackStage} onChange={(e) => setAttackStage(e.target.value)}>
              {stageOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] text-textMuted">天气</span>
            <select className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none" value={weather} onChange={(e) => setWeather(e.target.value)}>
              {weatherOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] text-textMuted">场地</span>
            <select className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none" value={terrain} onChange={(e) => setTerrain(e.target.value)}>
              {terrainOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {/* Damage result */}
      <DamageResultCard
        result={damageResult}
        moveCategory={currentMove?.category}
        defenderBaseHp={defenderBattleForm?.baseStats.hp ?? defenderEntry.baseStats.hp}
        hasSelectedMove={Boolean(attackerConfig.selectedMoveId)}
        spIssues={allSpIssues}
      />

      {/* Mechanism warning — normal flow, no absolute positioning */}
      <Card className="border border-warning/30 bg-reviewBg">
        <div className="flex items-center gap-2 text-warning">
          <AlertTriangle size={16} />
          <span className="text-xs font-semibold">实验性计算说明 · 机制待确认</span>
        </div>
        <p className="mt-2 text-[11px] text-warning/80">
          Champions 伤害公式、部分 Mega 细节、道具 / 特性 / 招式特殊交互仍未完全验证。
          当前结果基于主线机制近似（@smogon/calc），不保证与正式 Pokémon Champions 完全一致。
          非官方 Champions 正式结论 · 仅供调试和队伍比较参考。
        </p>
      </Card>

      {/* Pokémon selector */}
      <Card className="bg-secondary">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">选择{activeSide === 'attacker' ? '进攻方' : '防守方'}</p>
            <p className="text-xs text-textSecondary">可搜索当前规则图鉴，队伍成员会优先推荐</p>
          </div>
          <Badge status="version">{activeSide === 'attacker' ? '进攻' : '防守'}</Badge>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search size={16} className="text-textMuted" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-textMuted" placeholder="搜索名称" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>

        {recommended.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-textMuted">当前队伍推荐</p>
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {recommended.map(({ teamName, member, entry }) => (
                <button key={member.id} className="min-w-[116px] rounded-lg border bg-card p-2 text-left border-border" onClick={() => pickTeamMember(member)}>
                  <div className="mb-2"><PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} /></div>
                  <p className="truncate text-xs font-semibold">{entry.chineseName}</p>
                  <p className="truncate text-[11px] text-textMuted">{teamName}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {normalizedQuery && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {filteredPokemon.map((entry) => (
              <button key={entry.id} className="rounded-lg border border-border bg-card p-2 text-left" onClick={() => pickPokemon(entry.id)}>
                <div className="mb-2 flex items-center gap-2">
                  <PokemonAvatar iconRef={entry.iconRef} label={entry.chineseName} />
                  <div className="min-w-0"><p className="truncate text-xs font-semibold">{entry.chineseName}</p></div>
                </div>
                <div className="flex gap-1">{entry.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
