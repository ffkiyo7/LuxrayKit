import { Check, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { currentDataVersion } from '../../data';
import { Button } from '../../components/ui';

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
  { kind: 'bug', label: '问题' },
  { kind: 'idea', label: '建议' },
  { kind: 'other', label: '其他' },
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
  rateLimited: '今天留言太多了，明天再来。',
  unavailable: '留言功能暂时不可用，稍后再试。',
  invalid: '这条留言没能通过校验，改一改再发。',
  network: '发送失败，草稿还在，可以再试一次。',
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

  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[430px]" role="dialog" aria-label="写留言" aria-modal="true" data-bottom-nav-lock="true">
      <button className="absolute inset-0 h-full w-full bg-overlay/75" type="button" aria-label="关闭留言" onClick={onClose} />
      <section className="surface-shadow absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-disabled" />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">写留言</h2>
            <p className="mt-0.5 text-xs text-textSecondary">直接写给我们，不需要账号。留言不公开。</p>
          </div>
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-textSecondary" type="button" aria-label="关闭留言" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-accent">
              <Check size={28} strokeWidth={2.4} />
            </div>
            <p className="text-base font-semibold">已收到，谢谢！</p>
            <p className="mt-1 text-xs text-textSecondary">我们会一条条看。留言不会公开显示。</p>
            <Button className="mt-4 w-full" type="button" onClick={onClose}>
              关闭
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-2" role="group" aria-label="留言类型">
              {KIND_OPTIONS.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={draft.kind === kind}
                  onClick={() => update({ kind })}
                  className={`inline-flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-semibold transition active:scale-[0.98] ${
                    draft.kind === kind ? 'border-accent bg-accent text-page' : 'border-border bg-secondary text-textSecondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="block text-[11px] font-semibold text-textSecondary" htmlFor="feedback-message">
              留言内容
            </label>
            <textarea
              id="feedback-message"
              ref={messageRef}
              className="mt-1 min-h-[132px] w-full resize-none rounded-lg border border-border bg-secondary p-3 text-sm text-textPrimary outline-none focus:border-accent"
              maxLength={FEEDBACK_MESSAGE_MAX}
              aria-describedby="feedback-message-help"
              placeholder="遇到的问题、想要的功能，或者随便说点什么。"
              value={draft.message}
              onChange={(event) => update({ message: event.target.value })}
            />
            <div id="feedback-message-help" className="mt-1 flex justify-between gap-2 text-[11px] tabular-nums text-textMuted">
              <span aria-live="polite">
                {trimmedLength < FEEDBACK_MESSAGE_MIN
                  ? `至少 ${FEEDBACK_MESSAGE_MIN} 字，还差 ${FEEDBACK_MESSAGE_MIN - trimmedLength} 字（不计首尾空格）`
                  : '已达到最低字数'}
              </span>
              <span>{draft.message.length}/{FEEDBACK_MESSAGE_MAX}</span>
            </div>

            <label className="mt-2 block text-[11px] font-semibold text-textSecondary" htmlFor="feedback-contact">
              联系方式（可选）
            </label>
            <input
              id="feedback-contact"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-textPrimary outline-none focus:border-accent"
              maxLength={CONTACT_MAX}
              placeholder="邮箱 / Discord，想要回复时填"
              value={draft.contact}
              onChange={(event) => update({ contact: event.target.value })}
            />

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

            {failure && (
              <p role="alert" className="mt-3 rounded-lg bg-missingBg p-2 text-xs text-danger">
                {FAILURE_MESSAGES[failure]}
              </p>
            )}
            {!online && (
              <p className="mt-3 rounded-lg bg-reviewBg p-2 text-xs text-warning">浏览器提示当前离线，仍可尝试发送；发送失败会保留草稿。</p>
            )}

            {/* `disabled:bg-secondary` on top of the shared Button: the primary variant keeps
                its accent fill when disabled, which on a full-width send button reads as
                "tap me" even though it does nothing. */}
            <Button className="mt-3 h-10 w-full disabled:bg-secondary" type="button" disabled={!canSubmit} onClick={() => void submit()}>
              <Send size={14} />
              {status === 'submitting' ? '发送中...' : '发送'}
            </Button>
            <p className="mt-2 text-[11px] text-textMuted">
              发送时会附带构建标识与数据版本，方便定位问题；不会附带 IP 原文或任何队伍内容。
            </p>
          </>
        )}
      </section>
    </div>
  );
}
