import { ChevronLeft, ChevronRight, Copy, Import, MoreHorizontal, Plus, Share2, TriangleAlert, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { items, pokemon } from '../data';
import type { EnvironmentState } from '../data/environment';
import { createId } from '../lib/id';
import { evaluateMemberLegality } from '../lib/legality';
import { createDefaultTeamMember } from '../lib/teamMemberDefaults';
import { rosterSpeciesIds, teamCompositionIssues } from '../lib/teamComposition';
import { canShareTeam, TEAM_SHARE_REQUIRED_MEMBERS } from '../lib/teamShare';
import { useHashRoute } from '../hooks/useHashRoute';
import { useAppStore } from '../state/AppContext';
import type { Team } from '../types';
import { PokemonPicker } from '../components/PokemonPicker';
import { PageHeader, Sheet } from '../components/kit';
import { EmptyMemberSlot, ExpandedMemberCard, MemberTile } from './team/MemberCard';
import { MemberEditor } from './team/MemberEditor';
import { PresetTeamCard, TeamListCard } from './team/TeamListCard';
import { ConfirmDeleteTeamSheet, ImportShareSheet, TeamMenuSheet, TeamNameSheet } from './team/TeamDialogs';
import { PRESET_TEAM_ID, teamDetailSubtitle, TEAM_NAME_MAX_LENGTH } from './team/teamMeta';

const defaultNewTeamName = (teamCount: number) => `队伍${teamCount + 1}`;

/** 「复制为新队伍」 — same configuration, fresh ids, no replica code (it names the original). */
const duplicateTeam = (team: Team): Team => {
  const now = new Date().toISOString();
  return {
    ...team,
    id: createId('team'),
    name: `${team.name} 副本`.slice(0, TEAM_NAME_MAX_LENGTH),
    members: team.members.map((member) => ({ ...member, id: createId('member') })),
    createdAt: now,
    updatedAt: now,
    replicaCode: undefined,
    source: undefined,
    sortOrder: undefined,
  };
};

// 02-01's 「从上位构筑抄一套」 preview strip: the six slots of the most recent sample.
const upperBuildPreview = (environment: EnvironmentState | null) => {
  const sample = environment?.teamSamples[0];
  if (!sample) return [];
  return sample.slots.slice(0, 6).map((slot) => {
    const entry = pokemon.find((candidate) => candidate.id === slot.pokemonId);
    return { key: `${sample.id}-${slot.pokemonId}`, iconRef: entry?.iconRef, label: entry?.chineseName ?? slot.pokemonId };
  });
};

/**
 * 02-01's route card. The 新建队伍 sheet reuses it on a sunken face, so the two ways into a new
 * team cannot drift apart.
 */
function EmptyStateCard({
  icon,
  title,
  subtitle,
  children,
  highlighted,
  sunken,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  highlighted?: boolean;
  sunken?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`block w-full rounded-[20px] p-[18px] text-left ${sunken ? 'bg-sunken' : 'bg-surface'} ${
        highlighted ? 'shadow-[inset_0_0_0_1.5px_rgb(var(--color-text-primary)/0.22)]' : ''
      }`}
      type="button"
      onClick={onClick}
    >
      <span className="flex items-center gap-3">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-extrabold tracking-[-0.01em]">{title}</span>
          {subtitle && <span className="mt-[3px] block text-[13px] font-semibold text-textSecondary">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-chevron">
          <ChevronRight size={18} />
        </span>
      </span>
      {children}
    </button>
  );
}

export function TeamPage({
  activeTeamId,
  highlightedTeamId,
  environment,
  onActiveTeamChange,
  onBrowseUpperBuilds,
  onCopyReplicaCode,
  onImportSharedTeam,
  onShareTeam,
  onSendToSpeed,
  onSendToCalculator,
}: {
  activeTeamId?: string;
  highlightedTeamId?: string;
  environment: EnvironmentState | null;
  onActiveTeamChange: (teamId: string | undefined) => void;
  onBrowseUpperBuilds: () => void;
  onCopyReplicaCode: (replicaCode: string) => Promise<void> | void;
  onImportSharedTeam: (team: Team) => Promise<void> | void;
  onShareTeam: (team: Team) => Promise<void> | void;
  onSendToSpeed: (memberId: string) => void;
  onSendToCalculator: (memberId: string, side: 'attacker' | 'defender') => void;
}) {
  const { teams, addTeam, deleteTeam, replaceTeams, saveTeam, updateMember, preferences, replacePreferences } = useAppStore();
  // Which team is open — and which member is being edited (#/teams/:teamId/members/:memberId,
  // 03) — lives in the URL, so both are linkable and the hardware back button leaves the screen
  // instead of the app. Sheets and the Pokemon picker stay local: transient overlays, not
  // destinations.
  const { route, navigate, back } = useHashRoute();
  const detailTeamId = route.name === 'team-detail' ? route.teamId : null;
  const editorRoute = route.name === 'member-editor' ? route : null;
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  // An item transfer commits with the save (03-09), so the member it was taken from has no
  // record of it. N03-13's 「已转给…」 notice is that record, for as long as the session lasts.
  const [lastTransfer, setLastTransfer] = useState<{ fromMemberId: string; toMemberId: string; itemId: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  // 02-01's two routes into a new team, reached from the list's 「+」 (the third route it draws,
  // 输入队伍码, is not a thing the app has).
  const [showNewTeamSheet, setShowNewTeamSheet] = useState(false);
  const [nameSheet, setNameSheet] = useState<{ mode: 'create' | 'rename'; teamId?: string } | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [menuTeamId, setMenuTeamId] = useState<string | null>(null);
  const [pendingDeleteTeamId, setPendingDeleteTeamId] = useState<string | null>(null);
  const teamCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const activeTeam = detailTeamId ? teams.find((team) => team.id === detailTeamId) : undefined;
  const menuTeam = menuTeamId ? teams.find((team) => team.id === menuTeamId) : undefined;
  const pendingDeleteTeam = pendingDeleteTeamId ? teams.find((team) => team.id === pendingDeleteTeamId) : undefined;
  const editorTeam = editorRoute ? teams.find((team) => team.id === editorRoute.teamId) : undefined;
  const editingMemberIndex = editorTeam ? editorTeam.members.findIndex((member) => member.id === editorRoute!.memberId) : -1;
  const editingMember = editingMemberIndex >= 0 ? editorTeam!.members[editingMemberIndex] : undefined;
  const presetTeam = teams.find((team) => team.id === PRESET_TEAM_ID);
  const showPresetCard = Boolean(presetTeam && presetTeam.members.length > 0 && !preferences.hasOpenedPresetTeam);

  const openCreateSheet = () => {
    setShowNewTeamSheet(false);
    setNameDraft(defaultNewTeamName(teams.length));
    setNameSheet({ mode: 'create' });
  };

  const openRenameSheet = (team: Team) => {
    setNameDraft(team.name);
    setNameSheet({ mode: 'rename', teamId: team.id });
    setMenuTeamId(null);
  };

  const openTeamDetail = (teamId: string) => {
    onActiveTeamChange(teamId);
    navigate({ name: 'team-detail', teamId });
    setExpandedMemberId(null);
    setShowPicker(false);
    // Opening the preset team once retires its special card (02-02 → N02-15).
    if (teamId === PRESET_TEAM_ID && !preferences.hasOpenedPresetTeam) {
      void replacePreferences({ ...preferences, hasOpenedPresetTeam: true });
    }
  };

  const closeTeamDetail = () => {
    back();
    setExpandedMemberId(null);
    setShowPicker(false);
  };

  const confirmName = async () => {
    const name = nameDraft.trim().slice(0, TEAM_NAME_MAX_LENGTH);
    if (!name || !nameSheet) return;
    if (nameSheet.mode === 'create') {
      const team = await addTeam(name);
      onActiveTeamChange(team.id);
      navigate({ name: 'team-detail', teamId: team.id });
      setExpandedMemberId(null);
    } else {
      const team = teams.find((candidate) => candidate.id === nameSheet.teamId);
      if (team && name !== team.name) await saveTeam({ ...team, name });
    }
    setNameSheet(null);
  };

  const confirmDeleteTeam = async () => {
    if (!pendingDeleteTeam) return;
    const team = pendingDeleteTeam;
    const teamIndex = teams.findIndex((candidate) => candidate.id === team.id);
    const remainingTeams = teams.filter((candidate) => candidate.id !== team.id);
    const nextActiveTeam = remainingTeams[Math.min(Math.max(teamIndex, 0), remainingTeams.length - 1)];
    await deleteTeam(team.id);
    if (activeTeamId === team.id) onActiveTeamChange(nextActiveTeam?.id);
    if (detailTeamId === team.id || editorRoute?.teamId === team.id) {
      // The route still points at a team that no longer exists; replace (not push) so
      // 返回 does not walk back into a dead detail page.
      navigate({ name: 'teams' }, { replace: true });
      setExpandedMemberId(null);
    }
    setPendingDeleteTeamId(null);
  };

  const confirmDuplicate = async (team: Team) => {
    const copy = duplicateTeam(team);
    await saveTeam(copy);
    setMenuTeamId(null);
    onActiveTeamChange(copy.id);
  };

  // A member-editor deep link whose member has since been removed lands on its team instead of
  // a blank page; replace, so 返回 does not walk back into the dead editor.
  useEffect(() => {
    if (!editorRoute || editingMember) return;
    navigate(editorTeam ? { name: 'team-detail', teamId: editorTeam.id } : { name: 'teams' }, { replace: true });
  }, [editorRoute, editorTeam, editingMember, navigate]);

  // 02-09's 「移至首位」 — the list order the drag handle used to write, from the ⋯ menu instead.
  // `replaceTeams` renumbers `sortOrder`, so the move survives a reload.
  const moveTeamToTop = async (team: Team) => {
    setMenuTeamId(null);
    const index = teams.findIndex((candidate) => candidate.id === team.id);
    if (index <= 0) return;
    await replaceTeams([team, ...teams.filter((candidate) => candidate.id !== team.id)]);
  };

  const handlePickPokemon = async (entry: typeof pokemon[number]) => {
    if (!activeTeam || activeTeam.members.length >= 6) return;
    const member = createDefaultTeamMember({ pokemonId: entry.id, notes: '快速添加，可继续编辑。' });
    const result = evaluateMemberLegality(member, activeTeam);
    // The picker greys out what is already on the roster, so a rejection here can only come
    // from a race; leaving the sheet open is the whole feedback.
    const written = await updateMember(activeTeam.id, { ...member, legalityStatus: result.status });
    if (!written.ok) return;
    setExpandedMemberId(member.id);
    setShowPicker(false);
  };

  // 02-01's two routes into a new team, shared by the empty state and the 新建队伍 sheet.
  const preview = upperBuildPreview(environment);
  const upperBuildRoute = (sunken?: boolean) => (
    <EmptyStateCard
      icon={
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-data/[0.16] text-data">
          <Trophy size={19} />
        </span>
      }
      subtitle={environment ? `${environment.teamSamples.length} 份本季样本` : undefined}
      sunken={sunken}
      title="从上位构筑抄一套"
      onClick={() => {
        setShowNewTeamSheet(false);
        onBrowseUpperBuilds();
      }}
    >
      {preview.length > 0 && (
        <span className="mt-[14px] grid grid-cols-6 gap-1 opacity-85">
          {preview.map((slot) => (
            <img key={slot.key} alt={slot.label} className="h-10 w-full object-contain" loading="lazy" src={slot.iconRef} />
          ))}
        </span>
      )}
    </EmptyStateCard>
  );
  const blankRoute = (sunken?: boolean) => (
    <EmptyStateCard
      icon={
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-btn1 text-textLabel">
          <Plus size={19} />
        </span>
      }
      sunken={sunken}
      title="从空白开始"
      onClick={openCreateSheet}
    />
  );

  const sheets = (
    <>
      {menuTeam && (
        <TeamMenuSheet
          showMoveToTop={teams.findIndex((candidate) => candidate.id === menuTeam.id) > 0}
          showShare={detailTeamId === menuTeam.id}
          team={menuTeam}
          onClose={() => setMenuTeamId(null)}
          onMoveToTop={() => void moveTeamToTop(menuTeam)}
          onCopyReplicaCode={() => {
            if (menuTeam.replicaCode) void onCopyReplicaCode(menuTeam.replicaCode);
            setMenuTeamId(null);
          }}
          onDelete={() => {
            setMenuTeamId(null);
            setPendingDeleteTeamId(menuTeam.id);
          }}
          onDuplicate={() => void confirmDuplicate(menuTeam)}
          onRename={() => openRenameSheet(menuTeam)}
          onShare={() => {
            void onShareTeam(menuTeam);
            setMenuTeamId(null);
          }}
        />
      )}
      {nameSheet && (
        <TeamNameSheet
          draft={nameDraft}
          mode={nameSheet.mode}
          onClose={() => setNameSheet(null)}
          onConfirm={() => void confirmName()}
          onDraftChange={setNameDraft}
        />
      )}
      {pendingDeleteTeam && (
        <ConfirmDeleteTeamSheet
          team={pendingDeleteTeam}
          onCancel={() => setPendingDeleteTeamId(null)}
          onConfirm={() => void confirmDeleteTeam()}
        />
      )}
      {showNewTeamSheet && (
        <Sheet title="新建队伍" onClose={() => setShowNewTeamSheet(false)}>
          <div className="mt-4 flex flex-col gap-3">
            {upperBuildRoute(true)}
            {blankRoute(true)}
          </div>
        </Sheet>
      )}
      {showImportSheet && (
        <ImportShareSheet
          onClose={() => setShowImportSheet(false)}
          onImport={async (team) => {
            setShowImportSheet(false);
            await onImportSharedTeam(team);
          }}
        />
      )}
    </>
  );

  if (editorRoute) {
    // The effect above has already redirected a route whose member is gone.
    if (!editorTeam || !editingMember) return null;

    const lost = lastTransfer?.fromMemberId === editingMember.id ? lastTransfer : null;
    const lostToMember = lost ? editorTeam.members.find((member) => member.id === lost.toMemberId) : undefined;
    const lostItem =
      lost && lostToMember && !editingMember.itemId
        ? {
            itemName: items.find((item) => item.id === lost.itemId)?.chineseName ?? lost.itemId,
            toMemberName: pokemon.find((entry) => entry.id === lostToMember.pokemonId)?.chineseName ?? '队友',
          }
        : undefined;

    return (
      <>
        <MemberEditor
          environment={environment}
          lostItem={lostItem}
          member={editingMember}
          memberIndex={editingMemberIndex}
          team={editorTeam}
          onClose={() => navigate({ name: 'team-detail', teamId: editorTeam.id })}
          onDelete={async () => {
            await saveTeam({ ...editorTeam, members: editorTeam.members.filter((entry) => entry.id !== editingMember.id) });
            setExpandedMemberId((current) => (current === editingMember.id ? null : current));
            navigate({ name: 'team-detail', teamId: editorTeam.id });
          }}
          onSave={async (members, transfer) => {
            await saveTeam({ ...editorTeam, members });
            if (transfer) {
              setLastTransfer({ fromMemberId: transfer.fromMemberId, toMemberId: editingMember.id, itemId: transfer.itemId });
            } else if (lastTransfer && (lastTransfer.fromMemberId === editingMember.id || lastTransfer.toMemberId === editingMember.id)) {
              setLastTransfer(null);
            }
          }}
          onUndoTransfer={
            lostItem
              ? () => {
                  const restored = editorTeam.members.map((entry) =>
                    entry.id === editingMember.id
                      ? { ...entry, itemId: lost!.itemId }
                      : entry.id === lost!.toMemberId
                        ? { ...entry, itemId: undefined }
                        : entry,
                  );
                  setLastTransfer(null);
                  void saveTeam({ ...editorTeam, members: restored });
                }
              : undefined
          }
        />
        {sheets}
      </>
    );
  }

  if (activeTeam) {
    const shareable = canShareTeam(activeTeam);
    const missing = TEAM_SHARE_REQUIRED_MEMBERS - activeTeam.members.length;
    // Old local data and imported teams may already break the composition rules. They are
    // never rewritten — 02-07's notice reports them and the share stays blocked.
    const compositionIssues = teamCompositionIssues(activeTeam);

    return (
      <div>
        <div className="flex items-center justify-between px-6 pt-5">
          <button
            aria-label="返回队伍列表"
            className="grid h-9 w-9 place-items-center rounded-full bg-surface text-textLabel"
            title="返回队伍列表"
            type="button"
            onClick={closeTeamDetail}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-2">
            <button
              aria-label={`分享 ${activeTeam.name}`}
              className={`grid h-9 w-9 place-items-center rounded-full bg-surface ${shareable ? 'text-textLabel' : 'text-btnDisabledInk'}`}
              disabled={!shareable}
              title={shareable ? '分享队伍' : `满 ${TEAM_SHARE_REQUIRED_MEMBERS} 只才能分享`}
              type="button"
              onClick={() => void onShareTeam(activeTeam)}
            >
              <Share2 size={17} />
            </button>
            <button
              aria-label={`${activeTeam.name} 的更多操作`}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface text-textLabel"
              title={`${activeTeam.name} 的更多操作`}
              type="button"
              onClick={() => setMenuTeamId(activeTeam.id)}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 pt-[14px]">
          <PageHeader subtitle={teamDetailSubtitle(activeTeam)} title={activeTeam.name} />
          {activeTeam.replicaCode && (
            <button
              aria-label="复制队伍码"
              className="mt-[14px] inline-flex h-9 items-center gap-2.5 rounded-xl bg-surface px-3"
              title="复制队伍码"
              type="button"
              onClick={() => void onCopyReplicaCode(activeTeam.replicaCode!)}
            >
              <span className="text-[13px] font-bold tracking-[0.06em] tabular-nums">{activeTeam.replicaCode}</span>
              <Copy className="lk-glyph-ink" size={15} />
            </button>
          )}
          {compositionIssues.length > 0 && (
            <div className="lk-notice mt-[14px] flex gap-2.5 rounded-[14px] p-[14px]">
              <span className="mt-px shrink-0 text-danger">
                <TriangleAlert size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold tracking-[-0.01em]">这支队伍有 {compositionIssues.length} 处不合规</span>
                {compositionIssues.map((issue) => (
                  <span key={`${issue.memberId}-${issue.code}`} className="mt-1 block text-xs font-semibold leading-[18px] text-textSecondary">
                    {issue.message}
                  </span>
                ))}
              </span>
            </div>
          )}
          {missing > 0 && (
            <div className="lk-notice mt-[14px] flex gap-2.5 rounded-[14px] p-[14px]">
              <span className="mt-px shrink-0 text-data">
                <TriangleAlert size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold tracking-[-0.01em]">还差 {missing} 只才能分享</span>
                <span className="mt-1 block text-xs font-semibold leading-[18px] text-textSecondary">
                  分享链接在 {TEAM_SHARE_REQUIRED_MEMBERS}/{TEAM_SHARE_REQUIRED_MEMBERS} 时才能生成；现在可以先编辑已有成员。
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 pt-6">
          {activeTeam.members.map((member) =>
            expandedMemberId === member.id ? (
              <ExpandedMemberCard
                key={member.id}
                member={member}
                onCollapse={() => setExpandedMemberId(null)}
                onEdit={() => navigate({ name: 'member-editor', teamId: activeTeam.id, memberId: member.id })}
                onOpenCalculator={() => onSendToCalculator(member.id, 'attacker')}
                onOpenSpeed={() => onSendToSpeed(member.id)}
              />
            ) : (
              <MemberTile key={member.id} member={member} onExpand={() => setExpandedMemberId(member.id)} />
            ),
          )}
          {Array.from({ length: Math.max(0, 6 - activeTeam.members.length) }).map((_, index) => (
            <EmptyMemberSlot key={`slot-${index}`} onAdd={() => setShowPicker(true)} />
          ))}
        </div>

        <PokemonPicker
          open={showPicker}
          takenSpeciesIds={rosterSpeciesIds(activeTeam)}
          onClose={() => setShowPicker(false)}
          onPick={handlePickPokemon}
        />
        {sheets}
      </div>
    );
  }

  const ordinaryTeamCount = teams.filter((team) => !(showPresetCard && team.id === PRESET_TEAM_ID)).length;
  const subtitle =
    teams.length === 0
      ? '还没有队伍。'
      : [ordinaryTeamCount > 0 ? `${ordinaryTeamCount} 支` : undefined, showPresetCard ? '1 份预设' : undefined]
          .filter(Boolean)
          .join(' + ');

  return (
    <div>
      <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-11">
        <PageHeader subtitle={subtitle} title="我的队伍" />
        {teams.length > 0 && (
          <button
            aria-label="新建队伍"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-page"
            title="新建队伍"
            type="button"
            onClick={() => setShowNewTeamSheet(true)}
          >
            <Plus size={20} />
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col gap-3 px-6 pt-6">
          <EmptyStateCard
            highlighted
            icon={
              <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-accent text-page">
                <Import size={19} />
              </span>
            }
            title="粘贴分享链接 / 分享码"
            onClick={() => setShowImportSheet(true)}
          />
          {upperBuildRoute()}
          {blankRoute()}
        </div>
      ) : (
        <div className="flex flex-col gap-[14px] px-6 pt-2">
          {teams.map((team) =>
            showPresetCard && team.id === PRESET_TEAM_ID ? (
              <PresetTeamCard
                key={team.id}
                team={team}
                onDelete={() => setPendingDeleteTeamId(team.id)}
                onMenu={() => setMenuTeamId(team.id)}
                onOpen={() => openTeamDetail(team.id)}
              />
            ) : (
              <TeamListCard
                key={team.id}
                recentlyImported={team.id === highlightedTeamId}
                setCardRef={(element) => {
                  teamCardRefs.current[team.id] = element;
                }}
                team={team}
                onMenu={() => setMenuTeamId(team.id)}
                onOpen={() => openTeamDetail(team.id)}
                onShare={() => void onShareTeam(team)}
              />
            ),
          )}
        </div>
      )}
      {sheets}
    </div>
  );
}
