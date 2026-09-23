import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { pokemon } from '../../data';
import type { CalcSideConfig, computeDamage } from '../../lib/damageAdapter';
import { KitButton, ListRow, SectionLabel } from '../../components/kit';
import type { Move as AppMove } from '../../types';
import { statPointOverflows, type CalcSide } from './calcSummary';

/** 05-01 / N05-11 / N05-12 / N05-13 — the one card that answers the question. */

function RaisedCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`lk-raised rounded-[18px] p-[18px] ${className}`}>{children}</section>;
}

export function ResultCard({
  result,
  move,
  attackerConfig,
  defenderConfig,
  onEditSide,
}: {
  result: ReturnType<typeof computeDamage> | null;
  move?: AppMove;
  attackerConfig: CalcSideConfig;
  defenderConfig: CalcSideConfig;
  onEditSide: (side: CalcSide) => void;
}) {
  const overflows = [...statPointOverflows(attackerConfig, 'attacker'), ...statPointOverflows(defenderConfig, 'defender')];

  if (overflows.length > 0) {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <SectionLabel tone="danger">SP 分配需要调整</SectionLabel>
        <p className="mt-2.5 text-[17px] font-bold leading-6 tracking-[-0.01em]">先把超限的地方改回来再算。</p>
        <div className="mt-3 rounded-[14px] bg-sunken px-3.5 py-1">
          {overflows.map((row, index) => (
            <ListRow
              key={row.label}
              divider={index < overflows.length - 1}
              height={44}
              title={<span className="text-[13px] font-semibold text-textLabel">{row.label}</span>}
              trailing={<span className="shrink-0 text-[13px] font-bold text-danger">{row.note}</span>}
            />
          ))}
        </div>
        <div className="mt-3.5 flex gap-2.5">
          <KitButton grow onClick={() => onEditSide('attacker')}>
            改进攻方
          </KitButton>
          <KitButton grow onClick={() => onEditSide('defender')}>
            改防守方
          </KitButton>
        </div>
      </RaisedCard>
    );
  }

  const checklist = [
    { label: `进攻方${attackerConfig.pokemonId ? ` ${pokemon.find((entry) => entry.id === attackerConfig.pokemonId)?.chineseName ?? ''}` : ''}`, ok: Boolean(attackerConfig.pokemonId) },
    { label: `防守方${defenderConfig.pokemonId ? ` ${pokemon.find((entry) => entry.id === defenderConfig.pokemonId)?.chineseName ?? ''}` : ''}`, ok: Boolean(defenderConfig.pokemonId) },
    { label: `招式${move ? ` ${move.chineseName}` : ''}`, ok: Boolean(attackerConfig.selectedMoveId) },
  ];

  if (checklist.some((row) => !row.ok)) {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <SectionLabel>伤害区间</SectionLabel>
        <p className="mt-2.5 text-[17px] font-bold leading-6 tracking-[-0.01em] text-textLabel">请先选择进攻方、防守方和招式。</p>
        <div className="mt-3.5 flex flex-col gap-2">
          {checklist.map((row) => (
            <span key={row.label} className={`flex items-center gap-2.5 text-[13px] font-semibold ${row.ok ? 'text-textLabel' : 'text-textSecondary'}`}>
              <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${row.ok ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                {row.ok ? <Check size={11} /> : '×'}
              </span>
              {row.label}
            </span>
          ))}
        </div>
      </RaisedCard>
    );
  }

  if (move?.category === 'Status') {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <p className="text-[17px] font-bold leading-6 tracking-[-0.01em]">「{move.chineseName}」不造成伤害，算不出区间。</p>
        <p className="mt-2 text-[13px] font-semibold leading-[19px] text-textSecondary">换一个物理或特殊招式即可。</p>
      </RaisedCard>
    );
  }

  if (!result) {
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <SectionLabel>伤害区间</SectionLabel>
        <p className="mt-2.5 text-[17px] font-bold leading-6 tracking-[-0.01em] text-textLabel">正在计算…</p>
      </RaisedCard>
    );
  }

  if (result.status !== 'experimental-success') {
    const reasons = result.blockedReasons ?? [];
    return (
      <RaisedCard className="mx-6 mt-[18px]">
        <p className="text-[17px] font-bold leading-6 tracking-[-0.01em]">这一组合算不出来。</p>
        <div className="mt-3 flex flex-col gap-2.5">
          {reasons.map((reason) => (
            <span key={reason} className="flex gap-2.5 text-[13px] font-semibold leading-[19px] text-textLabel">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
              <span className="min-w-0 flex-1">{reason}</span>
            </span>
          ))}
        </div>
        {result.assumptions.length > 0 && (
          <div className="mt-3.5 rounded-[14px] bg-sunken p-3.5">
            {result.assumptions.map((assumption) => (
              <p key={assumption} className="text-xs font-semibold leading-[18px] text-textSecondary">{assumption}</p>
            ))}
          </div>
        )}
      </RaisedCard>
    );
  }

  const typeMultiplier = result.typeEffectiveness ?? 1;
  const chips = [
    (result.stabMultiplier ?? 1) !== 1 ? `本系 ×${result.stabMultiplier}` : '本系 ×1',
    `属性 ×${typeMultiplier}`,
    (result.weatherMultiplier ?? 1) !== 1 ? `${result.weatherText} ×${result.weatherMultiplier}` : undefined,
    ...(result.conditionEffects ?? []),
    result.derivedSpreadDamage ? `分摊 ×${result.spreadMultiplier}` : undefined,
    ...(result.abilityEffects ?? []).map((effect) => `${effect.label} · ${effect.text}`),
    ...(result.itemEffects ?? []).map((effect) => `${effect.label} · ${effect.text}`),
  ].filter((chip): chip is string => Boolean(chip));

  return (
    <RaisedCard className="mx-6 mt-[18px]">
      <SectionLabel>伤害区间</SectionLabel>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-[44px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{result.minPercent}</span>
        <span className="text-[20px] font-extrabold text-textLabel">– {result.maxPercent}%</span>
      </p>
      <p className="mt-2 text-[13px] font-semibold tabular-nums text-textSecondary">
        {result.minDamage} – {result.maxDamage} 伤害 / 对方 HP {result.defenderHp ?? '-'}
      </p>
      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-textPrimary/[0.08]">
        <div className="lk-damage-bar h-full" style={{ width: `${Math.min(100, result.maxPercent ?? 0)}%` }} />
      </div>
      <p className="lk-damage-pill mt-3 inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[13px] font-extrabold text-data">
        {result.possibleHkoText}
      </p>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span key={chip} className="lk-chip inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-bold text-textLabel">
            {chip}
          </span>
        ))}
      </div>
    </RaisedCard>
  );
}
