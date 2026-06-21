import { ArrowLeft, BarChart3, ExternalLink, ShieldCheck, UserCircle, Users, Wrench } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { Onboarding } from './components/onboarding/Onboarding';
import { Button } from './components/ui';
import { productName } from './branding';
import type { EnvironmentState, EnvironmentTeamSample } from './data/environment';
import { useAutoHideBottomNav } from './hooks/useAutoHideBottomNav';
import { AppProvider, useAppStore } from './state/AppContext';
import type { Team, TeamMember } from './types';
import type { ToolView } from './pages/ToolsPage';
import type { CalcSide } from './pages/CalculatorPage';

const CalculatorPage = lazy(() => import('./pages/CalculatorPage').then((module) => ({ default: module.CalculatorPage })));
const DexPage = lazy(() => import('./pages/DexPage').then((module) => ({ default: module.DexPage })));
const EnvironmentPage = lazy(() => import('./pages/EnvironmentPage').then((module) => ({ default: module.EnvironmentPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const RulePage = lazy(() => import('./pages/RulePage').then((module) => ({ default: module.RulePage })));
const SpeedPage = lazy(() => import('./pages/SpeedPage').then((module) => ({ default: module.SpeedPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then((module) => ({ default: module.TeamPage })));
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((module) => ({ default: module.ToolsPage })));

export type TabId = 'environment' | 'teams' | 'tools' | 'profile';
export type OverlayPage = 'rule' | null;

const tabs = [
  { id: 'environment', label: '环境', icon: BarChart3 },
  { id: 'teams', label: '队伍', icon: Users },
  { id: 'tools', label: '工具', icon: Wrench },
  { id: 'profile', label: '我的', icon: UserCircle },
] satisfies Array<{ id: TabId; label: string; icon: typeof Users }>;

const IMPORT_FEEDBACK_DURATION_MS = 2500;

type AppToast = {
  title: string;
  description?: string;
  tone?: 'success' | 'warning';
};

const importCoverageItems = (sample: EnvironmentTeamSample) => [
  'Pokémon',
  '道具',
  sample.hasSpread ? 'SP分配' : undefined,
  sample.hasMoves ? '配招' : undefined,
  sample.replicaCode ? '队伍码' : undefined,
].filter((item): item is string => Boolean(item));

const missingImportCoverageItems = (sample: EnvironmentTeamSample) => [
  sample.hasSpread ? undefined : 'SP分配',
  sample.hasMoves ? undefined : '配招',
  sample.replicaCode ? undefined : '队伍码',
].filter((item): item is string => Boolean(item));

function PageLoading({ label = '正在载入页面...' }: { label?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-textSecondary">
      {label}
    </div>
  );
}

function ImportCoverageNoticeDialog({
  sample,
  onCancel,
  onContinue,
}: {
  sample: EnvironmentTeamSample;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const coverageItems = importCoverageItems(sample);
  const missingItems = missingImportCoverageItems(sample);

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px]" role="dialog" aria-label="导入配置提示" aria-modal="true" data-bottom-nav-lock="true">
      <button className="absolute inset-0 h-full w-full bg-black/70" type="button" aria-label="关闭导入配置提示" onClick={onCancel} />
      <section className="surface-shadow absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">导入配置提示</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          这份样本可带入{coverageItems.join('、')}。{missingItems.length > 0 ? `未公开的${missingItems.join('、')}需要手动确认。` : '公开配置已随队伍带入。'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" type="button" onClick={() => window.open(sample.reportUrl, '_blank', 'noopener,noreferrer')}>
            <ExternalLink size={14} />
            队报链接
          </Button>
          <Button type="button" onClick={onContinue}>
            继续导入
          </Button>
        </div>
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
  environment,
  activeTeam,
  speedPresetMember,
  calcPreset,
}: {
  view: ToolView;
  onBack: () => void;
  selectedMemberId?: string;
  onPickMember: (memberId: string) => void;
  onOpenCalculator: (pokemonId: string) => void;
  environment: EnvironmentState | null;
  activeTeam?: Team;
  speedPresetMember?: TeamMember;
  calcPreset?: { memberId: string; side: CalcSide };
}) {
  const content = {
    calculator: <CalculatorPage selectedMemberId={selectedMemberId} onPickMember={onPickMember} presetMember={calcPreset} />,
    dex: <DexPage onOpenCalculator={onOpenCalculator} />,
    speed: environment ? <SpeedPage environment={environment} activeTeam={activeTeam} presetMember={speedPresetMember} /> : <PageLoading label="正在载入速度线环境数据..." />,
  }[view];

  return (
    <div className="space-y-3">
      <button className="inline-flex items-center gap-2 text-sm text-textSecondary" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        返回工具
      </button>
      {content}
    </div>
  );
}

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('environment');
  const [overlay, setOverlay] = useState<OverlayPage>(null);
  const [toolView, setToolView] = useState<ToolView | null>(null);
  const [calculatorMemberId, setCalculatorMemberId] = useState<string | undefined>();
  const [speedPresetMemberId, setSpeedPresetMemberId] = useState<string | undefined>();
  const [calcPreset, setCalcPreset] = useState<{ memberId: string; side: CalcSide } | undefined>();
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>();
  const [importToast, setImportToast] = useState<AppToast | null>(null);
  const [highlightedImportTeamId, setHighlightedImportTeamId] = useState<string | undefined>();
  const [pendingImportSample, setPendingImportSample] = useState<EnvironmentTeamSample | null>(null);
  const [environmentState, setEnvironmentState] = useState<EnvironmentState | null>(null);
  const [environmentLoadFailed, setEnvironmentLoadFailed] = useState(false);
  const { loading, teams, preferences, replacePreferences, saveTeam } = useAppStore();

  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  const speedPresetMember = teams.flatMap((team) => team.members).find((member) => member.id === speedPresetMemberId);
  const bottomNavAutoHideEnabled = !overlay && (activeTab === 'environment' || (activeTab === 'tools' && toolView === 'dex'));
  const bottomNavAutoHide = useAutoHideBottomNav({
    enabled: bottomNavAutoHideEnabled,
    lock: Boolean(pendingImportSample),
  });

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
  }, []);

  const openTool = useCallback((view: ToolView) => {
    if (view === 'calculator') setCalculatorMemberId(undefined);
    setCalcPreset(undefined);
    setSpeedPresetMemberId(undefined);
    setToolView(view);
    setActiveTab('tools');
  }, []);

  const sendMemberToSpeed = useCallback((memberId: string) => {
    setSpeedPresetMemberId(memberId);
    setToolView('speed');
    setActiveTab('tools');
  }, []);

  const sendMemberToCalculator = useCallback((memberId: string, side: CalcSide) => {
    setCalculatorMemberId(undefined);
    setCalcPreset({ memberId, side });
    setToolView('calculator');
    setActiveTab('tools');
  }, []);

  useEffect(() => {
    if (activeTab !== 'tools' || toolView !== 'calculator') {
      setCalculatorMemberId(undefined);
      setCalcPreset(undefined);
    }
    if (activeTab !== 'tools' || toolView !== 'speed') {
      setSpeedPresetMemberId(undefined);
    }
  }, [activeTab, toolView]);

  const completeOnboarding = useCallback(() => {
    void replacePreferences({ ...preferences, hasCompletedOnboarding: true });
  }, [preferences, replacePreferences]);

  const performImportSampleTeam = useCallback(
    async (sample: EnvironmentTeamSample) => {
      const { createImportedTeamFromEnvironmentSample } = await import('./lib/environmentImport');
      const importedTeam: Team = createImportedTeamFromEnvironmentSample(sample, environmentState?.dataStatusLabel ?? '环境数据');
      await saveTeam(importedTeam);
      setActiveTeamId(importedTeam.id);
      setHighlightedImportTeamId(importedTeam.id);
      setImportToast({ title: '已导入配置' });
      setActiveTab('teams');
    },
    [environmentState?.dataStatusLabel, saveTeam],
  );

  const importSampleTeam = useCallback(
    async (sample: EnvironmentTeamSample) => {
      if (!preferences.hasSeenEnvironmentImportNotice) {
        setPendingImportSample(sample);
        return;
      }
      await performImportSampleTeam(sample);
    },
    [performImportSampleTeam, preferences.hasSeenEnvironmentImportNotice],
  );

  const continuePendingImport = useCallback(async () => {
    if (!pendingImportSample) return;
    const sample = pendingImportSample;
    setPendingImportSample(null);
    await replacePreferences({ ...preferences, hasSeenEnvironmentImportNotice: true });
    await performImportSampleTeam(sample);
  }, [pendingImportSample, performImportSampleTeam, preferences, replacePreferences]);

  const copyReplicaCode = useCallback(async (replicaCode: string) => {
    try {
      await navigator.clipboard.writeText(replicaCode);
      setImportToast({ title: '队伍码已复制', description: '分享可能已过期' });
    } catch {
      setImportToast({ title: '队伍码复制失败', description: '请手动选择队伍码复制', tone: 'warning' });
    }
  }, []);

  const page = useMemo(() => {
    if (overlay === 'rule') return <RulePage onBack={() => setOverlay(null)} />;

    switch (activeTab) {
      case 'environment':
        return environmentState ? (
          <EnvironmentPage environment={environmentState} onImportSample={importSampleTeam} />
        ) : (
          <PageLoading label={environmentLoadFailed ? '环境数据加载失败，请稍后重试。' : '正在载入环境数据...'} />
        );
      case 'teams':
        return (
          <TeamPage
            activeTeamId={activeTeam?.id}
            highlightedTeamId={highlightedImportTeamId}
            onActiveTeamChange={setActiveTeamId}
            onCopyReplicaCode={copyReplicaCode}
            onSendToSpeed={sendMemberToSpeed}
            onSendToCalculator={sendMemberToCalculator}
          />
        );
      case 'tools':
        return toolView ? (
          <ToolWorkspace
            view={toolView}
            onBack={() => setToolView(null)}
            selectedMemberId={calculatorMemberId}
            onPickMember={setCalculatorMemberId}
            onOpenCalculator={(pokemonId) => {
              setCalculatorMemberId(pokemonId);
              setToolView('calculator');
            }}
            environment={environmentState}
            activeTeam={activeTeam}
            speedPresetMember={speedPresetMember}
            calcPreset={calcPreset}
          />
        ) : (
          <ToolsPage onOpenTool={openTool} />
        );
      case 'profile':
        return <ProfilePage />;
    }
  }, [
    activeTab,
    activeTeam,
    calculatorMemberId,
    calcPreset,
    speedPresetMember,
    sendMemberToSpeed,
    sendMemberToCalculator,
    environmentLoadFailed,
    environmentState,
    highlightedImportTeamId,
    importSampleTeam,
    copyReplicaCode,
    openTool,
    overlay,
    toolView,
  ]);

  useEffect(() => {
    document.title = overlay === 'rule' ? `当前规则 · ${productName}` : productName;
  }, [overlay]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-page px-6 text-center text-textSecondary">
        <div>
          <ShieldCheck className="mx-auto mb-3 text-accent" size={32} />
          <p className="text-sm">正在载入本地缓存与规则数据...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="app-shell mx-auto min-h-screen max-w-[430px] text-textPrimary">
      <div className="safe-bottom min-h-screen px-4 pt-4">
        <Header />
        <Suspense fallback={<PageLoading />}>{page}</Suspense>
      </div>
      {importToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed inset-x-4 top-4 z-50 mx-auto flex max-w-[360px] items-start rounded-lg border bg-card px-3 py-2 text-sm font-semibold text-textPrimary shadow-[0_10px_32px_rgb(0_0_0/0.28)] ${
            importToast.tone === 'warning' ? 'border-warning/45' : 'border-success/40'
          }`}
        >
          <span className={`mr-2 mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${importToast.tone === 'warning' ? 'bg-warning' : 'bg-success'}`} />
          <span className="min-w-0">
            <span className="block">{importToast.title}</span>
            {importToast.description && <span className="mt-0.5 block text-xs font-medium text-textSecondary">{importToast.description}</span>}
          </span>
        </div>
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
      {!overlay && <BottomNav activeTab={activeTab} tabs={tabs} onChange={setActiveTab} hidden={bottomNavAutoHide.hidden} />}
      {!preferences.hasCompletedOnboarding && <Onboarding onComplete={completeOnboarding} />}
    </main>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
