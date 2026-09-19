import { Dices, Import, Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Sprite } from '../components/kit/Sprite';
import {
  getEnvironmentPokemon,
  type EnvironmentTeamSample,
} from '../data/environment';
import { battleTypeLabels } from './environmentChrome';
import { sampleRegulation, teamSampleLadderScore, teamSamplePlacementLabel } from './environmentTeamSamples';

/**
 * 07-01's card is four blocks and nothing else: title row (name · link glyph · amber score),
 * meta line, the six sprites, then the import slab. The source badge, 队报 button and 「可导入」
 * chips the old card carried are not in the frame and are gone; the link glyph is the only
 * remaining marker that a sample has a public report, and it opens that report.
 */
export const teamSampleMeta = (sample: EnvironmentTeamSample) =>
  [
    teamSamplePlacementLabel(sample),
    battleTypeLabels[sample.battleType],
    sampleRegulation(sample),
  ].filter((part): part is string => Boolean(part));

/** 01-05's related-build row uses the score inline instead of in an amber corner. */
export const teamSampleScoreMeta = (sample: EnvironmentTeamSample) =>
  [
    teamSamplePlacementLabel(sample),
    teamSampleLadderScore(sample) !== undefined ? `${teamSampleLadderScore(sample)} 分` : undefined,
    battleTypeLabels[sample.battleType],
  ].filter((part): part is string => Boolean(part));

/** The sample's slots that the local catalog can actually draw; unknown ids leave no gap. */
export const resolveSampleSlots = (sample: EnvironmentTeamSample) =>
  sample.slots
    .map((slot) => getEnvironmentPokemon(slot.pokemonId))
    .filter((entry): entry is NonNullable<ReturnType<typeof getEnvironmentPokemon>> => Boolean(entry));

export const teamSampleTitle = (sample: EnvironmentTeamSample) =>
  sample.title || [sample.author, sample.tournament, sample.eventRank].filter(Boolean).join(' · ') || sample.author;

export function SampleImportButton({
  importing,
  label,
  onClick,
  className = '',
}: {
  importing: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={`flex h-11 items-center justify-center gap-[7px] rounded-xl text-sm ${
        importing
          ? 'bg-btn1 font-bold text-btnDisabledInk'
          : 'lk-env-slab bg-accent font-extrabold text-page'
      } ${className}`}
      disabled={importing}
      type="button"
      onClick={onClick}
    >
      {importing ? (
        '导入中'
      ) : (
        <>
          <Import aria-hidden="true" size={15} />
          {label}
        </>
      )}
    </button>
  );
}

export function TeamSampleCard({
  sample,
  variant = 'list',
  onImport,
  onDrawAgain,
}: {
  sample: EnvironmentTeamSample;
  /** `draw` is 07-05's sunken card inside the 随机一队 dialog: same blocks, extra 再来一队. */
  variant?: 'list' | 'draw';
  onImport: (sample: EnvironmentTeamSample) => Promise<void> | void;
  onDrawAgain?: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const slots = resolveSampleSlots(sample);
  const title = teamSampleTitle(sample);
  const ladderScore = teamSampleLadderScore(sample);
  // The glyph is a real link (owner, 2026-09-19); upstream text is only trusted as an http(s) URL.
  const reportUrl = sample.reportUrl && /^https?:\/\//.test(sample.reportUrl) ? sample.reportUrl : undefined;

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(sample);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section
      className={`box-border rounded-[20px] p-[18px] ${variant === 'draw' ? 'rounded-[18px] bg-sunken' : 'surface-shadow bg-card'}`}
    >
      <div className="flex items-baseline gap-2.5">
        <h3 className="text-[20px] font-extrabold leading-7 tracking-[-0.01em]">{title}</h3>
        {reportUrl && (
          // Same 15px glyph as the frame; the padding / negative margin only widens the tap target.
          <a
            aria-label={`打开${title}的队报`}
            className="-m-2.5 inline-flex shrink-0 self-center p-2.5 text-textSecondary"
            href={reportUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <LinkIcon aria-hidden="true" size={15} />
          </a>
        )}
        <span className="flex-1" />
        {ladderScore !== undefined && (
          <span className="shrink-0 text-[13px] font-bold tabular-nums text-data">{ladderScore} 分</span>
        )}
      </div>
      <p className="mt-[5px] text-[13px] font-semibold text-textSecondary">{teamSampleMeta(sample).join(' · ')}</p>
      <div className={`mt-3.5 grid grid-cols-6 gap-1 ${importing ? 'opacity-45' : ''}`}>
        {slots.map((entry, index) => (
          <span key={`${entry.id}-${index}`} className="grid h-11 place-items-center">
            <Sprite iconRef={entry.iconRef} label={entry.chineseName} size={44} />
          </span>
        ))}
      </div>
      {variant === 'draw' ? (
        <div className="mt-3.5 grid grid-cols-[1fr_auto] gap-2">
          <SampleImportButton importing={importing} label="导入为我的队伍" onClick={() => void handleImport()} />
          <button
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl lk-env-draw-again px-3 text-sm font-bold text-textLabel"
            type="button"
            onClick={onDrawAgain}
          >
            <Dices aria-hidden="true" size={15} />
            再来一队
          </button>
        </div>
      ) : (
        <SampleImportButton className="mt-3.5 w-full" importing={importing} label="导入为我的队伍" onClick={() => void handleImport()} />
      )}
    </section>
  );
}
