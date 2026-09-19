import { AtSign, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { currentDataVersion } from '../../data';

/**
 * 站内留言表单（底部弹层）。
 *
 * 为什么不是三个 GitHub issue 入口：那三个入口都**强制登录 GitHub**，对一个不需要账号的
 * 本地优先 PWA 来说是最高的一道门槛。这里改成私信箱——用户提交后只看到「已收到」，留言
 * 不公开，服务端存在 Cloudflare Durable Object SQLite 里（见 `cloudflare/environment-worker/
 * src/feedbackInbox.ts` 与开发指南 §6.8）。
 *
 * 草稿存 sessionStorage：底部弹层很容易被误触关掉，而这是用户手打的字，丢一次就不会再写
 * 第二次。提交成功后立刻清掉。
 */

export type FeedbackKindOption = 'bug' | 'idea' | 'other';

const KIND_OPTIONS: Array<{ kind: FeedbackKindOption; label: string }> = [
  { kind: 'bug', label: '遇到问题' },
  { kind: 'idea', label: '想要功能' },
  { kind: 'other', label: '数据有误' },
];

export const FEEDBACK_MESSAGE_MIN = 5;
export const FEEDBACK_MESSAGE_MAX = 1000;
const CONTACT_MAX = 120;
const DRAFT_KEY = 'luxraykit:feedback-draft';

type Draft = { kind: FeedbackKindOption; message: string; contact: string };

const emptyDraft: Draft = { kind: 'idea', message: '', contact: '' };

const readDraft = (): Draft => {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      kind: KIND_OPTIONS.some((option) => option.kind === parsed.kind) ? parsed.kind as FeedbackKindOption : 'idea',
      message: typeof parsed.message === 'string' ? parsed.message.slice(0, FEEDBACK_MESSAGE_MAX) : '',
      contact: typeof parsed.contact === 'string' ? parsed.contact.slice(0, CONTACT_MAX) : '',
    };
  } catch {
    return emptyDraft;
  }
};

const writeDraft = (draft: Draft) => {
  try {
    if (!draft.message && !draft.contact) window.sessionStorage.removeItem(DRAFT_KEY);
    else window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode / quota — a lost draft is a worse-but-acceptable outcome than a crash.
  }
};

type Status = 'idle' | 'submitting' | 'sent';

/** 每种失败给一句用户能据此行动的话，而不是把状态码丢给他们。 */
const FAILURE_MESSAGES = {
  rateLimited: '刚刚已经发过一条，稍后可以再发。草稿已保留。',
  unavailable: '留言服务暂时不可用。草稿已保留，稍后重试。',
  invalid: '这条内容没法提交，换个说法再试。',
  network: '网络没连上，没有发出去。草稿已保留。',
} as const;

type Failure = keyof typeof FAILURE_MESSAGES;

const useOnlineStatus = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
};

export function FeedbackSheet({ onClose, route = '/profile' }: { onClose: () => void; route?: string }) {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<Failure | null>(null);
  // Honeypot. Kept in state (not a ref) so it is sent verbatim with the body: a bot that
  // fills every input gets a fake success, and nothing is written server-side.
  const [website, setWebsite] = useState('');
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const online = useOnlineStatus();

  useEffect(() => {
    messageRef.current?.focus();
  }, []);

  const update = (patch: Partial<Draft>) => {
    setFailure(null);
    setDraft((previous) => {
      const next = { ...previous, ...patch };
      writeDraft(next);
      return next;
    });
  };

  const trimmedLength = draft.message.trim().length;
  // Browser connectivity is only a hint; the request determines whether sending works.
  const canSubmit = trimmedLength >= FEEDBACK_MESSAGE_MIN && status !== 'submitting';

  const submit = async () => {
    if (!canSubmit) return;
    setStatus('submitting');
    setFailure(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: draft.kind,
          message: draft.message.trim(),
          contact: draft.contact.trim(),
          route,
          appBuild: __APP_BUILD__,
          dataVersion: currentDataVersion.id,
          website,
        }),
      });

      if (response.ok) {
        try {
          window.sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          // ignore
        }
        setDraft(emptyDraft);
        setStatus('sent');
        return;
      }

      setStatus('idle');
      if (response.status === 429) setFailure('rateLimited');
      else if (response.status === 503) setFailure('unavailable');
      else if (response.status === 400 || response.status === 413) setFailure('invalid');
      else setFailure('network');
    } catch {
      // Draft survives on purpose: this is the one failure the user can retry as-is.
      setStatus('idle');
      setFailure('network');
    }
  };

  const shortBy = FEEDBACK_MESSAGE_MIN - trimmedLength;
  // One banner slot, one message: a failure is what the user just did, offline is why the next
  // attempt may fail, and the character hint only matters while neither applies (08-03 / N08-03).
  const banner = failure
    ? { role: 'alert' as const, tint: 'danger', text: FAILURE_MESSAGES[failure] }
    : !online
      ? { role: undefined, tint: 'data', text: '浏览器提示当前离线，仍可尝试发送；发送失败会保留草稿。' }
      : shortBy > 0
        ? { role: undefined, tint: 'neutral', text: `再写 ${shortBy} 个字就能发送。` }
        : null;

  const bannerStyle =
    banner?.tint === 'danger'
      ? { background: 'rgb(var(--color-danger) / 0.12)' }
      : banner?.tint === 'data'
        ? { background: 'rgb(var(--color-data) / 0.1)' }
        : { background: 'rgb(var(--color-text-primary) / 0.06)' };

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px]" role="dialog" aria-label="写留言" aria-modal="true" data-bottom-nav-lock="true">
      <button className="lk-sheet-overlay absolute inset-0 h-full w-full" type="button" aria-label="关闭留言" onClick={onClose} />
      <section className="lk-sheet--deep absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-3.5">
        <span className="mx-auto mb-4 block h-1 w-[38px] rounded-full bg-textPrimary/20" />
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 min-w-0 text-[22px] font-extrabold leading-[30px] tracking-[-0.01em]">{status === 'sent' ? '已收到' : '写留言'}</h2>
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-btn2 text-textLabel" type="button" aria-label="关闭留言" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {status === 'sent' ? (
          <>
            <p className="mt-2.5 text-[15px] font-semibold leading-[22px] text-textLabel">留言已送出。留了联系方式的话，回复会发到那里。</p>
            <button className="mt-4 flex h-12 w-full items-center justify-center rounded-[14px] bg-accent text-[15px] font-extrabold text-page" type="button" onClick={onClose}>
              完成
            </button>
          </>
        ) : (
          <>
            <div className="mt-4 flex gap-2" role="group" aria-label="留言类型">
              {KIND_OPTIONS.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={draft.kind === kind}
                  onClick={() => update({ kind })}
                  className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] ${
                    draft.kind === kind ? 'lk-chip-outline font-extrabold text-textPrimary' : 'bg-surface font-semibold text-textSecondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              id="feedback-message"
              ref={messageRef}
              aria-label="留言内容"
              className="lk-field mt-3 min-h-[132px] w-full resize-none rounded-2xl p-3.5 text-[15px] leading-[22px] text-textPrimary outline-none placeholder:text-btnDisabledInk"
              maxLength={FEEDBACK_MESSAGE_MAX}
              placeholder="遇到的问题、想要的功能，或者随便说点什么。"
              value={draft.message}
              onChange={(event) => update({ message: event.target.value })}
            />
            <div className="mt-1.5 flex justify-end text-[11px] font-bold tabular-nums text-chevron">
              {draft.message.length} / {FEEDBACK_MESSAGE_MAX}
            </div>

            <div className="lk-field mt-2 flex h-12 items-center gap-2.5 rounded-[14px] px-3.5">
              <AtSign aria-hidden="true" className="shrink-0 text-chevron" size={16} />
              <input
                id="feedback-contact"
                aria-label="联系方式（可选）"
                className="min-w-0 flex-1 bg-transparent text-[15px] font-bold text-textPrimary outline-none placeholder:font-medium placeholder:text-btnDisabledInk"
                maxLength={CONTACT_MAX}
                placeholder="邮箱 / Discord，想要回复时填"
                value={draft.contact}
                onChange={(event) => update({ contact: event.target.value })}
              />
            </div>

            {/* Honeypot: off-screen rather than `display:none`, because a headless bot that
                only skips hidden fields would otherwise dodge it. Never announced, never focusable. */}
            <input
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              name="website"
              className="absolute h-px w-px overflow-hidden opacity-0"
              style={{ left: '-9999px', top: 0 }}
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />

            {banner && (
              <p
                aria-live="polite"
                className={`mt-3 rounded-[14px] px-3.5 py-3 text-xs font-semibold leading-[18px] ${
                  banner.tint === 'danger' ? 'text-danger' : banner.tint === 'data' ? 'text-data' : 'text-textLabel'
                }`}
                role={banner.role}
                style={bannerStyle}
              >
                {banner.text}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="flex h-12 items-center justify-center rounded-[14px] bg-btn2 text-[15px] font-bold text-textLabel" type="button" onClick={onClose}>
                取消
              </button>
              <button
                className={`flex h-12 items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold ${
                  canSubmit ? 'bg-accent text-page' : status === 'submitting' ? 'bg-btn1 text-textLabel' : 'bg-btn1 text-textSecondary'
                }`}
                disabled={!canSubmit}
                type="button"
                onClick={() => void submit()}
              >
                {status === 'submitting' ? '发送中' : <><Send size={16} />发送</>}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
