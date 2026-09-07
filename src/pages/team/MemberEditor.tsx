import { ChevronUp, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { abilities, currentRuleNatureOptions, items, moves, pokemon } from '../../data';
import { currentRuleMovesForPokemon, currentRuleSelectableItemsForPokemon, natureOptionLabel } from '../../lib/currentRuleCatalog';
import { evaluateMemberLegality } from '../../lib/legality';
import { findBattleForm } from '../../lib/pokemonForms';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointTotal } from '../../lib/statPoints';
import type { Item, Move, Team, TeamMember } from '../../types';
import { StatPointPicker } from '../../components/StatPointPicker';
import { Button, Card, PokemonAvatar, TypeBadge } from '../../components/ui';
import { HeldItemIcon, HeldItemLine } from './HeldItem';

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

export function MemberEditor({
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
  const overLimitStat = statPointControls.find((control) => Number(draft.statPoints[control.key] ?? 0) > MAX_STAT_POINTS_PER_STAT);
  const statPointMessage = overLimitStat
    ? `${overLimitStat.label} SP 不能超过 ${MAX_STAT_POINTS_PER_STAT}。`
    : totalStatPoints > MAX_TOTAL_STAT_POINTS
      ? `单项最多 ${MAX_STAT_POINTS_PER_STAT}，总量最多 ${MAX_TOTAL_STAT_POINTS}。`
      : undefined;
  const hasDuplicateHeldItem = Boolean(
    draft.itemId && team.members.some((candidate) => candidate.id !== draft.id && candidate.itemId === draft.itemId),
  );
  const duplicateHeldItemMessage = hasDuplicateHeldItem ? '当前规则不允许同队重复携带相同道具。' : undefined;
  const saveDisabled = Boolean(statPointMessage || duplicateHeldItemMessage);

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
    if (saveDisabled) return;
    await onSave({ ...draft, legalityStatus: legality.status });
    onClose();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] rounded-t-2xl border border-border bg-card p-4 shadow-none">
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">编辑成员</h3>
          <p className="text-xs text-textSecondary">仅检查 SP 与同队重复道具</p>
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

        <div>
          <ItemSearchField
            value={draft.itemId}
            options={itemOptions}
            selectableIds={selectableItemIds}
            onChange={(itemId) => updateDraft({ itemId: itemId || undefined })}
          />
          {duplicateHeldItemMessage && <p className="mt-1 text-[11px] text-danger">{duplicateHeldItemMessage}</p>}
        </div>

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
        <p className={`text-[11px] ${statPointMessage ? 'text-danger' : 'text-textMuted'}`}>
          {statPointMessage ?? `单项最多 ${MAX_STAT_POINTS_PER_STAT} · 总量最多 ${MAX_TOTAL_STAT_POINTS}`}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr_1.4fr] gap-2">
        <Button variant="danger" onClick={() => onDelete(member.id).then(onClose)}>
          <Trash2 size={14} />
          删除
        </Button>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button onClick={save} disabled={saveDisabled}>
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
