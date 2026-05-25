import { Calculator, Gauge, Search, Settings, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { AppProvider, useAppStore } from './state/AppContext';
import { CalculatorPage } from './pages/CalculatorPage';
import { DexPage } from './pages/DexPage';
import { RulePage } from './pages/RulePage';
import { SettingsPage } from './pages/SettingsPage';
import { SpeedPage } from './pages/SpeedPage';
import { TeamPage } from './pages/TeamPage';

export type TabId = 'teams' | 'calculator' | 'speed' | 'dex' | 'settings';
export type OverlayPage = 'rule' | null;

const tabs = [
  { id: 'teams', label: '组队', icon: Users },
  { id: 'calculator', label: '计算', icon: Calculator },
  { id: 'speed', label: '速度线', icon: Gauge },
  { id: 'dex', label: '图鉴', icon: Search },
  { id: 'settings', label: '设置', icon: Settings },
] satisfies Array<{ id: TabId; label: string; icon: typeof Users }>;

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('teams');
  const [overlay, setOverlay] = useState<OverlayPage>(null);
  const [speedPokemonId, setSpeedPokemonId] = useState('garchomp');
  const [calculatorMemberId, setCalculatorMemberId] = useState<string | undefined>();
  const [activeTeamId, setActiveTeamId] = useState<string | undefined>();
  const { loading, teams, preferences } = useAppStore();

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

  const page = useMemo(() => {
    if (overlay === 'rule') return <RulePage onBack={() => setOverlay(null)} />;

    switch (activeTab) {
      case 'teams':
        return (
          <TeamPage
            activeTeamId={activeTeam?.id}
            onActiveTeamChange={setActiveTeamId}
            onOpenRule={() => setOverlay('rule')}
            onOpenCalculator={(memberId) => {
              setCalculatorMemberId(memberId);
              setActiveTab('calculator');
            }}
            onOpenSpeed={(pokemonId) => {
              setSpeedPokemonId(pokemonId);
              setActiveTab('speed');
            }}
          />
        );
      case 'calculator':
        return <CalculatorPage selectedMemberId={calculatorMemberId} onPickMember={setCalculatorMemberId} />;
      case 'speed':
        return <SpeedPage selectedPokemonId={speedPokemonId} onSelectPokemon={setSpeedPokemonId} activeTeam={activeTeam} />;
      case 'dex':
        return (
          <DexPage
            onOpenSpeed={(pokemonId) => {
              setSpeedPokemonId(pokemonId);
              setActiveTab('speed');
            }}
            onOpenCalculator={(pokemonId) => {
              setCalculatorMemberId(pokemonId);
              setActiveTab('calculator');
            }}
          />
        );
      case 'settings':
        return <SettingsPage onOpenRule={() => setOverlay('rule')} />;
    }
  }, [activeTab, activeTeam, calculatorMemberId, overlay, speedPokemonId]);

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
