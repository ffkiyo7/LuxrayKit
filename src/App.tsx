import { ArrowLeft, BarChart3, Import, UserCircle, Users, Wrench, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AutoHideBottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ServiceWorkerUpdateToast } from './components/ServiceWorkerUpdateToast';
import { Toast } from './components/kit/Toast';
import { EnvironmentErrorView, EnvironmentLoadingView } from './pages/EnvironmentStates';
import { productName } from './branding';
import type { EnvironmentState, EnvironmentTeamSample } from './data/environment';
import { useHashRoute } from './hooks/useHashRoute';
import { useScrollResetOnPush } from './hooks/useScrollReset';
import { buildHash, routeForTab, routePattern, tabForRoute, type Route, type ToolRouteId } from './lib/hashRoute';
import { trackRoute } from './lib/analytics';
import { AppProvider, useAppStore } from './state/AppContext';
import type { Team, TeamMember } from './types';
import type { ToolView } from './pages/ToolsPage';
import type { CalcSide } from './pages/CalculatorPage';
import type { DexTab } from './pages/dex/dexShared';
import type { RecentDexEntry } from './lib/toolActivity';

const CalculatorPage = lazy(() => import('./pages/CalculatorPage').then((module) => ({ default: module.CalculatorPage })));
const DexPage = lazy(() => import('./pages/DexPage').then((module) => ({ default: module.DexPage })));
const EnvironmentPage = lazy(() => import('./pages/EnvironmentPage').then((module) => ({ default: module.EnvironmentPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const AboutPage = lazy(() => import('./pages/profile/AboutPage').then((module) => ({ default: module.AboutPage })));
const BackupPage = lazy(() => import('./pages/profile/BackupPage').then((module) => ({ default: module.BackupPage })));
const InstallPage = lazy(() => import('./pages/profile/InstallPage').then((module) => ({ default: module.InstallPage })));
const OfflineCachePage = lazy(() => import('./pages/profile/OfflineCachePage').then((module) => ({ default: module.OfflineCachePage })));
const FeedbackSheet = lazy(() => import('./pages/profile/FeedbackSheet').then((module) => ({ default: module.FeedbackSheet })));
const RulePage = lazy(() => import('./pages/RulePage').then((module) => ({ default: module.RulePage })));
const SpeedPage = lazy(() => import('./pages/SpeedPage').then((module) => ({ default: module.SpeedPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then((module) => ({ default: module.TeamPage })));
const SharedTeamPreview = lazy(() => import('./pages/SharedTeamPreview').then((module) => ({ default: module.SharedTeamPreview })));
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((module) => ({ default: module.ToolsPage })));
const TypeChartPage = lazy(() => import('./pages/TypeChartPage').then((module) => ({ default: module.TypeChartPage })));

export type TabId = 'environment' | 'teams' | 'tools' | 'profile';

const tabs = [
  { id: 'environment', label: '环境', icon: BarChart3 },
  { id: 'teams', label: '队伍', icon: Users },
  { id: 'tools', label: '工具', icon: Wrench },
  { id: 'profile', label: '我的', icon: UserCircle },
] satisfies Array<{ id: TabId; label: string; icon: typeof Users }>;

const IMPORT_FEEDBACK_DURATION_MS = 2500;

// The tool view id used in code (`typeChart`) predates the route table; the URL keeps an
// all-lowercase slug. These two maps are the only place the two spellings meet.
const toolViewByRouteId: Record<ToolRouteId, ToolView> = {
  calculator: 'calculator',
  dex: 'dex',
  speed: 'speed',
  typechart: 'typeChart',
};

const routeIdByToolView: Record<ToolView, ToolRouteId> = {
  calculator: 'calculator',
  dex: 'dex',
  speed: 'speed',
  typeChart: 'typechart',
};

const toolViewForRoute = (route: Route): ToolView | null => {
  if (route.name === 'tool') return toolViewByRouteId[route.tool];
  if (route.name === 'dex-pokemon') return 'dex';
  return null;
};

type AppToast = {
  title: string;
  description?: string;
  tone?: 'success' | 'warning';
};

/** Page-level placeholder (N08-15): the shape of a page, not a spinner. */
function PageLoading({ label = '正在载入页面' }: { label?: string }) {
  return (
    <div>
      <div className="px-6 pt-11">
        <span className="block h-[34px] w-[46%] rounded-xl bg-textPrimary/[0.09]" />
        <span className="mt-3 block h-[13px] w-[68%] rounded-full bg-textPrimary/[0.06]" />
        <span className="mt-[22px] block h-11 rounded-[14px] bg-textPrimary/[0.05]" />
      </div>
      <div className="flex flex-col gap-3.5 px-6 pt-[22px]">
        {[0.05, 0.05, 0.04, 0.03].map((alpha, index) => (
          <span key={index} className="block h-[68px] rounded-2xl" style={{ background: `rgb(var(--color-text-primary) / ${alpha})` }} />
        ))}
      </div>
      <div className="flex items-center gap-2.5 px-6 pt-7">
        <span className="inline-block h-3 w-14 rounded-full bg-textPrimary/[0.09]" />
        <span className="text-[13px] font-semibold text-textSecondary" role="status">
          {label}
        </span>
      </div>
    </div>
  );
}

const TEAM_SIZE = 6;

/**
 * 07-04 — what a sample actually carries, and the confirmation step every upper-build import
 * goes through: the card on 环境 首页, the 相关上位构筑 row on a Pokémon detail and the 上位构筑
 * list card all raise this one dialog. The frame lists only what is *missing* below the count
 * line, so a fully-covered sample shows the counts and nothing else.
 */
function ImportCoverageNoticeDialog({
  sample,
  onCancel,
  onContinue,
}: {
  sample: EnvironmentTeamSample;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const itemCount = sample.slots.filter((slot) => slot.itemId).length;
  const spreadCount = sample.slots.filter((slot) => Object.keys(slot.statPoints ?? {}).length > 0).length;
  const moveCount = sample.slots.filter((slot) => slot.moveIds.length > 0).length;
  const counts = [
    `宝可梦 ${sample.slots.length} / ${TEAM_SIZE}`,
    `道具 ${itemCount} / ${TEAM_SIZE}`,
    ...(spreadCount > 0 ? [`SP ${spreadCount} / ${TEAM_SIZE}`] : []),
    ...(moveCount > 0 ? [`配招 ${moveCount} / ${TEAM_SIZE}`] : []),
  ].join(' · ');

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px]" role="dialog" aria-label="导入确认" aria-modal="true" data-bottom-nav-lock="true">
      <button className="lk-sheet-overlay absolute inset-0 h-full w-full" type="button" aria-label="关闭导入确认" onClick={onCancel} />
      <section className="lk-sheet absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-[20px] p-[22px]">
        <div className="flex items-start gap-3">
          <h2 className="m-0 flex-1 text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">
            导入「{sample.title}」
          </h2>
          <button
            aria-label="关闭导入确认"
            className="-mr-1 -mt-0.5 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-btn1 text-textLabel"
            type="button"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-[21px] text-textLabel">这份样本可带入宝可梦、道具、SP 分配。</p>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-textLabel" />
            <span className="text-sm font-bold tabular-nums">{counts}</span>
          </div>
          {!sample.hasMoves && (
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-data" />
              <span className="text-sm font-bold text-data">配招未公开</span>
            </div>
          )}
          {!sample.replicaCode && (
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-disabled" />
              <span className="text-sm font-bold text-textSecondary">无队伍码</span>
            </div>
          )}
        </div>
        <div className="mt-[18px] h-px bg-[var(--hairline)]" />
        <button
          className="lk-env-slab mt-[18px] flex h-11 w-full items-center justify-center gap-[7px] rounded-[14px] bg-accent text-[15px] font-extrabold text-page"
          type="button"
          onClick={onContinue}
        >
          <Import aria-hidden="true" size={16} />
          继续导入
        </button>
      </section>
    </div>
  );
}

function ToolWorkspace({
  view,
  onBack,
  selectedMemberId,
  onPickMember,
  onOpenCalculator,
  onOpenDex,
  environment,
  teams,
  activeTeam,
  speedPresetMember,
  calcPreset,
  dexTab,
}: {
  view: ToolView;
  onBack: () => void;
  selectedMemberId?: string;
  onPickMember: (memberId: string) => void;
  onOpenCalculator: (pokemonId: string) => void;
  onOpenDex: () => void;
  environment: EnvironmentState | null;
  teams?: Team[];
  activeTeam?: Team;
  speedPresetMember?: TeamMember;
  calcPreset?: { memberId: string; side: CalcSide };
  dexTab?: DexTab;
}) {
  const content = {
    calculator: <CalculatorPage environment={environment} selectedMemberId={selectedMemberId} onPickMember={onPickMember} presetMember={calcPreset} />,
    dex: <DexPage initialTab={dexTab} onOpenCalculator={onOpenCalculator} />,
    speed: environment ? (
      <SpeedPage
        environment={environment}
        teams={teams}
        activeTeam={activeTeam}
        presetMember={speedPresetMember}
        onOpenDex={onOpenDex}
      />
    ) : (
      <PageLoading label="正在载入速度线" />
    ),
    typeChart: <TypeChartPage environment={environment} />,
  }[view];

  return (
    <div>
      <button className="mx-6 mt-4 inline-flex items-center gap-2 text-sm text-textSecondary" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回工具
      </button>
      {content}
    </div>
  );
}

function AppShell() {
  // Navigation lives in the URL hash (see lib/hashRoute.ts): the Android hardware back
  // button, deep links and share links all need it. Only ephemeral, id-bearing presets
  // stay in memory below.
  const { route, navigate, back } = useHashRoute();
  useScrollResetOnPush(buildHash(route));
  const activeTab: TabId = tabForRoute(route);
  const toolView = toolViewForRoute(route);
  const [calculatorMemberId, setCalculatorMemberId] = useState<string | undefined>();
  const [speedPresetMemberId, setSpeedPresetMemberId] = useState<string | undefined>();
  const [calcPreset, setCalcPreset] = useState<{ memberId: string; side: CalcSide } | undefined>();
  // Which dex tab a 「最近用过」 chip on the tools page asks for. Like the calculator presets it is
  // a one-shot hint, not a destination, so it stays out of the route.
  const [dexTab, setDexTab] = useState<DexTab | undefined>();
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>();
  const [importToast, setImportToast] = useState<AppToast | null>(null);
  const [highlightedImportTeamId, setHighlightedImportTeamId] = useState<string | undefined>();
  const [pendingImportSample, setPendingImportSample] = useState<EnvironmentTeamSample | null>(null);
  const [environmentState, setEnvironmentState] = useState<EnvironmentState | null>(null);
  const [environmentLoadFailed, setEnvironmentLoadFailed] = useState(false);
  const { loading, teams, preferences, saveTeam } = useAppStore();

  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  const speedPresetMember = teams.flatMap((team) => team.members).find((member) => member.id === speedPresetMemberId);
  const bottomNavAutoHideEnabled = activeTab === 'environment' || (activeTab === 'tools' && toolView === 'dex');
  // 我的 second-level screens are drawn without the floating nav (08-02, N08-01, N08-10, N08-16):
  // they are a drill-down, and the frames give them no room for it. 写留言 is a sheet over 我的,
  // so it keeps the tab root underneath and locks the nav the usual way.
  const profileSubPage = route.name.startsWith('profile-') && route.name !== 'profile-feedback';

  useEffect(() => {
    if (teams.length === 0) {
      setActiveTeamId(undefined);
      return;
    }
    if (!activeTeamId || !teams.some((team) => team.id === activeTeamId)) {
      setActiveTeamId(teams[0].id);
    }
  }, [activeTeamId, teams]);

  useEffect(() => {
    if (!importToast && !highlightedImportTeamId) return;
    const timeoutId = window.setTimeout(() => {
      setImportToast(null);
      setHighlightedImportTeamId(undefined);
    }, IMPORT_FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedImportTeamId, importToast]);

  // Bumped by 重试 on the failure screen (01-08) and by the 离线 / 可能过期 notices (01-09,
  // N01-14); re-running the effect is the whole retry, there is no separate fetch path.
  const [environmentLoadAttempt, setEnvironmentLoadAttempt] = useState(0);
  const retryEnvironmentLoad = useCallback(() => {
    setEnvironmentLoadFailed(false);
    setEnvironmentLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let active = true;
    import('./data/environment')
      .then(({ loadEnvironmentState }) => loadEnvironmentState())
      .then((nextState) => {
        if (!active) return;
        setEnvironmentState(nextState);
        setEnvironmentLoadFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setEnvironmentState(null);
        setEnvironmentLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [environmentLoadAttempt]);

  const openTool = useCallback(
    (view: ToolView) => {
      if (view === 'calculator') setCalculatorMemberId(undefined);
      setCalcPreset(undefined);
      setSpeedPresetMemberId(undefined);
      setDexTab(undefined);
      navigate({ name: 'tool', tool: routeIdByToolView[view] });
    },
    [navigate],
  );

  const openDexEntry = useCallback(
    (entry: RecentDexEntry) => {
      if (entry.kind === 'pokemon') {
        setDexTab('pokemon');
        navigate({ name: 'dex-pokemon', pokemonId: entry.id });
        return;
      }
      setDexTab(entry.kind === 'move' ? 'moves' : entry.kind === 'item' ? 'items' : 'abilities');
      navigate({ name: 'tool', tool: 'dex' });
    },
    [navigate],
  );

  // 「带入」presets carry a local member id, which has no meaning in anyone else's URL —
  // they stay in memory while only the destination tool goes into the route.
  const sendMemberToSpeed = useCallback(
    (memberId: string) => {
      setSpeedPresetMemberId(memberId);
      navigate({ name: 'tool', tool: 'speed' });
    },
    [navigate],
  );

  const sendMemberToCalculator = useCallback(
    (memberId: string, side: CalcSide) => {
      setCalculatorMemberId(undefined);
      setCalcPreset({ memberId, side });
      navigate({ name: 'tool', tool: 'calculator' });
    },
    [navigate],
  );

  useEffect(() => {
    if (activeTab !== 'tools' || toolView !== 'calculator') {
      setCalculatorMemberId(undefined);
      setCalcPreset(undefined);
    }
    if (activeTab !== 'tools' || toolView !== 'speed') {
      setSpeedPresetMemberId(undefined);
    }
    if (activeTab !== 'tools' || toolView !== 'dex') {
      setDexTab(undefined);
    }
  }, [activeTab, toolView]);

  const performImportSampleTeam = useCallback(
    async (sample: EnvironmentTeamSample) => {
      const { createImportedTeamFromEnvironmentSample } = await import('./lib/environmentImport');
      const importedTeam: Team = createImportedTeamFromEnvironmentSample(sample, environmentState?.dataStatusLabel ?? '环境数据');
      await saveTeam(importedTeam);
      setActiveTeamId(importedTeam.id);
      setHighlightedImportTeamId(importedTeam.id);
      setImportToast({ title: `已导入「${sample.title}」` });
      navigate({ name: 'teams' });
    },
    [environmentState?.dataStatusLabel, navigate, saveTeam],
  );

  // Importing replaces nothing and creates a team, so it always asks first — a tap on a sample
  // card is an interest in the sample, not yet a decision to take it.
  const importSampleTeam = useCallback((sample: EnvironmentTeamSample) => {
    setPendingImportSample(sample);
  }, []);

  const continuePendingImport = useCallback(async () => {
    if (!pendingImportSample) return;
    const sample = pendingImportSample;
    setPendingImportSample(null);
    await performImportSampleTeam(sample);
  }, [pendingImportSample, performImportSampleTeam]);

  // Share flow: navigator.share where the platform has it (Android/iOS sheet), clipboard
  // otherwise. The code is generated on demand rather than stored — it must always reflect
  // the team as it is now.
  const shareTeam = useCallback(
    async (team: Team) => {
      try {
        const { canShareTeam, encodeTeamShare, teamShareUrl } = await import('./lib/teamShare');
        if (!canShareTeam(team)) return;
        const url = teamShareUrl(await encodeTeamShare(team));
        if (typeof navigator.share === 'function') {
          await navigator.share({ title: `${team.name} · ${productName}`, url });
          return;
        }
        await navigator.clipboard.writeText(url);
        setImportToast({ title: '链接已复制', description: '把它发给队友即可导入' });
      } catch (error) {
        // A user dismissing the native share sheet rejects with AbortError — that is a
        // cancellation, not a failure, and must not raise a warning toast.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setImportToast({ title: '分享失败', description: '请稍后再试或手动复制地址栏链接', tone: 'warning' });
      }
    },
    [],
  );

  const importSharedTeam = useCallback(
    async (team: Team) => {
      await saveTeam(team);
      setActiveTeamId(team.id);
      setHighlightedImportTeamId(team.id);
      setImportToast({ title: '已导入分享队伍' });
      navigate({ name: 'team-detail', teamId: team.id }, { replace: true });
    },
    [navigate, saveTeam],
  );

  // Loaded on demand: backupFile reaches the data barrel, and a static import from the shell
  // pins the move catalog into the first-paint bundle (tests/pwa/first-paint-budget.spec.ts).
  const exportBackup = useCallback(async () => {
    const { downloadBackup } = await import('./pages/profile/backupFile');
    downloadBackup(teams, preferences);
  }, [preferences, teams]);

  const copyReplicaCode = useCallback(async (replicaCode: string) => {
    try {
      await navigator.clipboard.writeText(replicaCode);
      setImportToast({ title: '队伍码已复制', description: '分享可能已过期' });
    } catch {
      setImportToast({ title: '队伍码复制失败', description: '请手动选择队伍码复制', tone: 'warning' });
    }
  }, []);

  const page = useMemo(() => {
    switch (activeTab) {
      case 'environment':
        if (environmentState) {
          return (
            <EnvironmentPage
              environment={environmentState}
              onImportSample={importSampleTeam}
              onOpenRule={() => navigate({ name: 'profile-rule' })}
              onRetryLoad={retryEnvironmentLoad}
            />
          );
        }
        return environmentLoadFailed ? (
          <EnvironmentErrorView onOpenTeams={() => navigate({ name: 'teams' })} onRetry={retryEnvironmentLoad} />
        ) : (
          <EnvironmentLoadingView />
        );
      case 'teams':
        return (
          <TeamPage
            activeTeamId={activeTeam?.id}
            environment={environmentState}
            highlightedTeamId={highlightedImportTeamId}
            onActiveTeamChange={setActiveTeamId}
            onBrowseUpperBuilds={() => navigate({ name: 'env-teams' })}
            onCopyReplicaCode={copyReplicaCode}
            onImportSharedTeam={importSharedTeam}
            onShareTeam={shareTeam}
            onSendToSpeed={sendMemberToSpeed}
            onSendToCalculator={sendMemberToCalculator}
          />
        );
      case 'tools':
        return toolView ? (
          <ToolWorkspace
            view={toolView}
            onBack={back}
            selectedMemberId={calculatorMemberId}
            onPickMember={setCalculatorMemberId}
            onOpenCalculator={(pokemonId) => {
              setCalculatorMemberId(pokemonId);
              navigate({ name: 'tool', tool: 'calculator' });
            }}
            onOpenDex={() => navigate({ name: 'tool', tool: 'dex' })}
            environment={environmentState}
            teams={teams}
            activeTeam={activeTeam}
            speedPresetMember={speedPresetMember}
            calcPreset={calcPreset}
            dexTab={dexTab}
          />
        ) : (
          <ToolsPage environment={environmentState} teams={teams} onOpenDexEntry={openDexEntry} onOpenTool={openTool} />
        );
      case 'profile':
        switch (route.name) {
          case 'profile-backup':
            return <BackupPage onBack={back} onGoToTeams={() => navigate({ name: 'teams' })} />;
          case 'profile-cache':
            return (
              <OfflineCachePage environment={environmentState} onBack={back} onOpenMethodology={() => navigate({ name: 'env-methodology' })} />
            );
          case 'profile-install':
            return <InstallPage onBack={back} />;
          case 'profile-rule':
            return <RulePage onBack={back} />;
          case 'profile-about':
            return <AboutPage onBack={back} onExportBackup={exportBackup} />;
          default:
            return <ProfilePage />;
        }
    }
  }, [
    activeTab,
    activeTeam,
    back,
    calculatorMemberId,
    calcPreset,
    dexTab,
    openDexEntry,
    speedPresetMember,
    sendMemberToSpeed,
    sendMemberToCalculator,
    environmentLoadFailed,
    environmentState,
    highlightedImportTeamId,
    importSampleTeam,
    importSharedTeam,
    copyReplicaCode,
    exportBackup,
    navigate,
    openTool,
    preferences,
    retryEnvironmentLoad,
    route,
    shareTeam,
    teams,
    toolView,
  ]);

  useEffect(() => {
    document.title = route.name === 'profile-rule' ? `当前规则 · ${productName}` : productName;
  }, [route.name]);

  // Anonymous page view, one per distinct route. Lives here rather than inside useHashRoute
  // because the opt-out preference is only reachable through the store — and because the hook
  // is mounted by four different components, which would otherwise each want to report.
  // trackRoute itself de-duplicates repeats, so the extra guard is belt-and-braces.
  const currentRoutePattern = routePattern(route);
  useEffect(() => {
    trackRoute(currentRoutePattern, { optOut: preferences.analyticsOptOut });
  }, [currentRoutePattern, preferences.analyticsOptOut]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);

  // 08-05: the very first paint, before IndexedDB has answered. No product name, no logo —
  // one line about what is happening and one about where the data lives.
  if (loading) {
    return (
      <main className="app-shell relative mx-auto min-h-screen max-w-[430px] text-textPrimary">
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[15px] font-semibold text-textSecondary" role="status">
            正在载入本地数据
          </p>
          <div className="mt-[22px] h-[3px] w-[132px] overflow-hidden rounded-full bg-textPrimary/[0.09]">
            <div className="h-[3px] w-[52px] rounded-full bg-textLabel" />
          </div>
        </div>
        <p className="absolute inset-x-6 bottom-7 text-center text-xs font-semibold text-textLabel/70">队伍与偏好都存在本机，不需要账号</p>
      </main>
    );
  }

  // Pages own their 24px gutter and their big title; the shell only reserves room for the nav.
  return (
    <main className="app-shell mx-auto min-h-screen max-w-[430px] text-textPrimary">
      <div className={`min-h-screen ${profileSubPage ? '' : 'safe-bottom'}`}>
        <Suspense fallback={<PageLoading />}>{page}</Suspense>
      </div>
      {importToast && (
        <Toast description={importToast.description} title={importToast.title} tone={importToast.tone === 'warning' ? 'danger' : 'success'} />
      )}
      {route.name === 'profile-feedback' && (
        <Suspense fallback={null}>
          <FeedbackSheet onClose={back} />
        </Suspense>
      )}
      {route.name === 'share' && (
        <Suspense fallback={null}>
          <SharedTeamPreview code={route.code} onClose={back} onGoToTeams={() => navigate({ name: 'teams' })} onImport={importSharedTeam} />
        </Suspense>
      )}
      {pendingImportSample && (
        <ImportCoverageNoticeDialog
          sample={pendingImportSample}
          onCancel={() => setPendingImportSample(null)}
          onContinue={() => {
            void continuePendingImport();
          }}
        />
      )}
      {/* 03 draws the member editor with its own bottom action bar and no tab bar — the two
          cannot share the same 22px of screen. */}
      {!profileSubPage && route.name !== 'member-editor' && (
        <AutoHideBottomNav
          activeTab={activeTab}
          tabs={tabs}
          onChange={(tab) => navigate(routeForTab(tab))}
          autoHideEnabled={bottomNavAutoHideEnabled}
          lock={Boolean(pendingImportSample)}
        />
      )}
    </main>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppShell />
        <ServiceWorkerUpdateToast />
      </AppProvider>
    </ErrorBoundary>
  );
}
