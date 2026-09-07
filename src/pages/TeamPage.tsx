import { ArrowLeft, Copy, Edit3, Plus, Share2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { pokemon } from '../data';
import { evaluateMemberLegality } from '../lib/legality';
import { createDefaultTeamMember } from '../lib/teamMemberDefaults';
import { useHashRoute } from '../hooks/useHashRoute';
import { useAppStore } from '../state/AppContext';
import type { Team } from '../types';
import { PokemonPicker } from '../components/PokemonPicker';
import { Button, EmptyState } from '../components/ui';
import { MemberCard } from './team/MemberCard';
import { MemberEditor } from './team/MemberEditor';
import { TeamListCard } from './team/TeamListCard';
import { ConfirmDeleteTeamDialog, LuxrayEasterEggDialog, TeamNameModal } from './team/TeamDialogs';
import { measureDragRows, reorderById, resolveDragTargetIndex, type TeamDragState } from './team/teamDrag';

const LUXRAY_EASTER_TEAM_ID = 'team-starter';
const defaultNewTeamName = (teamCount: number) => `队伍${teamCount + 1}`;

export function TeamPage({
  activeTeamId,
  highlightedTeamId,
  onActiveTeamChange,
  onCopyReplicaCode,
  onShareTeam,
  onSendToSpeed,
  onSendToCalculator,
}: {
  activeTeamId?: string;
  highlightedTeamId?: string;
  onActiveTeamChange: (teamId: string | undefined) => void;
  onCopyReplicaCode: (replicaCode: string) => Promise<void> | void;
  onShareTeam: (team: Team) => Promise<void> | void;
  onSendToSpeed: (memberId: string) => void;
  onSendToCalculator: (memberId: string, side: 'attacker' | 'defender') => void;
}) {
  const { teams, addTeam, deleteTeam, replaceTeams, saveTeam, updateMember, preferences, replacePreferences } = useAppStore();
  // Which team is open lives in the URL (#/teams/:teamId) so a team is linkable and the
  // hardware back button leaves the detail instead of the app. The member editor, the
  // Pokemon picker and the rename modal stay local: they are transient overlays, not
  // destinations worth a history entry.
  const { route, navigate, back } = useHashRoute();
  const detailTeamId = route.name === 'team-detail' ? route.teamId : null;
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
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
    navigate({ name: 'team-detail', teamId });
    setExpandedMemberId(null);
    setEditingMemberId(null);
    setShowPicker(false);
    setRenamingTeamId(null);
    // Easter egg only on the first time the user edits the preset Luxray team;
    // persisted like onboarding so it never auto-pops or repeats.
    const showEgg = teamId === LUXRAY_EASTER_TEAM_ID && !preferences.hasSeenLuxrayEasterEgg;
    setShowLuxrayEasterEgg(showEgg);
    if (showEgg) void replacePreferences({ ...preferences, hasSeenLuxrayEasterEgg: true });
  };

  const closeTeamDetail = () => {
    back();
    setExpandedMemberId(null);
    setEditingMemberId(null);
    setShowPicker(false);
    setRenamingTeamId(null);
    setShowLuxrayEasterEgg(false);
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
    navigate({ name: 'team-detail', teamId: team.id });
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
      // The route still points at a team that no longer exists; replace (not push) so
      // 返回 does not walk back into a dead detail page.
      navigate({ name: 'teams' }, { replace: true });
      setExpandedMemberId(null);
      setEditingMemberId(null);
    }
    setPendingDeleteTeam(null);
  };

  const dragTargetIndex = (clientY: number, sourceIndex: number, startY: number) =>
    resolveDragTargetIndex({
      clientY,
      sourceIndex,
      startY,
      rowCount: teams.length,
      measuredRows: measureDragRows(teams.map((team) => teamCardRefs.current[team.id]?.getBoundingClientRect())),
    });

  const moveTeamToIndex = async (teamId: string, targetIndex: number) => {
    const nextTeams = reorderById(teams, teamId, targetIndex);
    if (nextTeams) await replaceTeams(nextTeams);
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
        targetIndex: dragTargetIndex(event.clientY, current.sourceIndex, current.startY),
      };
    });
  };

  const finishTeamDrag = async (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    const targetIndex = dragTargetIndex(event.clientY, dragState.sourceIndex, dragState.startY);
    const draggedTeamId = dragState.teamId;
    setDragState(null);
    await moveTeamToIndex(draggedTeamId, targetIndex);
  };

  const handlePickPokemon = async (entry: typeof pokemon[number]) => {
    if (!activeTeam || activeTeam.members.length >= 6) return;
    const member = createDefaultTeamMember({
      pokemonId: entry.id,
      notes: '快速添加，可继续编辑。',
    });
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
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-textSecondary">
                <span>{activeTeam.members.length}/6 成员</span>
                {activeTeam.replicaCode && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-textPrimary">{activeTeam.replicaCode}</span>
                    <button
                      aria-label="复制队伍码"
                      className="grid h-6 w-6 place-items-center rounded-md border border-border bg-card text-textSecondary active:scale-[0.96]"
                      title="复制队伍码"
                      type="button"
                      onClick={() => void onCopyReplicaCode(activeTeam.replicaCode!)}
                    >
                      <Copy size={13} />
                    </button>
                  </>
                )}
              </p>
            </div>
            <button
              aria-label={`分享 ${activeTeam.name}`}
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-textSecondary active:scale-[0.98] disabled:opacity-40"
              disabled={activeTeam.members.length === 0}
              title={activeTeam.members.length === 0 ? '空队伍无法分享' : '分享队伍'}
              type="button"
              onClick={() => void onShareTeam(activeTeam)}
            >
              <Share2 size={17} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {activeTeam.members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                expanded={expandedMemberId === member.id}
                onToggle={(memberId) => setExpandedMemberId((current) => (current === memberId ? null : memberId))}
                onEdit={(nextMember) => setEditingMemberId(nextMember.id)}
                onDelete={async (memberId) => {
                  await saveTeam({ ...activeTeam, members: activeTeam.members.filter((candidate) => candidate.id !== memberId) });
                  setExpandedMemberId((current) => (current === memberId ? null : current));
                }}
                onOpenSpeed={onSendToSpeed}
                onOpenCalculator={onSendToCalculator}
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
      {showLuxrayEasterEgg && <LuxrayEasterEggDialog onClose={() => setShowLuxrayEasterEgg(false)} />}
    </div>
  );
}
