import { useCallback, useEffect, useState } from 'react';
import type { useHashRoute } from '../hooks/useHashRoute';
import type { RecentDexEntry } from '../lib/toolActivity';
import type { CalcSide } from '../pages/CalculatorPage';
import type { DexTab } from '../pages/dex/dexShared';
import type { ToolView } from '../pages/ToolsPage';
import { routeIdByToolView } from './routes';

type Navigate = ReturnType<typeof useHashRoute>['navigate'];

/**
 * 「带入」presets carry a local member id, which has no meaning in anyone else's URL — they stay
 * in memory while only the destination tool goes into the route. Each is a one-shot hint for the
 * tool it was sent to and is dropped as soon as that tool is left.
 */
export function useToolPresets({ navigate, toolView }: { navigate: Navigate; toolView: ToolView | null }) {
  const [calculatorMemberId, setCalculatorMemberId] = useState<string | undefined>();
  const [speedPresetMemberId, setSpeedPresetMemberId] = useState<string | undefined>();
  const [calcPreset, setCalcPreset] = useState<{ memberId: string; side: CalcSide } | undefined>();
  // Which dex tab a 「最近用过」 chip on the tools page asks for. Like the calculator presets it is
  // a one-shot hint, not a destination, so it stays out of the route.
  const [dexTab, setDexTab] = useState<DexTab | undefined>();

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

  const openCalculatorFor = useCallback(
    (pokemonId: string) => {
      setCalculatorMemberId(pokemonId);
      navigate({ name: 'tool', tool: 'calculator' });
    },
    [navigate],
  );

  useEffect(() => {
    if (toolView !== 'calculator') {
      setCalculatorMemberId(undefined);
      setCalcPreset(undefined);
    }
    if (toolView !== 'speed') {
      setSpeedPresetMemberId(undefined);
    }
    if (toolView !== 'dex') {
      setDexTab(undefined);
    }
  }, [toolView]);

  return {
    calculatorMemberId,
    setCalculatorMemberId,
    speedPresetMemberId,
    calcPreset,
    dexTab,
    openTool,
    openDexEntry,
    sendMemberToSpeed,
    sendMemberToCalculator,
    openCalculatorFor,
  };
}
