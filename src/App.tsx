import { ArrowLeft, BarChart3, ShieldCheck, UserCircle, Users, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { currentDataVersion, currentRuleSet, pokemon } from './data';
import type { EnvironmentTeamSample } from './data/environment';
import { currentRuleMovesForPokemon, currentRuleNatures } from './lib/currentRuleCatalog';
import { createId } from './lib/id';
import { AppProvider, useAppStore } from './state/AppContext';
import type { Team, TeamMember } from './types';
import { CalculatorPage } from './pages/CalculatorPage';
import { DexPage } from './pages/DexPage';
import { EnvironmentPage } from './pages/EnvironmentPage';
import { ProfilePage } from './pages/ProfilePage';
import { RulePage } from './pages/RulePage';
import { SpeedPage } from './pages/SpeedPage';
import { TeamPage } from './pages/TeamPage';
import { ToolsPage, type ToolView } from './pages/ToolsPage';

export type TabId = 'environment' | 'teams' | 'tools' | 'profile';
export type OverlayPage = 'rule' | null;

const tabs = [
  { id: 'environment', label: '环境', icon: BarChart3 },
  { id: 'teams', label: '队伍', icon: Users },
  { id: 'tools', label: '工具', icon: Wrench },
  { id: 'profile', label: '我的', icon: UserCircle },
] satisfies Array<{ id: TabId; label: string; icon: typeof Users }>;

const IMPORT_FEEDBACK_DURATION_MS = 2500;

const createImportedMember = (slot: EnvironmentTeamSample['slots'][number]): TeamMember | null => {
  const entry = pokemon.find((candidate) => candidate.id === slot.pokemonId);
  if (!entry) return null;

  const legalMoves = currentRuleMovesForPokemon(entry.id).map((move) => move.id);
  const moveIds = slot.moveIds.filter((moveId) => legalMoves.includes(moveId)).slice(0, 4);

  return {
    id: createId('member'),
    pokemonId: entry.id,
    formId: entry.id,
    abilityId: entry.abilities[0],
    itemId: slot.itemId,
    moveIds: moveIds.length > 0 ? moveIds : legalMoves.slice(0, 2),
    nature: currentRuleNatures()[0] ?? '爽朗',
    statPoints: { speed: 32 },
    level: 50,
    notes: '从高分队伍样本导入，可继续编辑。',
    legalityStatus: 'needs-review',
  };
};

function ToolWorkspace({
  view,
  onBack,
  selectedMemberId,
  onPickMember,
  selectedPokemonId,
  onSelectPokemon,
  activeTeam,
  onOpenSpeed,
  onOpenCalculator,
}: {
  view: ToolView;
  onBack: () => void;
  selectedMemberId?: string;
  onPickMember: (memberId: string) => void;
  selectedPokemonId: string;
  onSelectPokemon: (pokemonId: string) => void;
  activeTeam?: Team;
  onOpenSpeed: (pokemonId: string) => void;
  onOpenCalculator: (pokemonId: string) => void;
}) {
  const content = {
    calculator: <CalculatorPage selectedMemberId={selectedMemberId} onPickMember={onPickMember} />,
    speed: <SpeedPage selectedPokemonId={selectedPokemonId} onSelectPokemon={onSelectPokemon} activeTeam={activeTeam} />,
    dex: <DexPage onOpenSpeed={onOpenSpeed} onOpenCalculator={onOpenCalculator} />,
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
  const [speedPokemonId, setSpeedPokemonId] = useState('garchomp');
  const [calculatorMemberId, setCalculatorMemberId] = useState<string | undefined>();
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>();
  const [importToast, setImportToast] = useState<string | null>(null);
  const [highlightedImportTeamId, setHighlightedImportTeamId] = useState<string | undefined>();
  const { loading, teams, preferences, saveTeam } = useAppStore();

  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];

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

  const openTool = useCallback((view: ToolView) => {
    setToolView(view);
    setActiveTab('tools');
  }, []);

  const importSampleTeam = useCallback(
    async (sample: EnvironmentTeamSample) => {
      const members = sample.slots.map(createImportedMember).filter((member): member is TeamMember => Boolean(member));
      const timestamp = new Date().toISOString();
      const importedTeam: Team = {
        id: createId('team'),
        name: `${sample.author} · ${sample.score} · ${sample.title}`,
        ruleSetId: currentRuleSet.id,
        dataVersionId: currentDataVersion.id,
        members,
        createdAt: timestamp,
        updatedAt: timestamp,
        notes: '',
        source: {
          kind: 'high-score-import',
          sampleId: sample.id,
          title: sample.title,
          author: sample.author,
          score: sample.score,
          battleType: sample.battleType,
          reportUrl: sample.reportUrl,
          importedAt: timestamp,
        },
      };
      await saveTeam(importedTeam);
      setActiveTeamId(importedTeam.id);
      setHighlightedImportTeamId(importedTeam.id);
      setImportToast('已导入配置');
      setActiveTab('teams');
    },
    [saveTeam],
  );

  const page = useMemo(() => {
    if (overlay === 'rule') return <RulePage onBack={() => setOverlay(null)} />;

    switch (activeTab) {
      case 'environment':
        return <EnvironmentPage onImportSample={importSampleTeam} />;
      case 'teams':
        return (
          <TeamPage
            activeTeamId={activeTeam?.id}
            highlightedTeamId={highlightedImportTeamId}
            onActiveTeamChange={setActiveTeamId}
          />
        );
      case 'tools':
        return toolView ? (
          <ToolWorkspace
            view={toolView}
            onBack={() => setToolView(null)}
            selectedMemberId={calculatorMemberId}
            onPickMember={setCalculatorMemberId}
            selectedPokemonId={speedPokemonId}
            onSelectPokemon={setSpeedPokemonId}
            activeTeam={activeTeam}
            onOpenSpeed={(pokemonId) => {
              setSpeedPokemonId(pokemonId);
              setToolView('speed');
            }}
            onOpenCalculator={(pokemonId) => {
              setCalculatorMemberId(pokemonId);
              setToolView('calculator');
            }}
          />
        ) : (
          <ToolsPage onOpenTool={openTool} />
        );
      case 'profile':
        return <ProfilePage />;
    }
  }, [activeTab, activeTeam, calculatorMemberId, highlightedImportTeamId, importSampleTeam, openTool, overlay, speedPokemonId, toolView]);

  useEffect(() => {
    document.title = overlay === 'rule' ? '当前规则 · Champions Tool' : 'Champions Tool';
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
        {page}
      </div>
      {importToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-[360px] items-center rounded-lg border border-success/40 bg-card px-3 py-2 text-sm font-semibold text-textPrimary shadow-[0_10px_32px_rgb(0_0_0/0.28)]"
        >
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-success" />
          {importToast}
        </div>
      )}
      {!overlay && <BottomNav activeTab={activeTab} tabs={tabs} onChange={setActiveTab} />}
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
