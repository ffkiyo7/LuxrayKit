import { ArrowLeft, ChevronUp, Download, Edit3, GripVertical, Minus, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { abilities, currentRuleNatureOptions, items, moves, pokemon } from '../data';
import { memberBattleStats, memberLabel } from '../lib/calculations';
import { currentRuleMovesForPokemon, currentRuleNatures, currentRuleSelectableItemsForPokemon, natureOptionLabel } from '../lib/currentRuleCatalog';
import { createId } from '../lib/id';
import { evaluateMemberLegality } from '../lib/legality';
import { findBattleForm, getMemberBattleForm } from '../lib/pokemonForms';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointTotal } from '../lib/statPoints';
import { createTeamShareImageWithEmbeddedAssets, type TeamShareImage } from '../lib/teamImage';
import { useAppStore } from '../state/AppContext';
import type { Item, Move, Team, TeamMember } from '../types';
import { PokemonPicker } from '../components/PokemonPicker';
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

const DRAG_REORDER_FALLBACK_ROW_HEIGHT = 72;
const LUXRAY_EASTER_TEAM_ID = 'team-starter';
const defaultNewTeamName = (teamCount: number) => `队伍${teamCount + 1}`;

type TeamDragState = {
  teamId: string;
  sourceIndex: number;
  startY: number;
  currentY: number;
  targetIndex: number;
};

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(length - 1, index));

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
  const natureOption = currentRuleNatureOptions.find((candidate) => member.nature.includes(candidate.id));
  const statDisplayRows = [
    { key: 'hp', label: 'HP', value: battleStats.hp, sp: member.statPoints.hp ?? 0 },
    { key: 'attack', label: '攻击', value: battleStats.attack, sp: member.statPoints.attack ?? 0 },
    { key: 'defense', label: '防御', value: battleStats.defense, sp: member.statPoints.defense ?? 0 },
    { key: 'specialAttack', label: '特攻', value: battleStats.specialAttack, sp: member.statPoints.specialAttack ?? 0 },
    { key: 'specialDefense', label: '特防', value: battleStats.specialDefense, sp: member.statPoints.specialDefense ?? 0 },
    { key: 'speed', label: '速度', value: battleStats.speed, sp: member.statPoints.speed ?? 0 },
  ] as const;
  const natureMarker = (label: string) => {
    if (!natureOption || natureOption.neutral) return null;
    if ((natureOption.up as readonly string[]).includes(label)) return <span className="text-danger">↑</span>;
    if ((natureOption.down as readonly string[]).includes(label)) return <span className="text-accent">↓</span>;
    return null;
  };

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
              <button
                className="mt-3 w-full rounded-lg border border-border bg-elevated p-2 text-left active:scale-[0.99]"
                type="button"
                onClick={() => onEdit(member)}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-textSecondary">能力值 / SP</p>
                  <p className="text-[11px] text-textMuted">Lv.50 · 已用 {statPointTotal(member.statPoints)}/{MAX_TOTAL_STAT_POINTS}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {statDisplayRows.map((row) => (
                    <div key={row.key} className="grid grid-cols-[34px_1fr_36px_26px] items-center gap-1.5 text-[11px]">
                      <span className="flex items-center gap-0.5 text-textSecondary">
                        {row.label}
                        {natureMarker(row.label)}
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-border">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (row.value / 220) * 100)}%` }} />
                      </span>
                      <span className="text-right font-semibold text-textPrimary">{row.value}</span>
                      <span className={`text-right font-semibold ${row.sp > 0 ? 'text-warning' : 'text-textMuted'}`}>{row.sp}</span>
                    </div>
                  ))}
                </div>
              </button>
              <p className="mt-2 text-[11px] text-textMuted">左侧为当前能力值，右侧为该项 SP；性格修正用箭头标记。</p>
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

function TeamListCard({
  team,
  active,
  recentlyImported,
  index,
  dragging,
  dragOffsetY,
  dropTarget,
  setCardRef,
  onEdit,
  onGenerateImage,
  onDelete,
  onDragCancel,
  onDragEnd,
  onDragMove,
  onDragStart,
}: {
  team: Team;
  active: boolean;
  recentlyImported: boolean;
  index: number;
  dragging: boolean;
  dragOffsetY: number;
  dropTarget: boolean;
  setCardRef: (element: HTMLElement | null) => void;
  onEdit: () => void;
  onGenerateImage: () => void;
  onDelete: () => void;
  onDragCancel: () => void;
  onDragEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const visibleMembers = team.members.slice(0, 6);
  const openOnKeyboard = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onEdit();
  };

  return (
    <section
      ref={setCardRef}
      aria-label={`队伍：${team.name}`}
      role="button"
      tabIndex={0}
      data-import-highlighted={recentlyImported ? 'true' : undefined}
      style={dragging ? { transform: `translateY(${dragOffsetY}px)` } : undefined}
      className={`surface-shadow relative cursor-pointer rounded-lg border bg-card p-3 focus:outline-none focus:ring-2 focus:ring-accent/55 ${
        recentlyImported
          ? 'border-success ring-2 ring-success/45 shadow-[0_0_0_1px_rgb(var(--color-success)/0.35)]'
          : active
            ? 'border-accent shadow-[0_0_0_1px_rgb(var(--color-accent)/0.45)]'
            : 'border-border'
      } ${
        dragging
          ? 'z-10 scale-[1.01] cursor-grabbing shadow-[0_18px_36px_rgb(0_0_0/0.32)] transition-none'
          : 'transition-[transform,box-shadow,border-color] duration-150'
      } ${dropTarget ? 'ring-1 ring-accent/35' : ''}`}
      onClick={onEdit}
      onKeyDown={openOnKeyboard}
    >
      <button
        aria-label={`删除 ${team.name}`}
        className="absolute right-3 top-3 grid h-3.5 w-3.5 place-items-center rounded-[4px] border border-danger/45 bg-black transition active:scale-[0.96]"
        title={`删除 ${team.name}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <span className="h-px w-1.5 rounded-full bg-danger" aria-hidden="true" />
      </button>
      <div className="flex items-start justify-between gap-3 pr-5">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{team.name}</span>
          <p className="mt-1 text-xs text-textSecondary">{team.members.length}/6 成员</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
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
          {Array.from({ length: Math.max(0, 6 - visibleMembers.length) }).map((_, emptyIndex) => (
            <span key={`empty-${emptyIndex}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-border text-[10px] text-textMuted">
              +
            </span>
          ))}
        </div>
        <button
          aria-label={`拖动排序 ${team.name}`}
          className="grid h-9 w-[18px] shrink-0 touch-none place-items-center rounded-md border border-border bg-secondary text-textMuted transition active:scale-[0.96] active:text-textSecondary"
          title={`拖动排序 ${team.name}`}
          type="button"
          onClick={(event) => event.stopPropagation()}
          onPointerCancel={onDragCancel}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            onDragStart(event);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            onDragMove(event);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            onDragEnd(event);
          }}
        >
          <GripVertical size={12} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Edit3 size={14} />
          编辑配置
        </Button>
        <Button
          onClick={(event) => {
            event.stopPropagation();
            onGenerateImage();
          }}
        >
          <Download size={14} />
          生成图片
        </Button>
      </div>
    </section>
  );
}

function TeamImageResultDialog({
  teamName,
  image,
  onClose,
}: {
  teamName: string;
  image: TeamShareImage;
  onClose: () => void;
}) {
  const saveImage = () => {
    const anchor = document.createElement('a');
    anchor.href = image.dataUrl;
    anchor.download = image.filename;
    anchor.click();
  };

  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[430px]" role="dialog" aria-label="队伍分享图">
      <div className="absolute inset-0 bg-overlay/70" onClick={onClose} />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-3">
        <img className="w-full rounded-lg border border-border bg-page" src={image.dataUrl} alt={`${teamName} 队伍分享图`} />
        <Button className="mt-3 w-full" onClick={saveImage}>
          <Download size={14} />
          保存图片
        </Button>
      </div>
    </div>
  );
}

function ConfirmDeleteTeamDialog({
  team,
  onCancel,
  onConfirm,
}: {
  team: Team;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[430px]" role="dialog" aria-label="确认删除队伍">
      <div className="absolute inset-0 bg-overlay/70" onClick={onCancel} />
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl border border-danger/45 bg-card p-4 shadow-[0_18px_48px_rgb(0_0_0/0.45)]">
        <h3 className="text-base font-semibold text-danger">删除队伍？</h3>
        <p className="mt-2 text-sm text-textSecondary">确定删除「{team.name}」吗？此操作不能撤销。</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="danger" onClick={onConfirm}>
            <Trash2 size={14} />
            确认删除
          </Button>
        </div>
      </div>
    </div>
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

function LuxrayEasterEggDialog({ onClose }: { onClose: () => void }) {
  const luxray = pokemon.find((entry) => entry.id === 'luxray');

  return (
    <div className="fixed inset-0 z-40 mx-auto max-w-[430px]" role="dialog" aria-label="Luxray test 彩蛋" data-bottom-nav-lock="true">
      <div className="absolute inset-0 bg-overlay/70" onClick={onClose} />
      <section className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl border border-accent/45 bg-card p-4 shadow-[0_18px_48px_rgb(0_0_0/0.45)]">
        <div className="flex items-center gap-3">
          <PokemonAvatar iconRef={luxray?.iconRef} label="伦琴猫" size="xl" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Luxray test</p>
            <h3 className="mt-1 text-lg font-semibold">隐藏调试队已接通</h3>
            <p className="mt-1 text-xs leading-5 text-textSecondary">这支初始队伍只保留伦琴猫。它负责照亮配置页，也提醒你：真正重要的队伍，可以从一只喜欢的 Pokémon 开始。</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-secondary p-3">
          <p className="text-xs font-semibold text-textPrimary">启动读数</p>
          <p className="mt-1 text-xs text-textSecondary">威吓在线 · 磁铁校准 · 疯狂伏特待命</p>
        </div>
        <Button className="mt-4 w-full" onClick={onClose}>
          继续编辑
        </Button>
      </section>
    </div>
  );
}

export function TeamPage({
  activeTeamId,
  highlightedTeamId,
  onActiveTeamChange,
}: {
  activeTeamId?: string;
  highlightedTeamId?: string;
  onActiveTeamChange: (teamId: string | undefined) => void;
}) {
  const { teams, addTeam, deleteTeam, replaceTeams, saveTeam, updateMember } = useAppStore();
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [shareImage, setShareImage] = useState<{ teamName: string; image: TeamShareImage } | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null);
  const [inlineNameDraft, setInlineNameDraft] = useState('');
  const [pendingDeleteTeam, setPendingDeleteTeam] = useState<Team | null>(null);
  const [dragState, setDragState] = useState<TeamDragState | null>(null);
  const [showLuxrayEasterEgg, setShowLuxrayEasterEgg] = useState(false);
  const teamCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const activeListTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  const activeTeam = detailTeamId ? teams.find((team) => team.id === detailTeamId) : undefined;
  const editingMember = activeTeam?.members.find((member) => member.id === editingMemberId);

  const openCreateModal = () => {
    setNameDraft(defaultNewTeamName(teams.length));
    setShowNameModal(true);
  };

  const openTeamDetail = (teamId: string) => {
    onActiveTeamChange(teamId);
    setDetailTeamId(teamId);
    setExpandedMemberId(null);
    setEditingMemberId(null);
    setShowPicker(false);
    setRenamingTeamId(null);
    setShowLuxrayEasterEgg(teamId === LUXRAY_EASTER_TEAM_ID);
  };

  const closeTeamDetail = () => {
    setDetailTeamId(null);
    setExpandedMemberId(null);
    setEditingMemberId(null);
    setShowPicker(false);
    setRenamingTeamId(null);
    setShowLuxrayEasterEgg(false);
  };

  const generateTeamImage = async (team: Team) => {
    const assetBaseUrl = typeof window === 'undefined' ? undefined : window.location.origin;
    setShareImage({
      teamName: team.name,
      image: await createTeamShareImageWithEmbeddedAssets(team, { assetBaseUrl }),
    });
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

  const confirmDeleteTeam = async () => {
    if (!pendingDeleteTeam) return;
    const team = pendingDeleteTeam;
    const teamIndex = teams.findIndex((candidate) => candidate.id === team.id);
    const remainingTeams = teams.filter((candidate) => candidate.id !== team.id);
    const nextActiveTeam = remainingTeams[Math.min(Math.max(teamIndex, 0), remainingTeams.length - 1)];
    await deleteTeam(team.id);
    if (activeTeamId === team.id) onActiveTeamChange(nextActiveTeam?.id);
    if (detailTeamId === team.id) {
      setDetailTeamId(null);
      setExpandedMemberId(null);
      setEditingMemberId(null);
    }
    setPendingDeleteTeam(null);
  };

  const resolveDragTargetIndex = (clientY: number, sourceIndex: number, startY: number) => {
    const measuredRows = teams
      .map((team, rowIndex) => {
        const rect = teamCardRefs.current[team.id]?.getBoundingClientRect();
        if (!rect || rect.height <= 0) return null;
        return { rowIndex, midpoint: rect.top + rect.height / 2 };
      })
      .filter((row): row is { rowIndex: number; midpoint: number } => Boolean(row));

    if (measuredRows.length > 0) {
      return measuredRows.find((row) => clientY < row.midpoint)?.rowIndex ?? measuredRows[measuredRows.length - 1].rowIndex;
    }

    const fallbackSteps = Math.round((clientY - startY) / DRAG_REORDER_FALLBACK_ROW_HEIGHT);
    return clampIndex(sourceIndex + fallbackSteps, teams.length);
  };

  const moveTeamToIndex = async (teamId: string, targetIndex: number) => {
    const currentIndex = teams.findIndex((team) => team.id === teamId);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= teams.length || currentIndex === targetIndex) return;
    const nextTeams = [...teams];
    const [movedTeam] = nextTeams.splice(currentIndex, 1);
    nextTeams.splice(targetIndex, 0, movedTeam);
    await replaceTeams(nextTeams);
  };

  const startTeamDrag = (team: Team, index: number, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragState({
      teamId: team.id,
      sourceIndex: index,
      startY: event.clientY,
      currentY: event.clientY,
      targetIndex: index,
    });
  };

  const updateTeamDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    setDragState((current) => {
      if (!current) return current;
      return {
        ...current,
        currentY: event.clientY,
        targetIndex: resolveDragTargetIndex(event.clientY, current.sourceIndex, current.startY),
      };
    });
  };

  const finishTeamDrag = async (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    const targetIndex = resolveDragTargetIndex(event.clientY, dragState.sourceIndex, dragState.startY);
    const draggedTeamId = dragState.teamId;
    setDragState(null);
    await moveTeamToIndex(draggedTeamId, targetIndex);
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
              {teams.map((team, index) => (
                <TeamListCard
                  key={team.id}
                  team={team}
                  active={team.id === activeListTeam?.id}
                  recentlyImported={team.id === highlightedTeamId}
                  index={index}
                  dragging={dragState?.teamId === team.id}
                  dragOffsetY={dragState?.teamId === team.id ? dragState.currentY - dragState.startY : 0}
                  dropTarget={Boolean(dragState && dragState.teamId !== team.id && dragState.targetIndex === index)}
                  setCardRef={(element) => {
                    teamCardRefs.current[team.id] = element;
                  }}
                  onEdit={() => openTeamDetail(team.id)}
                  onGenerateImage={() => void generateTeamImage(team)}
                  onDelete={() => setPendingDeleteTeam(team)}
                  onDragCancel={() => setDragState(null)}
                  onDragEnd={(event) => void finishTeamDrag(event)}
                  onDragMove={updateTeamDrag}
                  onDragStart={(event) => startTeamDrag(team, index, event)}
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
                  <button className="flex max-w-full items-center gap-1.5 text-left" title="编辑队伍名称" type="button" onClick={() => beginInlineRename(activeTeam)}>
                    <span className="truncate">{activeTeam.name}</span>
                    <Edit3 size={15} className="shrink-0 text-textMuted" />
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

          <Button variant="danger" className="w-full" title="删除队伍" onClick={() => setPendingDeleteTeam(activeTeam)}>
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
      {pendingDeleteTeam && (
        <ConfirmDeleteTeamDialog
          team={pendingDeleteTeam}
          onCancel={() => setPendingDeleteTeam(null)}
          onConfirm={() => void confirmDeleteTeam()}
        />
      )}
      {shareImage && <TeamImageResultDialog teamName={shareImage.teamName} image={shareImage.image} onClose={() => setShareImage(null)} />}
      {showLuxrayEasterEgg && <LuxrayEasterEggDialog onClose={() => setShowLuxrayEasterEgg(false)} />}
    </div>
  );
}
