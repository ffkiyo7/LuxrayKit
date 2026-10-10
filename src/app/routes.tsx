import { BarChart3, UserCircle, Users, Wrench } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { NavBar } from '../components/kit/NavBar';
import { PageLoading } from '../components/kit/PageLoading';
import type { EnvironmentState, EnvironmentTeamSample } from '../data/environment';
import type { useHashRoute } from '../hooks/useHashRoute';
import { tabForRoute, type Route, type ToolRouteId } from '../lib/hashRoute';
import type { CalcSide } from '../pages/CalculatorPage';
import type { DexTab } from '../pages/dex/dexShared';
import { EnvironmentErrorView, EnvironmentLoadingView } from '../pages/EnvironmentStates';
import type { ToolView } from '../pages/ToolsPage';
import type { Team, TeamMember } from '../types';
import type { useToolPresets } from './useToolPresets';

const CalculatorPage = lazy(() => import('../pages/CalculatorPage').then((module) => ({ default: module.CalculatorPage })));
const DexPage = lazy(() => import('../pages/DexPage').then((module) => ({ default: module.DexPage })));
const EnvironmentPage = lazy(() => import('../pages/EnvironmentPage').then((module) => ({ default: module.EnvironmentPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const AboutPage = lazy(() => import('../pages/profile/AboutPage').then((module) => ({ default: module.AboutPage })));
const BackupPage = lazy(() => import('../pages/profile/BackupPage').then((module) => ({ default: module.BackupPage })));
const InstallPage = lazy(() => import('../pages/profile/InstallPage').then((module) => ({ default: module.InstallPage })));
const OfflineCachePage = lazy(() => import('../pages/profile/OfflineCachePage').then((module) => ({ default: module.OfflineCachePage })));
const FeedbackSheet = lazy(() => import('../pages/profile/FeedbackSheet').then((module) => ({ default: module.FeedbackSheet })));
const RulePage = lazy(() => import('../pages/RulePage').then((module) => ({ default: module.RulePage })));
const SpeedPage = lazy(() => import('../pages/SpeedPage').then((module) => ({ default: module.SpeedPage })));
const TeamPage = lazy(() => import('../pages/TeamPage').then((module) => ({ default: module.TeamPage })));
const SharedTeamPreview = lazy(() => import('../pages/SharedTeamPreview').then((module) => ({ default: module.SharedTeamPreview })));
const ToolsPage = lazy(() => import('../pages/ToolsPage').then((module) => ({ default: module.ToolsPage })));
const TypeChartPage = lazy(() => import('../pages/TypeChartPage').then((module) => ({ default: module.TypeChartPage })));

export type TabId = 'environment' | 'teams' | 'tools' | 'profile';

export const tabs = [
  { id: 'environment', label: '环境', icon: BarChart3 },
  { id: 'teams', label: '队伍', icon: Users },
  { id: 'tools', label: '工具', icon: Wrench },
  { id: 'profile', label: '我的', icon: UserCircle },
] satisfies Array<{ id: TabId; label: string; icon: typeof Users }>;

// The tool view id used in code (`typeChart`) predates the route table; the URL keeps an
// all-lowercase slug. These two maps are the only place the two spellings meet.
const toolViewByRouteId: Record<ToolRouteId, ToolView> = {
  calculator: 'calculator',
  dex: 'dex',
  speed: 'speed',
  typechart: 'typeChart',
};

export const routeIdByToolView: Record<ToolView, ToolRouteId> = {
  calculator: 'calculator',
  dex: 'dex',
  speed: 'speed',
  typeChart: 'typechart',
};

/** Each tool's large title, shown small in the nav bar once it collapses. */
const toolTitles: Record<ToolView, string> = {
  calculator: '伤害计算',
  dex: '规则内图鉴',
  speed: '速度线',
  typeChart: '属性速查',
};

export const toolViewForRoute = (route: Route): ToolView | null => {
  if (route.name === 'tool') return toolViewByRouteId[route.tool];
  if (route.name === 'dex-pokemon') return 'dex';
  return null;
};

type Navigate = ReturnType<typeof useHashRoute>['navigate'];

function ToolWorkspace({
  view,
  dexDetail,
  onBack,
  selectedMemberId,
  onPickMember,
  onOpenCalculator,
  onOpenDex,
  onOpenDexPokemon,
  environment,
  teams,
  activeTeam,
  speedPresetMember,
  calcPreset,
  dexTab,
}: {
  view: ToolView;
  dexDetail: boolean;
  onBack: () => void;
  selectedMemberId?: string;
  onPickMember: (memberId: string) => void;
  onOpenCalculator: (pokemonId: string) => void;
  onOpenDex: () => void;
  onOpenDexPokemon: (pokemonId: string) => void;
  environment: EnvironmentState | null;
  teams?: Team[];
  activeTeam?: Team;
  speedPresetMember?: TeamMember;
  calcPreset?: { memberId: string; side: CalcSide };
  dexTab?: DexTab;
}) {
  const content = {
    calculator: (
      <CalculatorPage
        environment={environment}
        selectedMemberId={selectedMemberId}
        onBackToTools={onBack}
        onPickMember={onPickMember}
        presetMember={calcPreset}
      />
    ),
    dex: <DexPage initialTab={dexTab} onOpenCalculator={onOpenCalculator} />,
    speed: environment ? (
      <SpeedPage
        environment={environment}
        teams={teams}
        activeTeam={activeTeam}
        presetMember={speedPresetMember}
        onOpenDex={onOpenDex}
        onOpenDexPokemon={onOpenDexPokemon}
      />
    ) : (
      <PageLoading label="正在载入速度线" />
    ),
    typeChart: <TypeChartPage environment={environment} />,
  }[view];

  return (
    <div>
      {/* The calculator and the dex detail draw their own bar; two stacked bars would both stick. */}
      {view !== 'calculator' && !dexDetail && <NavBar backLabel="返回工具" title={toolTitles[view]} onBack={onBack} />}
      {content}
    </div>
  );
}

/** The page a route draws under the tab bar: the one place a route turns into a page element. */
export function RoutedPage({
  route,
  navigate,
  back,
  environment,
  environmentLoadFailed,
  onRetryEnvironmentLoad,
  teams,
  activeTeam,
  onActiveTeamChange,
  highlightedImportTeamId,
  onImportSample,
  onImportSharedTeam,
  onShareTeam,
  onCopyReplicaCode,
  onExportBackup,
  toolPresets,
}: {
  route: Route;
  navigate: Navigate;
  back: () => void;
  environment: EnvironmentState | null;
  environmentLoadFailed: boolean;
  onRetryEnvironmentLoad: () => void;
  teams: Team[];
  activeTeam?: Team;
  onActiveTeamChange: (teamId: string | undefined) => void;
  highlightedImportTeamId?: string;
  onImportSample: (sample: EnvironmentTeamSample) => void;
  onImportSharedTeam: (team: Team) => Promise<void>;
  onShareTeam: (team: Team) => Promise<void>;
  onCopyReplicaCode: (replicaCode: string) => Promise<void>;
  onExportBackup: () => void;
  toolPresets: ReturnType<typeof useToolPresets>;
}) {
  switch (tabForRoute(route)) {
    case 'environment':
      if (environment) {
        return (
          <EnvironmentPage
            environment={environment}
            onImportSample={onImportSample}
            onOpenRule={() => navigate({ name: 'profile-rule' })}
            onRetryLoad={onRetryEnvironmentLoad}
          />
        );
      }
      return environmentLoadFailed ? (
        <EnvironmentErrorView onOpenTeams={() => navigate({ name: 'teams' })} onRetry={onRetryEnvironmentLoad} />
      ) : (
        <EnvironmentLoadingView />
      );
    case 'teams':
      return (
        <TeamPage
          activeTeamId={activeTeam?.id}
          environment={environment}
          highlightedTeamId={highlightedImportTeamId}
          onActiveTeamChange={onActiveTeamChange}
          onBrowseUpperBuilds={() => navigate({ name: 'env-teams' })}
          onCopyReplicaCode={onCopyReplicaCode}
          onImportSharedTeam={onImportSharedTeam}
          onShareTeam={onShareTeam}
          onSendToSpeed={toolPresets.sendMemberToSpeed}
          onSendToCalculator={toolPresets.sendMemberToCalculator}
        />
      );
    case 'tools': {
      const toolView = toolViewForRoute(route);
      if (!toolView) {
        return <ToolsPage environment={environment} teams={teams} onOpenDexEntry={toolPresets.openDexEntry} onOpenTool={toolPresets.openTool} />;
      }
      const speedPresetMember = teams.flatMap((team) => team.members).find((member) => member.id === toolPresets.speedPresetMemberId);
      return (
        <ToolWorkspace
          view={toolView}
          dexDetail={route.name === 'dex-pokemon'}
          onBack={back}
          selectedMemberId={toolPresets.calculatorMemberId}
          onPickMember={toolPresets.setCalculatorMemberId}
          onOpenCalculator={toolPresets.openCalculatorFor}
          onOpenDex={() => navigate({ name: 'tool', tool: 'dex' })}
          onOpenDexPokemon={(pokemonId) => navigate({ name: 'dex-pokemon', pokemonId })}
          environment={environment}
          teams={teams}
          activeTeam={activeTeam}
          speedPresetMember={speedPresetMember}
          calcPreset={toolPresets.calcPreset}
          dexTab={toolPresets.dexTab}
        />
      );
    }
    case 'profile':
      switch (route.name) {
        case 'profile-backup':
          return <BackupPage onBack={back} onGoToTeams={() => navigate({ name: 'teams' })} />;
        case 'profile-cache':
          return <OfflineCachePage environment={environment} onBack={back} onOpenMethodology={() => navigate({ name: 'env-methodology' })} />;
        case 'profile-install':
          return <InstallPage onBack={back} />;
        case 'profile-rule':
          return <RulePage onBack={back} />;
        case 'profile-about':
          return <AboutPage onBack={back} onExportBackup={onExportBackup} />;
        default:
          return <ProfilePage />;
      }
  }
}

/** Sheets a route raises over the page underneath: 写留言 over 我的, a share-link preview over anything. */
export function RouteOverlays({
  route,
  back,
  navigate,
  onImportSharedTeam,
}: {
  route: Route;
  back: () => void;
  navigate: Navigate;
  onImportSharedTeam: (team: Team) => Promise<void>;
}) {
  if (route.name === 'profile-feedback') {
    return (
      <Suspense fallback={null}>
        <FeedbackSheet onClose={back} />
      </Suspense>
    );
  }
  if (route.name === 'share') {
    return (
      <Suspense fallback={null}>
        <SharedTeamPreview code={route.code} onClose={back} onGoToTeams={() => navigate({ name: 'teams' })} onImport={onImportSharedTeam} />
      </Suspense>
    );
  }
  return null;
}
