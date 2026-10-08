import { Suspense, useCallback, useEffect, useState } from 'react';
import { AutoHideBottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ServiceWorkerUpdateToast } from './components/ServiceWorkerUpdateToast';
import { PageLoading } from './components/kit/PageLoading';
import { Toast } from './components/kit/Toast';
import { RoutedPage, RouteOverlays, tabs, toolViewForRoute, type TabId } from './app/routes';
import { useEnvironmentState } from './app/useEnvironmentState';
import { useTeamImport } from './app/useTeamImport';
import { useToolPresets } from './app/useToolPresets';
import { ImportCoverageNoticeDialog } from './pages/environment/ImportCoverageNoticeDialog';
import { productName } from './branding';
import { useHashRoute } from './hooks/useHashRoute';
import { useScrollResetOnPush } from './hooks/useScrollReset';
import { buildHash, routeForTab, routePattern, tabForRoute } from './lib/hashRoute';
import { trackRoute } from './lib/analytics';
import { mirrorSplashPreferences, signalAppReady } from './lib/splashMirror';
import { AppProvider, useAppStore } from './state/AppContext';

export type { TabId } from './app/routes';

function AppShell() {
  // Navigation lives in the URL hash (see lib/hashRoute.ts): the Android hardware back
  // button, deep links and share links all need it. Only ephemeral, id-bearing presets
  // stay in memory (useToolPresets).
  const { route, navigate, back } = useHashRoute();
  useScrollResetOnPush(buildHash(route));
  const activeTab: TabId = tabForRoute(route);
  const toolView = toolViewForRoute(route);
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>();
  const { loading, teams, preferences, saveTeam } = useAppStore();
  const { environmentState, environmentLoadFailed, retryEnvironmentLoad } = useEnvironmentState();
  const toolPresets = useToolPresets({ navigate, toolView });
  const teamImport = useTeamImport({ dataStatusLabel: environmentState?.dataStatusLabel, navigate, saveTeam, setActiveTeamId });

  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
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

  // Loaded on demand: backupFile reaches the data barrel, and a static import from the shell
  // pins the move catalog into the first-paint bundle (tests/pwa/first-paint-budget.spec.ts).
  const exportBackup = useCallback(async () => {
    const { downloadBackup } = await import('./pages/profile/backupFile');
    downloadBackup(teams, preferences);
  }, [preferences, teams]);

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

  // The PWA splash (public/splash.js) reads these before the next launch's bundle runs, and waits
  // for the ready signal before fading out. Skipped while loading: the defaults would overwrite
  // the user's stored choice for a moment.
  useEffect(() => {
    if (!loading) mirrorSplashPreferences({ splashOptOut: preferences.splashOptOut, theme: preferences.theme });
  }, [loading, preferences.splashOptOut, preferences.theme]);

  useEffect(() => {
    if (!loading) signalAppReady();
  }, [loading]);

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

  const { importToast, pendingImportSample } = teamImport;

  // Pages own their 24px gutter and their big title; the shell only reserves room for the nav.
  return (
    <main className="app-shell mx-auto min-h-screen max-w-[430px] text-textPrimary">
      <div className={`min-h-screen ${profileSubPage ? '' : 'safe-bottom'}`}>
        <Suspense fallback={<PageLoading />}>
          <RoutedPage
            route={route}
            navigate={navigate}
            back={back}
            environment={environmentState}
            environmentLoadFailed={environmentLoadFailed}
            onRetryEnvironmentLoad={retryEnvironmentLoad}
            teams={teams}
            activeTeam={activeTeam}
            onActiveTeamChange={setActiveTeamId}
            highlightedImportTeamId={teamImport.highlightedImportTeamId}
            onImportSample={teamImport.importSampleTeam}
            onImportSharedTeam={teamImport.importSharedTeam}
            onShareTeam={teamImport.shareTeam}
            onCopyReplicaCode={teamImport.copyReplicaCode}
            onExportBackup={exportBackup}
            toolPresets={toolPresets}
          />
        </Suspense>
      </div>
      {importToast && (
        <Toast description={importToast.description} title={importToast.title} tone={importToast.tone === 'warning' ? 'danger' : 'success'} />
      )}
      <RouteOverlays route={route} back={back} navigate={navigate} onImportSharedTeam={teamImport.importSharedTeam} />
      {pendingImportSample && (
        <ImportCoverageNoticeDialog
          sample={pendingImportSample}
          onCancel={teamImport.cancelPendingImport}
          onContinue={() => {
            void teamImport.continuePendingImport();
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
