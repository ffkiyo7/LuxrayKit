import { Plus } from 'lucide-react';
import { getEnvironmentPokemon } from '../data/environment';
import type { Team } from '../types';
import { Sheet } from './kit/Sheet';
import { Sprite } from './kit/Sprite';

export const TEAM_SIZE = 6;
export const ADDED_TOAST_DURATION_MS = 2500;

/**
 * A Mega, a regional form and the base Pokémon are the same team slot as far as the rules are
 * concerned, and they share a national dex number — so that, not the catalog id, is what decides
 * whether a team already holds this Pokémon. Ids the catalog does not know fall back to
 * themselves rather than collapsing into one another.
 */
export const speciesKey = (pokemonId: string | undefined) => {
  if (!pokemonId) return undefined;
  const entry = getEnvironmentPokemon(pokemonId);
  return entry ? `dex-${entry.nationalDexNo}` : pokemonId;
};

export type TeamChoice = {
  team: Team;
  /** Why this team cannot take the Pokémon; `undefined` means it can. */
  blockedReason?: string;
};

/** Which of the user's teams can still take this Pokémon, and why the others cannot. */
export const teamChoicesFor = (teams: Team[], pokemonId: string): TeamChoice[] => {
  const ownSpecies = speciesKey(pokemonId);
  return teams.map((team) => ({
    team,
    blockedReason: team.members.some((member) => speciesKey(member.pokemonId) === ownSpecies)
      ? '已在队伍中'
      : team.members.length >= TEAM_SIZE
        ? `已满 ${TEAM_SIZE} 只`
        : undefined,
  }));
};

/** 选队 sheet — rows follow 02-09's menu rows: 68px, hairline-separated, name over its count. */
export function TeamPickerSheet({
  choices,
  pokemonName,
  onPick,
  onCreate,
  onClose,
}: {
  choices: TeamChoice[];
  pokemonName: string;
  onPick: (team: Team) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={`把${pokemonName}加入哪支队伍`} title="加入哪支队伍" onClose={onClose}>
      <div className="mt-3">
        {choices.map(({ team, blockedReason }) => (
          <button
            key={team.id}
            className="flex h-[68px] w-full items-center gap-3 border-b border-[var(--hairline)] text-left disabled:opacity-45"
            disabled={Boolean(blockedReason)}
            type="button"
            onClick={() => onPick(team)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold tracking-[-0.01em]">{team.name}</span>
              <span className="mt-1 block text-xs font-semibold tabular-nums text-textSecondary">
                {[`${team.members.length}/${TEAM_SIZE}`, blockedReason].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="flex shrink-0 gap-px">
              {team.members.map((member) => {
                const entry = member.pokemonId ? getEnvironmentPokemon(member.pokemonId) : undefined;
                return entry ? <Sprite key={member.id} iconRef={entry.iconRef} label="" size={26} /> : null;
              })}
            </span>
          </button>
        ))}
        <button className="flex h-[60px] w-full items-center gap-3 text-left" type="button" onClick={onCreate}>
          <span className="shrink-0 text-textLabel">
            <Plus size={18} />
          </span>
          <span className="min-w-0 flex-1 text-base font-bold tracking-[-0.01em]">新建队伍并加入</span>
        </button>
      </div>
    </Sheet>
  );
}
