import { AlertTriangle, Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { abilities, currentDataVersion, currentRuleSet, items, moves } from '../data';
import { createId } from '../lib/id';
import { getMemberBattleForm } from '../lib/pokemonForms';
import { statPointKeys, statPointTotal } from '../lib/statPoints';
import { decodeTeamShare, type DecodedTeamShare } from '../lib/teamShare';
import type { Team, TeamMember } from '../types';
import { Button, Card, PokemonAvatar } from '../components/ui';

const statLabels: Record<(typeof statPointKeys)[number], string> = {
  hp: 'HP',
  attack: '攻',
  defense: '防',
  specialAttack: '特攻',
  specialDefense: '特防',
  speed: '速',
};

const abilityName = (abilityId?: string) =>
  abilityId ? abilities.find((entry) => entry.id === abilityId)?.chineseName ?? abilityId : '未设置特性';

const itemName = (itemId?: string) => (itemId ? items.find((entry) => entry.id === itemId)?.chineseName ?? itemId : '无道具');

const moveName = (moveId: string) => moves.find((entry) => entry.id === moveId)?.chineseName ?? moveId;

const statSummary = (member: TeamMember) => {
  const used = statPointKeys
    .filter((key) => Number(member.statPoints?.[key] ?? 0) > 0)
    .map((key) => `${statLabels[key]}${member.statPoints?.[key]}`);
  return used.length > 0 ? `${used.join(' / ')}（合计 ${statPointTotal(member.statPoints ?? {})}）` : 'SP 全 0';
};

/**
 * Build the local team a share link becomes. Fresh ids, current rule/version stamps, and a
 * `share-link-import` source so the origin stays visible in a backup export.
 */
export const createTeamFromShare = (decoded: Pick<DecodedTeamShare, 'name' | 'members'>, sharedAt: string): Team => {
  const importedAt = new Date().toISOString();
  return {
    id: createId('team'),
    name: decoded.name,
    ruleSetId: currentRuleSet.id,
    dataVersionId: currentDataVersion.id,
    members: decoded.members,
    createdAt: importedAt,
    updatedAt: importedAt,
    notes: '',
    source: { kind: 'share-link-import', sharedAt, importedAt },
  };
};

function MemberRow({ member, index }: { member: TeamMember; index: number }) {
  const form = getMemberBattleForm(member);
  const name = form?.chineseName ?? `空位 ${index + 1}`;

  return (
    <li className="flex items-start gap-2 py-2">
      <PokemonAvatar iconRef={form?.iconRef} label={name} size="md" />
      <div className="min-w-0 flex-1 text-xs text-textSecondary">
        <p className="truncate text-sm font-semibold text-textPrimary">{name}</p>
        <p className="mt-0.5 truncate">
          {abilityName(member.abilityId)} · {itemName(member.itemId)} · {member.nature}
        </p>
        <p className="mt-0.5 truncate">{member.moveIds.length > 0 ? member.moveIds.map(moveName).join(' / ') : '未设置招式'}</p>
        <p className="mt-0.5 truncate">{statSummary(member)}</p>
      </div>
    </li>
  );
}

/**
 * The `#/t/<code>` screen: decode, show what the link contains, and only write to IndexedDB
 * when the viewer actually asks. Decoding happens here rather than in the router so a broken
 * link renders an explanation instead of a blank page.
 */
export function SharedTeamPreview({
  code,
  onClose,
  onImport,
}: {
  code: string;
  onClose: () => void;
  onImport: (team: Team) => Promise<void> | void;
}) {
  const [decoded, setDecoded] = useState<DecodedTeamShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    setDecoded(null);
    setError(null);
    decodeTeamShare(code)
      .then((result) => {
        if (active) setDecoded(result);
      })
      .catch((decodeError: unknown) => {
        if (active) setError(decodeError instanceof Error ? decodeError.message : '无法解析这个分享链接。');
      });
    return () => {
      active = false;
    };
  }, [code]);

  const confirmImport = async () => {
    if (!decoded || importing) return;
    setImporting(true);
    try {
      await onImport(createTeamFromShare(decoded, new Date().toISOString()));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 mx-auto max-w-[430px]"
      role="dialog"
      aria-label="分享的队伍"
      aria-modal="true"
      data-bottom-nav-lock="true"
    >
      <button className="absolute inset-0 h-full w-full bg-overlay/75" type="button" aria-label="关闭分享的队伍" onClick={onClose} />
      <section className="surface-shadow absolute inset-x-4 top-1/2 max-h-[calc(100vh-2rem)] -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-textMuted">Shared team</p>
            <h2 className="truncate text-base font-semibold">{decoded?.name ?? (error ? '无法打开分享' : '正在读取分享…')}</h2>
            {decoded && <p className="mt-0.5 text-xs text-textSecondary">{decoded.members.length}/6 成员 · 导入后可自由编辑</p>}
          </div>
          <button
            aria-label="关闭分享的队伍"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-textSecondary"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-missingBg p-3 text-xs text-danger">
            <p className="font-semibold">分享链接打不开</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {!error && !decoded && <p className="py-6 text-center text-sm text-textSecondary">正在读取分享…</p>}

        {decoded && (
          <>
            {decoded.members.length === 0 ? (
              <p className="py-6 text-center text-sm text-textSecondary">这份分享里没有成员。</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-divider px-3">
                  {decoded.members.map((member, index) => (
                    <MemberRow key={member.id} member={member} index={index} />
                  ))}
                </ul>
              </Card>
            )}

            {decoded.warnings.length > 0 && (
              <div className="mt-3 rounded-lg bg-reviewBg p-3 text-xs text-warning">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={14} aria-hidden="true" />
                  部分配置不在当前规则
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {decoded.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="ghost" type="button" onClick={onClose}>
                关闭
              </Button>
              <Button type="button" disabled={importing} onClick={() => void confirmImport()}>
                <Download size={14} />
                导入到我的队伍
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
