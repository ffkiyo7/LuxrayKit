import { Check, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { pokemon } from '../../data';
import type { EnvironmentState } from '../../data/environment';
import type { BattleTypeOption } from '../../lib/damageAdapter';
import { ListRow, Sprite, TypeDot } from '../../components/kit';
import { typeLabels } from '../../components/ui';
import type { PokemonType, Team, TeamMember } from '../../types';
import { PickerPage } from '../team/editor/PickerPage';
import { memberPickLine, sideLabelText, type CalcSide } from './calcSummary';

/**
 * 05-04 — a whole page, not a sheet. The environment and the dex come first and 从队伍选择 sits
 * underneath (owner call): the ranking is what most people reach for, the six saved members are
 * a shortcut for the rest.
 */

/** Top slice of the environment ranking offered as ready-made picks (plan: 仅名次前 60). */
const ENVIRONMENT_PICK_LIMIT = 60;

const typeLine = (types: readonly PokemonType[]) => (
  <span className="flex items-center gap-2.5">
    {types.map((type) => (
      <span key={type} className="inline-flex items-center gap-[5px]">
        <TypeDot size={7} type={type} />
        {typeLabels[type]}
      </span>
    ))}
  </span>
);

export function SidePickerPage({
  side,
  environment,
  battleType,
  teams,
  selectedPokemonId,
  onPickMember,
  onPickPokemon,
  onBack,
}: {
  side: CalcSide;
  environment: EnvironmentState | null;
  battleType: BattleTypeOption;
  teams: Team[];
  selectedPokemonId?: string;
  onPickMember: (member: TeamMember) => void;
  onPickPokemon: (pokemonId: string) => void;
  onBack: () => void;
}) {
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
  const dexResults = useMemo(
    () =>
      normalized
        ? pokemon.filter((entry) => `${entry.chineseName} ${entry.englishName}`.toLowerCase().includes(normalized))
        : pokemon,
    [normalized],
  );

  const rosters = useMemo(
    () => teams.map((team) => ({ team, members: team.members.filter((member) => member.pokemonId) })).filter((row) => row.members.length > 0),
    [teams],
  );

  const dexRow = (entry: (typeof pokemon)[number], index: number, total: number, subtitle?: string) => {
    const selected = entry.id === selectedPokemonId;
    return (
      <ListRow
        key={entry.id}
        active={selected}
        ariaLabel={entry.chineseName}
        bleed={selected}
        divider={index < total - 1}
        gap={14}
        height={68}
        leading={<Sprite iconRef={entry.iconRef} label={entry.chineseName} size={48} />}
        subtitle={subtitle ?? typeLine(entry.types)}
        title={entry.chineseName}
        trailing={
          selected ? (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-textPrimary text-page">
              <Check size={15} />
            </span>
          ) : undefined
        }
        onClick={() => onPickPokemon(entry.id)}
      />
    );
  };

  return (
    <PickerPage
      action={{ label: '取消', onClick: onBack }}
      backLabel="返回伤害计算"
      search={{ value: query, onChange: setQuery, placeholder: '搜索名称', label: '搜索名称' }}
      subtitle="搜索规则内图鉴，或从已有队伍带入配置。临时修改不会写回队伍。"
      title={`选择${label}`}
      onBack={onBack}
    >
      {!normalized && environmentPicks.length > 0 && (
        <section className="px-6 pt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">环境常用</h2>
            <span className="shrink-0 text-xs font-bold text-textSecondary">前 {environmentPicks.length}</span>
          </div>
          <div className="mt-3">
            {environmentPicks.map((entry, index) => dexRow(entry, index, environmentPicks.length, `环境 No.${index + 1}`))}
          </div>
        </section>
      )}

      <section className="px-6 pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">规则内图鉴</h2>
          <span className="shrink-0 text-xs font-bold text-textSecondary">
            {normalized ? `${dexResults.length} 个结果` : `全部 ${dexResults.length}`}
          </span>
        </div>
        <div className="mt-3">
          {dexResults.length === 0 ? (
            <p className="py-6 text-center text-[13px] font-semibold text-textSecondary">没有匹配的宝可梦</p>
          ) : (
            dexResults.map((entry, index) => dexRow(entry, index, dexResults.length))
          )}
        </div>
      </section>

      {!normalized && (
        <section className="px-6 pt-[26px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">从队伍选择</h2>
            <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-bold text-textLabel">
              <Users size={14} />
              {rosters.length} 支
            </span>
          </div>
          {rosters.length === 0 ? (
            <p className="py-6 text-center text-[13px] font-semibold text-textSecondary">还没有队伍成员</p>
          ) : (
            rosters.map(({ team, members }) => (
              <div key={team.id}>
                <p className="mt-3.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-textSecondary">{team.name}</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {members.map((member) => {
                    const entry = pokemon.find((candidate) => candidate.id === member.pokemonId);
                    if (!entry) return null;
                    const selected = member.pokemonId === selectedPokemonId;
                    return (
                      <button
                        key={member.id}
                        aria-label={entry.chineseName}
                        className={`flex h-[68px] min-w-0 items-center gap-2.5 rounded-[14px] px-3 text-left ${
                          selected ? 'lk-calc-pick lk-calc-pick--on' : 'lk-calc-pick'
                        }`}
                        type="button"
                        onClick={() => onPickMember(member)}
                      >
                        <Sprite iconRef={entry.iconRef} label={entry.chineseName} size={36} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{entry.chineseName}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-semibold tabular-nums text-textSecondary">
                            {memberPickLine(member)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </PickerPage>
  );
}
