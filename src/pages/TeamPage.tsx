import { ArrowLeft, BarChart3, ChevronUp, Edit3, Minus, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { abilities, currentRuleNatureOptions, items, moves, pokemon } from '../data';
import { buildTeamAnalysisDetails, memberBattleStats, memberLabel, statRows } from '../lib/calculations';
import { currentRuleMovesForPokemon, currentRuleNatures, currentRuleSelectableItemsForPokemon, natureOptionLabel } from '../lib/currentRuleCatalog';
import { createId } from '../lib/id';
import { evaluateMemberLegality } from '../lib/legality';
import { findBattleForm, getMemberBattleForm } from '../lib/pokemonForms';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointTotal } from '../lib/statPoints';
import { useAppStore } from '../state/AppContext';
import type { Item, Move, Team, TeamMember } from '../types';
import { PokemonPicker } from '../components/PokemonPicker';
import { RuleSummary, SyncStrip } from '../components/RuleSummary';
import { Badge, Button, Card, Chip, EmptyState, PokemonAvatar, TypeBadge } from '../components/ui';

const blankMember = (): TeamMember => ({
  id: createId('member'),
  moveIds: [],
  nature: '爽朗',
  statPoints: { speed: 32 },
  level: 50,
  notes: '',
  legalityStatus: 'missing-config',
});

function HeldItemIcon({
  iconRef,
  label,
  className = 'h-6 w-6',
}: {
  iconRef?: string;
  label: string;
  className?: string;
}) {
  if (!iconRef) return <span className={`shrink-0 ${className}`} aria-hidden="true" />;

  return (
    <img
      className={`shrink-0 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${className}`}
      src={iconRef}
      alt={label}
      loading="lazy"
      decoding="async"
    />
  );
}

function HeldItemLine({ item, className = '' }: { item?: Item; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-textSecondary ${className}`}>
      {item?.iconRef && <HeldItemIcon iconRef={item.iconRef} label={item.chineseName} className="h-4 w-4" />}
      <span className="truncate">{item?.chineseName ?? '未选道具'}</span>
    </span>
  );
}

function MemberCard({
  team,
  member,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  team: Team;
  member: TeamMember;
  expanded: boolean;
  onToggle: (memberId: string) => void;
  onEdit: (member: TeamMember) => void;
  onDelete: (memberId: string) => void | Promise<void>;
}) {
  const entry = pokemon.find((item) => item.id === member.pokemonId);
  const battleForm = getMemberBattleForm(member);
  const item = items.find((candidate) => candidate.id === member.itemId);
  const ability = abilities.find((candidate) => candidate.id === member.abilityId);
  const learnedMoves = member.moveIds.map((id) => moves.find((move) => move.id === id)?.chineseName).filter(Boolean);
  const battleStats = memberBattleStats(member);
  const configuredStats = [
    ['HP', member.statPoints.hp ?? 0],
    ['攻击', member.statPoints.attack ?? 0],
    ['防御', member.statPoints.defense ?? 0],
    ['特攻', member.statPoints.specialAttack ?? 0],
    ['特防', member.statPoints.specialDefense ?? 0],
    ['速度', member.statPoints.speed ?? 0],
  ].filter(([, value]) => Number(value) > 0);

  return (
    <Card className={`relative ${expanded ? 'col-span-2' : 'min-h-[136px]'} bg-card`}>
      {!expanded && (
        <button
          className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-lg text-textMuted active:scale-[0.98]"
          title="删除成员"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onDelete(member.id);
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
      <button className="block w-full text-left" onClick={() => onToggle(member.id)}>
        <div className={expanded ? 'flex gap-3' : 'flex flex-col items-center text-center'}>
          <div className={`${expanded ? '' : 'mb-2'} shrink-0`}>
            <PokemonAvatar iconRef={battleForm?.iconRef ?? entry?.iconRef} label={battleForm?.chineseName ?? entry?.chineseName ?? '未配置 Pokemon'} size={expanded ? 'md' : 'xl'} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`${expanded ? 'mb-1 justify-start' : 'mb-1 justify-center'} flex flex-wrap items-center gap-1.5`}>
              <h3 className="truncate text-sm font-semibold">{battleForm?.chineseName ?? memberLabel(member)}</h3>
              {expanded &&
                battleForm?.types.map((type) => (
                  <TypeBadge key={type} type={type} size="sm" />
                ))}
            </div>
            {!expanded && (
              <div className="mt-2 flex min-h-5 justify-center gap-1">
                {battleForm?.types.map((type) => (
                  <TypeBadge key={type} type={type} size="sm" />
                ))}
              </div>
            )}
            {!expanded && <HeldItemLine item={item} className="mx-auto mt-2 max-w-[120px] justify-center text-[11px]" />}
            {expanded && (
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-textSecondary">
                <HeldItemLine item={item} className="min-w-0 max-w-[140px]" />
                <span className="shrink-0">·</span>
                <span className="truncate">{ability?.chineseName ?? '未选特性'}</span>
              </p>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-textSecondary">
                <span>性格</span>
                <span className="font-semibold text-textPrimary">{member.nature}</span>
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto pb-1 hide-scrollbar">
                {(learnedMoves.length ? learnedMoves : ['未配置招式']).map((move) => (
                  <Chip key={move}>{move}</Chip>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="grid h-8 w-8 place-items-center rounded-lg text-textMuted" title="编辑成员" onClick={() => onEdit(member)}>
                <Edit3 size={15} />
              </button>
              <button className="grid h-8 w-8 place-items-center rounded-lg text-textMuted" title="收起成员" onClick={() => onToggle(member.id)}>
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          {battleForm && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="rounded-lg bg-elevated p-2 text-left active:scale-[0.99]" type="button" onClick={() => onEdit(member)}>
                  <p className="text-[11px] text-textSecondary">能力配置</p>
                  <p className="mt-1 text-xs text-textPrimary">
                    {configuredStats.length > 0 ? configuredStats.map(([label, value]) => `${label}+${value}`).join(' · ') : '未分配 SP'}
                  </p>
                </button>
                <div className="rounded-lg bg-elevated p-2">
                  <p className="text-[11px] text-textSecondary">规则等级</p>
                  <p className="mt-1 text-xs text-textPrimary">Lv.50 固定</p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 rounded-lg bg-elevated p-2">
                <p className="text-[11px] text-textSecondary">示例能力值</p>
                {statRows(battleStats).map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[34px_1fr_32px] items-center gap-2 text-[11px]">
                    <span className="text-textSecondary">{label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-border">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (value / 220) * 100)}%` }} />
                    </span>
                    <span className="text-right text-textPrimary">{value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-textMuted">Champions SP 公式：单项最多 32，总量最多 66，Lv.50 固定。</p>
            </>
          )}
          <p className="mt-2 text-[11px] text-textMuted">数据版本：{team.dataVersionId}</p>
        </>
      )}
    </Card>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[11px] uppercase tracking-wide text-textMuted">{children}</label>;
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select aria-label={label} className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

const moveCategoryLabels = { Physical: '物理', Special: '特殊', Status: '变化' };

const optionMatches = (query: string, ...values: Array<string | number | undefined>) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(normalized));
};

function ItemSearchField({
  value,
  options,
  selectableIds,
  onChange,
}: {
  value?: string;
  options: Item[];
  selectableIds: Set<string>;
  onChange: (itemId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedItem = value ? options.find((item) => item.id === value) ?? items.find((item) => item.id === value) : undefined;
  const filteredItems = options.filter((item) => optionMatches(query, item.chineseName, item.englishName, item.effectSummary));

  return (
    <div>
      <FieldLabel>道具</FieldLabel>
      <div className="space-y-2 rounded-lg border border-border bg-secondary p-2">
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
          <Search size={14} className="text-textMuted" />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-textMuted"
            placeholder="搜索携带物"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="text-[10px] text-textMuted">当前规则可携带道具，列表完整</p>
        <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
          <button className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-textSecondary" type="button" onClick={() => onChange('')}>
            不携带道具
          </button>
          {filteredItems.map((item) => {
            const selectable = selectableIds.has(item.id);
            const selected = item.id === value;
            return (
              <button
                key={item.id}
                className={`flex w-full min-w-0 items-center gap-2 rounded-lg border p-1.5 text-left ${
                  selected ? 'border-accent bg-accent/10' : 'border-transparent bg-card'
                } disabled:opacity-45`}
                disabled={!selectable}
                type="button"
                onClick={() => onChange(item.id)}
              >
                <HeldItemIcon iconRef={item.iconRef} label={item.chineseName} className="h-6 w-6" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-textPrimary">{item.chineseName}</span>
                  <span className="block truncate text-[11px] text-textMuted">{item.effectSummary}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MoveSlotPicker({
  slot,
  value,
  availableMoves,
  onChange,
}: {
  slot: number;
  value?: string;
  availableMoves: Move[];
  onChange: (moveId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(!value);
  const selectedMove = value ? moves.find((move) => move.id === value) : undefined;
  const options = [
    ...(selectedMove && !availableMoves.some((move) => move.id === selectedMove.id) ? [selectedMove] : []),
    ...availableMoves,
  ];
  const filteredMoves = options
    .filter((move) => optionMatches(query, move.chineseName, move.englishName, move.type, move.category));

  return (
    <div className="rounded-lg border border-border bg-secondary p-2">
      <button className="flex w-full items-center justify-between gap-2 text-left" type="button" onClick={() => setOpen((current) => !current)}>
        <span className="min-w-0">
          <span className="block text-[11px] text-textMuted">招式 {slot + 1}</span>
          <span className="block truncate text-xs font-semibold">{selectedMove?.chineseName ?? '空招式位'}</span>
        </span>
        <ChevronUp className={open ? '' : 'rotate-180'} size={14} />
      </button>
      {selectedMove && (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-2 rounded-lg bg-card p-1.5">
          <TypeBadge type={selectedMove.type} size="sm" />
          <p className="min-w-0 text-[11px] text-textSecondary">
            {moveCategoryLabels[selectedMove.category]} · 威力 {selectedMove.power ?? '-'} · 命中 {selectedMove.accuracy ?? '-'} · PP {selectedMove.pp}
          </p>
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
            <Search size={14} className="text-textMuted" />
            <input
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-textMuted"
              placeholder="搜索招式"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p className="text-[10px] text-textMuted">当前规则可学招式，列表完整</p>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            <button className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-textSecondary" type="button" onClick={() => onChange('')}>
              清空招式位
            </button>
            {filteredMoves.map((move) => {
              const selectable = availableMoves.some((candidate) => candidate.id === move.id);
              const selected = move.id === value;
              return (
                <button
                  key={move.id}
                  className={`grid w-full grid-cols-[auto_1fr_auto] items-start gap-2 rounded-lg border p-1.5 text-left ${
                    selected ? 'border-accent bg-accent/10' : 'border-transparent bg-card'
                  } disabled:opacity-45`}
                  disabled={!selectable}
                  type="button"
                  onClick={() => {
                    onChange(move.id);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  <TypeBadge type={move.type} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-textPrimary">{move.chineseName}</span>
                  </span>
                  <span className="text-right text-[10px] text-textMuted">
                    {moveCategoryLabels[move.category]}<br />
                    {move.power ?? '-'} / {move.accuracy ?? '-'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const statPointControls: Array<{ key: keyof TeamMember['statPoints']; label: string }> = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'specialAttack', label: '特攻' },
  { key: 'specialDefense', label: '特防' },
  { key: 'speed', label: '速度' },
];

function StatPointPicker({
  label,
  value,
  min = 0,
  max = MAX_STAT_POINTS_PER_STAT,
  onChange,
  onClose,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const nextValue = Math.max(min, Math.min(max, Math.round(value)));

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label} SP</p>
          <p className="text-xs text-textSecondary">拖动滑条，或直接设为最小 / 最大</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭 SP 调整" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="mb-4 text-center">
        <p className="text-[34px] font-bold text-accent">{nextValue}</p>
        <p className="text-xs text-textMuted">范围 {min}-{max}</p>
      </div>
      <input
        aria-label={`${label} SP`}
        className="mb-4 h-9 w-full accent-accent"
        max={max}
        min={min}
        type="range"
        value={nextValue}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="grid grid-cols-4 gap-2">
        <Button variant="ghost" onClick={() => onChange(min)}>
          min
        </Button>
        <button
          aria-label={`${label} -1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
          disabled={nextValue <= min}
          type="button"
          onClick={() => onChange(nextValue - 1)}
        >
          <Minus size={13} />
        </button>
        <button
          aria-label={`${label} +1`}
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-border text-textSecondary disabled:opacity-40"
          disabled={nextValue >= max}
          type="button"
          onClick={() => onChange(nextValue + 1)}
        >
          <Plus size={13} />
        </button>
        <Button onClick={() => onChange(max)}>
          max
        </Button>
      </div>
    </div>
  );
}

function MemberEditor({
  team,
  member,
  onClose,
  onSave,
  onDelete,
}: {
  team: Team;
  member: TeamMember;
  onClose: () => void;
  onSave: (member: TeamMember) => Promise<void>;
  onDelete: (memberId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TeamMember>(member);
  const [editingStatKey, setEditingStatKey] = useState<keyof TeamMember['statPoints'] | null>(null);
  const selectedPokemon = pokemon.find((entry) => entry.id === draft.pokemonId) ?? pokemon[0];
  const selectedForm = findBattleForm(selectedPokemon.id, draft.formId);
  const availableMoves = currentRuleMovesForPokemon(selectedPokemon.id);
  const availableItems = currentRuleSelectableItemsForPokemon(selectedPokemon.id);
  const selectedItem = draft.itemId ? items.find((item) => item.id === draft.itemId) : undefined;
  const itemOptions = selectedItem && !availableItems.some((item) => item.id === selectedItem.id) ? [selectedItem, ...availableItems] : availableItems;
  const selectableItemIds = new Set(availableItems.map((item) => item.id));
  const availableAbilityIds = Array.from(new Set([...selectedPokemon.abilities, ...(selectedForm?.abilities ?? [])]));
  const availableAbilities = abilities.filter((ability) => availableAbilityIds.includes(ability.id));
  const legality = useMemo(() => evaluateMemberLegality(draft, team), [draft, team]);
  const totalStatPoints = statPointTotal(draft.statPoints);
  const editingStat = statPointControls.find((control) => control.key === editingStatKey);

  const updateDraft = (patch: Partial<TeamMember>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const updateStatPoint = (key: keyof TeamMember['statPoints'], value: number) => {
    setDraft((current) => ({
      ...current,
      statPoints: {
        ...current.statPoints,
        [key]: Math.max(0, Math.min(MAX_STAT_POINTS_PER_STAT, Math.round(value || 0))),
      },
    }));
  };

  const updateMoveSlot = (slot: number, moveId: string) => {
    const nextMoves = [...draft.moveIds];
    if (moveId) nextMoves[slot] = moveId;
    else nextMoves.splice(slot, 1);
    updateDraft({ moveIds: Array.from(new Set(nextMoves.filter(Boolean))).slice(0, 4) });
  };

  const save = async () => {
    await onSave({ ...draft, legalityStatus: legality.status });
    onClose();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">编辑成员</h3>
          <p className="text-xs text-textSecondary">字段级校验会在保存前实时更新</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
        <Card className="bg-secondary">
          <div className="flex items-center gap-3">
            <PokemonAvatar iconRef={selectedForm?.iconRef ?? selectedPokemon.iconRef} label={selectedForm?.chineseName ?? selectedPokemon.chineseName} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{selectedForm?.chineseName ?? selectedPokemon.chineseName}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(selectedForm?.types ?? selectedPokemon.types).map((type) => (
                  <TypeBadge key={type} type={type} size="sm" />
                ))}
              </div>
              <HeldItemLine item={selectedItem} className="mt-2 max-w-full text-[11px]" />
            </div>
          </div>
        </Card>

        {selectedPokemon.megaForms.length > 0 && (
          <div>
            <SelectField
              label="形态预览"
              value={selectedForm?.id ?? selectedPokemon.id}
              onChange={(formId) => {
                const nextForm = findBattleForm(selectedPokemon.id, formId);
                updateDraft({
                  formId,
                  abilityId: nextForm?.isMega ? nextForm.abilities[0] : selectedPokemon.abilities[0],
                });
              }}
            >
              <option value={selectedPokemon.id}>原始形态</option>
              {selectedPokemon.megaForms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.chineseName}
                </option>
              ))}
            </SelectField>
            <p className="mt-1 text-[11px] text-textMuted">形态预览只影响能力值 / 属性展示；Mega Stone 作为道具独立配置。</p>
          </div>
        )}

        <div>
          <SelectField label="特性" value={draft.abilityId ?? ''} onChange={(abilityId) => updateDraft({ abilityId })}>
            <option value="">未选择</option>
            {availableAbilities.map((ability) => (
              <option key={ability.id} value={ability.id}>
              {ability.chineseName}
              </option>
            ))}
          </SelectField>
        </div>

        <ItemSearchField
          value={draft.itemId}
          options={itemOptions}
          selectableIds={selectableItemIds}
          onChange={(itemId) => updateDraft({ itemId: itemId || undefined })}
        />

        <SelectField label="性格" value={draft.nature} onChange={(nature) => updateDraft({ nature })}>
          {(() => {
            const statPriority = { '攻击': 0, '防御': 1, '特攻': 2, '特防': 3, '速度': 4 };
            const sorted = [...currentRuleNatureOptions].sort((a, b) => {
              const aGroup = a.up[0] ? (statPriority[a.up[0]] ?? 5) : 5;
              const bGroup = b.up[0] ? (statPriority[b.up[0]] ?? 5) : 5;
              return aGroup - bGroup || a.id.localeCompare(b.id, 'zh-Hans-CN');
            });
            return sorted.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {natureOptionLabel(opt.id)}
              </option>
            ));
          })()}
        </SelectField>

        <div>
          <FieldLabel>招式</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((slot) => (
              <MoveSlotPicker
                key={slot}
                slot={slot}
                value={draft.moveIds[slot] ?? ''}
                availableMoves={availableMoves}
                onChange={(moveId) => updateMoveSlot(slot, moveId)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel>SP 分配</FieldLabel>
            <span className={`text-[11px] ${totalStatPoints > MAX_TOTAL_STAT_POINTS ? 'text-danger' : 'text-textMuted'}`}>
              已用 {totalStatPoints}/{MAX_TOTAL_STAT_POINTS}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {statPointControls.map((control) => (
              <button
                key={control.key}
                className="rounded-lg border border-border bg-secondary p-2 text-left active:scale-[0.99]"
                type="button"
                onClick={() => setEditingStatKey(control.key)}
              >
                <span className="block text-[11px] text-textMuted">{control.label}</span>
                <span className="mt-1 block text-lg font-semibold text-textPrimary">{draft.statPoints[control.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <p className={`text-[11px] ${totalStatPoints > MAX_TOTAL_STAT_POINTS ? 'text-danger' : 'text-textMuted'}`}>
          单项最多 {MAX_STAT_POINTS_PER_STAT} · 超过 {MAX_TOTAL_STAT_POINTS} 会在校验中报错
        </p>

        <Card className="bg-secondary">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">校验结果</p>
            <Badge status={legality.status}>{legality.status === 'illegal' ? '非法' : legality.status === 'needs-review' ? '需复核' : legality.status === 'missing-config' ? '缺少配置' : '合法'}</Badge>
          </div>
          {legality.issues.length === 0 ? (
            <p className="text-xs text-success">当前字段未发现问题。</p>
          ) : (
            <div className="space-y-1">
              {legality.issues.map((issue) => (
                <p key={`${issue.code}-${issue.message}`} className={`text-xs ${issue.severity === 'error' ? 'text-danger' : 'text-warning'}`}>
                  {issue.message}
                </p>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr_1.4fr] gap-2">
        <Button variant="danger" onClick={() => onDelete(member.id).then(onClose)}>
          <Trash2 size={14} />
          删除
        </Button>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button onClick={save}>
          <Save size={14} />
          保存
        </Button>
      </div>
      {editingStat && (
        <StatPointPicker
          label={editingStat.label}
          value={draft.statPoints[editingStat.key] ?? 0}
          onChange={(value) => updateStatPoint(editingStat.key, value)}
          onClose={() => setEditingStatKey(null)}
        />
      )}
    </div>
  );
}

function AnalysisDetailSheet({
  team,
  onClose,
}: {
  team: Team;
  onClose: () => void;
}) {
  const details = buildTeamAnalysisDetails(team);
  const statusColor = {
    ok: 'text-success',
    review: 'text-warning',
    warning: 'text-danger',
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">配队分析详情</h3>
          <p className="text-xs text-textSecondary">基于当前 seed data 的可解释提示，正式结论仍需真实数据复核</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-textSecondary" title="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto hide-scrollbar">
        {details.chips.map((chip) => (
          <Chip key={chip}>{chip}</Chip>
        ))}
      </div>

      <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
        {details.sections.map((section) => (
          <Card key={section.title} className="bg-secondary">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">{section.title}</h4>
              <span className={`text-[11px] font-semibold ${statusColor[section.status]}`}>
                {section.status === 'ok' ? '可读' : section.status === 'review' ? '需复核' : '风险'}
              </span>
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <p key={item} className="text-xs text-textSecondary">
                  {item}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TeamListCard({
  team,
  active,
  onOpen,
}: {
  team: Team;
  active: boolean;
  onOpen: () => void;
}) {
  const visibleMembers = team.members.slice(0, 6);

  return (
    <button
      className={`surface-shadow w-full rounded-lg border bg-card p-3 text-left active:scale-[0.99] ${
        active ? 'border-accent shadow-[0_0_0_1px_rgb(var(--color-accent)/0.45)]' : 'border-border'
      }`}
      type="button"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold">{team.name}</span>
          <p className="mt-1 text-xs text-textSecondary">{team.members.length}/6 成员 · {team.notes || '本地队伍'}</p>
        </div>
        {active && <Badge status="current">当前</Badge>}
      </div>
      <div className="mt-3 flex gap-2">
        {visibleMembers.map((member) => {
          const entry = pokemon.find((item) => item.id === member.pokemonId);
          const battleForm = getMemberBattleForm(member);
          return (
            <PokemonAvatar
              key={member.id}
              iconRef={battleForm?.iconRef ?? entry?.iconRef}
              label={battleForm?.chineseName ?? entry?.chineseName ?? '未配置 Pokémon'}
              size="sm"
            />
          );
        })}
        {Array.from({ length: Math.max(0, 6 - visibleMembers.length) }).map((_, index) => (
          <span key={`empty-${index}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-border text-[10px] text-textMuted">
            +
          </span>
        ))}
      </div>
    </button>
  );
}

function TeamNameModal({
  open,
  isRename,
  draft,
  onDraftChange,
  onConfirm,
  onClose,
}: {
  open: boolean;
  isRename: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 mx-auto max-w-[430px]">
      <div className="absolute inset-0 bg-overlay/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-xl bg-card p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <h3 className="text-sm font-semibold">{isRename ? '编辑队伍名称' : '新建队伍'}</h3>
        <input
          autoFocus
          className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-textPrimary outline-none placeholder:text-textMuted"
          placeholder="输入队伍名称，例如：雨天 Mega 队"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={onConfirm} disabled={!draft.trim()}>确认</Button>
        </div>
      </div>
    </div>
  );
}

export function TeamPage({
  activeTeamId,
  onActiveTeamChange,
  onOpenRule,
}: {
  activeTeamId?: string;
  onActiveTeamChange: (teamId: string | undefined) => void;
  onOpenRule: () => void;
}) {
  const { teams, addTeam, deleteTeam, saveTeam, updateMember } = useAppStore();
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null);
  const [inlineNameDraft, setInlineNameDraft] = useState('');
  const activeListTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  const activeTeam = detailTeamId ? teams.find((team) => team.id === detailTeamId) : undefined;
  const editingMember = activeTeam?.members.find((member) => member.id === editingMemberId);

  const openCreateModal = () => {
    setNameDraft('');
    setShowNameModal(true);
  };

  const openTeamDetail = (teamId: string) => {
    onActiveTeamChange(teamId);
    setDetailTeamId(teamId);
    setExpandedMemberId(null);
    setEditingMemberId(null);
    setShowAnalysis(false);
    setShowPicker(false);
    setRenamingTeamId(null);
  };

  const closeTeamDetail = () => {
    setDetailTeamId(null);
    setExpandedMemberId(null);
    setEditingMemberId(null);
    setShowAnalysis(false);
    setShowPicker(false);
    setRenamingTeamId(null);
  };

  const beginInlineRename = (team: Team) => {
    setRenamingTeamId(team.id);
    setInlineNameDraft(team.name);
  };

  const commitInlineRename = async () => {
    if (!renamingTeamId) return;
    const team = teams.find((candidate) => candidate.id === renamingTeamId);
    const name = inlineNameDraft.trim();
    if (!team || !name) {
      setRenamingTeamId(null);
      return;
    }
    if (name !== team.name) {
      await saveTeam({ ...team, name });
    }
    setRenamingTeamId(null);
  };

  const confirmName = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    const team = await addTeam(name);
    onActiveTeamChange(team.id);
    setDetailTeamId(team.id);
    setShowNameModal(false);
    setExpandedMemberId(null);
  };

  const removeActiveTeam = async () => {
    if (!activeTeam) return;
    const nextTeam = teams.find((team) => team.id !== activeTeam.id);
    await deleteTeam(activeTeam.id);
    onActiveTeamChange(nextTeam?.id);
    setDetailTeamId(null);
    setExpandedMemberId(null);
  };

  const handlePickPokemon = async (entry: typeof pokemon[number]) => {
    if (!activeTeam || activeTeam.members.length >= 6) return;
    const member: TeamMember = {
      ...blankMember(),
      pokemonId: entry.id,
      abilityId: entry.abilities[0],
      moveIds: currentRuleMovesForPokemon(entry.id).slice(0, 2).map((move) => move.id),
      notes: '快速添加，可继续编辑。',
    };
    const result = evaluateMemberLegality(member, activeTeam);
    await updateMember(activeTeam.id, { ...member, legalityStatus: result.status });
    setExpandedMemberId(member.id);
    setShowPicker(false);
  };

  return (
    <div className="space-y-3">
      <SyncStrip />
      <RuleSummary onOpen={onOpenRule} />

      {!activeTeam ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">我的队伍</h2>
              <p className="text-xs text-textSecondary">本地保存 · 无账号依赖</p>
            </div>
            <Button onClick={openCreateModal}>
              <Plus size={14} />
              新建
            </Button>
          </div>

          {teams.length === 0 ? (
            <EmptyState title="还没有队伍" action={<Button onClick={openCreateModal}>新建第一支队伍</Button>} />
          ) : (
            <div className="space-y-2">
              {teams.map((team) => (
                <TeamListCard
                  key={team.id}
                  team={team}
                  active={team.id === activeListTeam?.id}
                  onOpen={() => openTeamDetail(team.id)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <button
              aria-label="返回队伍列表"
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-textSecondary active:scale-[0.98]"
              title="返回队伍列表"
              type="button"
              onClick={closeTeamDetail}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              {renamingTeamId === activeTeam.id ? (
                <input
                  aria-label="队伍名称"
                  autoFocus
                  className="w-full rounded-lg border border-accent bg-secondary px-2 py-1 text-xl font-semibold outline-none"
                  value={inlineNameDraft}
                  onBlur={() => void commitInlineRename()}
                  onChange={(event) => setInlineNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commitInlineRename();
                    if (event.key === 'Escape') setRenamingTeamId(null);
                  }}
                />
              ) : (
                <h2 className="text-xl font-semibold">
                  <button className="block max-w-full truncate text-left" title="编辑队伍名称" type="button" onClick={() => beginInlineRename(activeTeam)}>
                    {activeTeam.name}
                  </button>
                </h2>
              )}
              <p className="mt-1 text-xs text-textSecondary">{activeTeam.members.length}/6 成员 · 本地队伍 · 可自由编辑</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {activeTeam.members.map((member) => (
              <MemberCard
                key={member.id}
                team={activeTeam}
                member={member}
                expanded={expandedMemberId === member.id}
                onToggle={(memberId) => setExpandedMemberId((current) => (current === memberId ? null : memberId))}
                onEdit={(nextMember) => setEditingMemberId(nextMember.id)}
                onDelete={async (memberId) => {
                  await saveTeam({ ...activeTeam, members: activeTeam.members.filter((candidate) => candidate.id !== memberId) });
                  setExpandedMemberId((current) => (current === memberId ? null : current));
                }}
              />
            ))}
          </div>

          {activeTeam.members.length < 6 && (
            <Button variant="ghost" className="w-full" onClick={() => setShowPicker(true)}>
              <Plus size={14} />
              添加 Pokémon
            </Button>
          )}

          <Button variant="ghost" className="w-full" onClick={() => setShowAnalysis(true)}>
            <BarChart3 size={14} />
            展开队伍分析
          </Button>

          <Button variant="danger" className="w-full" title="删除队伍" onClick={removeActiveTeam}>
            <Trash2 size={14} />
            删除队伍
          </Button>

          {editingMember && (
            <MemberEditor
              team={activeTeam}
              member={editingMember}
              onClose={() => setEditingMemberId(null)}
              onDelete={async (memberId) => {
                await saveTeam({ ...activeTeam, members: activeTeam.members.filter((member) => member.id !== memberId) });
              }}
              onSave={(member) => updateMember(activeTeam.id, member)}
            />
          )}
          {showAnalysis && <AnalysisDetailSheet team={activeTeam} onClose={() => setShowAnalysis(false)} />}
          <PokemonPicker open={showPicker} onClose={() => setShowPicker(false)} onPick={handlePickPokemon} />
        </>
      )}
      <TeamNameModal
        open={showNameModal}
        isRename={false}
        draft={nameDraft}
        onDraftChange={setNameDraft}
        onConfirm={confirmName}
        onClose={() => setShowNameModal(false)}
      />
    </div>
  );
}
