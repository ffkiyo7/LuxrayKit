import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createDailyFactSequence, pokemonFacts } from '../data/pokemonFacts';
import { PokemonAvatar } from './ui';

const todayKey = () => new Date().toISOString().slice(0, 10);

export function PokemonFactBanner() {
  const facts = useMemo(() => createDailyFactSequence(pokemonFacts, todayKey()), []);
  const [factIndex, setFactIndex] = useState(0);
  const fact = facts[factIndex];

  if (!fact) return null;

  const showNextFact = () => {
    setFactIndex((current) => (current + 1) % facts.length);
  };

  return (
    <section
      aria-label="宝可梦趣味小知识"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-accent/30 bg-accent/[0.07] px-3 py-3"
    >
      <span className="rounded-full border border-accent/55 bg-elevated p-0.5">
        <PokemonAvatar iconRef={fact.iconRef} label={fact.chineseName} size="md" />
      </span>

      <div className="min-w-0">
        <span className="inline-flex rounded-full bg-accent/25 px-2 py-0.5 text-[11px] font-bold tracking-wide text-accent">
          你知道吗？
        </span>
        <p className="mt-1 text-sm leading-5 text-textPrimary">{fact.text}</p>
        <p className="mt-0.5 truncate text-[11px] text-textMuted">
          {fact.chineseName} · {fact.sourceLabel}
        </p>
      </div>

      <button
        aria-label="换一条小知识"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold text-accent active:scale-[0.98]"
        type="button"
        onClick={showNextFact}
      >
        <RefreshCw size={17} aria-hidden="true" />
        换一条
      </button>
    </section>
  );
}
