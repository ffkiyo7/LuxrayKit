import { MoonStar, Upload, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAppStore } from '../../state/AppContext';
import { SectionLabel } from '../../components/kit/SectionLabel';
import { ProfileRow } from './ProfileRow';
import { SubPageHeader } from './SubPageHeader';
import { downloadBackup, readBackupFile, type BackupReadResult } from './backupFile';

type Outcome =
  | { tone: 'success'; title: string; body: string }
  | { tone: 'info'; title: string; body: string }
  | { tone: 'danger'; title: string; body: string };

const dotClass = { success: 'bg-success', info: 'bg-textSecondary', danger: 'bg-danger' } as const;

const fileSizeLabel = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** 本地备份 (N08-01) and the three import outcomes (N08-02 / 02b / 02c). */
export function BackupPage({ onBack, onGoToTeams }: { onBack: () => void; onGoToTeams: () => void }) {
  const { teams, preferences, replaceTeams, replacePreferences } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [importing, setImporting] = useState(false);

  const pickFile = () => {
    setOutcome(null);
    inputRef.current?.click();
  };

  const applyImport = async (result: BackupReadResult) => {
    if (result.kind === 'unreadable') {
      setOutcome({ tone: 'danger', title: '这个文件读不了', body: '不是 LuxrayKit 导出的备份，或者文件已损坏。本机数据没有变化。' });
      return;
    }
    await replaceTeams(result.teams);
    if (result.kind === 'backup') {
      await replacePreferences(result.preferences);
      setOutcome({ tone: 'success', title: `已导入 ${result.teams.length} 支队伍`, body: '偏好与主题也一并恢复。' });
      return;
    }
    setOutcome({ tone: 'info', title: '这是旧版备份', body: `已导入 ${result.teams.length} 支队伍。这份 JSON 只有队伍，偏好与主题保持不变。` });
  };

  const startImport = async () => {
    if (!picked || importing) return;
    setImporting(true);
    try {
      await applyImport(await readBackupFile(picked));
      setPicked(null);
    } catch {
      // replaceTeams writes before it shows anything, so a failed write leaves this device as it was.
      setOutcome({ tone: 'danger', title: '导入没有完成', body: '本机存储写入失败（可能是空间不足）。本机数据没有变化。' });
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      accept="application/json"
      className="hidden"
      type="file"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) {
          setOutcome(null);
          setPicked(file);
        }
      }}
    />
  );

  if (outcome) {
    return (
      <div className="pb-7">
        <SubPageHeader subtitle="导入结果" title="本地备份" onBack={onBack} />
        <section className="px-6 pt-[22px]">
          <div className="rounded-[18px] bg-surface p-4" role="status">
            <p className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.01em]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass[outcome.tone]}`} />
              {outcome.title}
            </p>
            <p className="mt-2 text-[13px] font-semibold leading-5 text-textLabel">{outcome.body}</p>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <button
                className="inline-flex h-11 items-center justify-center rounded-[14px] bg-btn1 px-4 text-sm font-bold text-textPrimary"
                type="button"
                onClick={outcome.tone === 'danger' ? pickFile : onGoToTeams}
              >
                {outcome.tone === 'danger' ? '换一个文件' : '去我的队伍'}
              </button>
            </div>
          </div>
        </section>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="pb-7">
      <SubPageHeader subtitle="队伍与偏好导出成一份 JSON，换机或清数据前先存一份" title="本地备份" onBack={onBack} />

      <section className="flex flex-col gap-2.5 px-6 pt-[22px]">
        <button
          className="lk-btn-primary flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-accent text-base font-extrabold text-page"
          type="button"
          onClick={() => downloadBackup(teams, preferences)}
        >
          导出 JSON
        </button>
        <button className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-btn1 text-base font-bold text-textPrimary" type="button" onClick={pickFile}>
          <Upload size={17} />
          选择文件导入
        </button>
      </section>

      <section className="px-6 pt-[26px]">
        <SectionLabel>这份备份包含</SectionLabel>
        <div className="mt-1.5">
          <ProfileRow icon={<Users size={17} />} tile="lk-tile--blue" title={`${teams.length} 支队伍`} trailing={null} />
          <ProfileRow
            divider={false}
            icon={<MoonStar size={17} />}
            subtitle={`主题 · ${preferences.theme === 'dark' ? '深色' : '浅色'}`}
            tile="lk-tile--teal"
            title="显示偏好"
            trailing={null}
          />
        </div>
      </section>

      {picked && (
        <section className="px-6 pt-[22px]">
          <div className="lk-panel rounded-[18px] p-4">
            <SectionLabel>已选文件</SectionLabel>
            <p className="mt-2 text-base font-bold tracking-[-0.01em]">{picked.name}</p>
            <p className="mt-1 text-xs font-semibold tabular-nums text-textSecondary">{fileSizeLabel(picked.size)} · 导入会替换本机队伍</p>
            <div className="mt-3.5 flex gap-2.5">
              <button
                className="lk-btn-primary--flat inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-[14px] bg-accent text-[15px] font-extrabold text-page"
                disabled={importing}
                type="button"
                onClick={() => void startImport()}
              >
                {importing ? '导入中' : '开始导入'}
              </button>
              <button className="inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-[14px] bg-btn1 text-[15px] font-bold text-textPrimary" type="button" onClick={pickFile}>
                换一个文件
              </button>
            </div>
          </div>
        </section>
      )}

      {fileInput}
    </div>
  );
}
