import {
  ExternalLink,
  Import,
  KeyRound,
  SlidersHorizontal,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button, Card, PokemonAvatar } from '../components/ui';
import {
  getEnvironmentPokemon,
  type EnvironmentBattleType,
  type EnvironmentTeamSample,
} from '../data/environment';
import { isVgcPastesSample } from './environmentTeamSamples';

const battleTypeLabels: Record<EnvironmentBattleType, string> = {
  singles: '单打',
  doubles: '双打',
};

const sampleSourceLabel = (sample: EnvironmentTeamSample) =>
  isVgcPastesSample(sample) ? 'VGCPastes' : 'PokeDB 环境榜';

const sampleCardTitle = (sample: EnvironmentTeamSample) => {
  if (!isVgcPastesSample(sample)) return sample.title;
  return sample.title || [sample.author, sample.tournament, sample.eventRank].filter(Boolean).join(' · ') || '锦标赛公开构筑';
};

const sampleCardMeta = (sample: EnvironmentTeamSample) => {
  if (isVgcPastesSample(sample)) {
    const eventParts = [sample.tournament, sample.eventRank].filter(Boolean);
    const dateText = sample.dateShared ? `分享 ${sample.dateShared}` : undefined;
    return [sample.author ? `原作者：${sample.author}` : undefined, eventParts.join(' · ') || undefined, dateText].filter(
      (part): part is string => Boolean(part),
    );
  }

  return [`原作者：${sample.author}`, battleTypeLabels[sample.battleType]];
};

const importChipDefinitions: Array<{
  label: string;
  icon: LucideIcon;
  isVisible: (sample: EnvironmentTeamSample) => boolean;
}> = [
  { label: 'SP分配', icon: SlidersHorizontal, isVisible: (sample) => Boolean(sample.hasSpread) },
  { label: '配招', icon: Swords, isVisible: (sample) => Boolean(sample.hasMoves) },
  { label: '队伍码', icon: KeyRound, isVisible: (sample) => Boolean(sample.replicaCode) },
];

export function TeamSampleCard({
  sample,
  onImport,
}: {
  sample: EnvironmentTeamSample;
  onImport: (sample: EnvironmentTeamSample) => Promise<void> | void;
}) {
  const [importing, setImporting] = useState(false);
  const visibleSlots = sample.slots.map((slot) => getEnvironmentPokemon(slot.pokemonId)).filter(Boolean);
  const metaParts = sampleCardMeta(sample);
  const importChips = importChipDefinitions.filter((chip) => chip.isVisible(sample));

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(sample);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="bg-secondary">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" title={sampleCardTitle(sample)}>{sampleCardTitle(sample)}</h3>
          <p className="mt-1 text-xs text-textSecondary">{metaParts.join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-textSecondary">
              <Trophy aria-hidden="true" size={12} />
              {sampleSourceLabel(sample)}
            </span>
          </div>
        </div>
        <button
          aria-label="队报链接"
          title="队报链接"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-textSecondary active:scale-[0.96]"
          type="button"
          onClick={() => window.open(sample.reportUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink aria-hidden="true" size={15} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {visibleSlots.map((entry) => (
          <PokemonAvatar key={entry!.id} iconRef={entry!.iconRef} label={entry!.chineseName} size="sm" />
        ))}
      </div>
      {importChips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="可导入内容">
          <span className="text-[11px] font-semibold text-textMuted">可导入</span>
          {importChips.map(({ label, icon: Icon }) => (
            <span
              key={label}
              aria-label={`可导入 ${label}`}
              className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent"
            >
              <Icon aria-hidden="true" size={12} strokeWidth={2.2} />
              {label}
            </span>
          ))}
        </div>
      )}
      <Button className="mt-3 w-full" onClick={handleImport} disabled={importing}>
        <Import aria-hidden="true" size={14} />
        {importing ? '导入中' : '导入配置'}
      </Button>
    </Card>
  );
}
