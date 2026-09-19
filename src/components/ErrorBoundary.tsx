import { Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { currentRuleSet } from '../data';
import { buildHash } from '../lib/hashRoute';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  detail: string;
};

// Top-level safety net: a render error in any lazily-loaded page (or a stale chunk
// after a deploy) would otherwise white-screen the whole app with no way to recover.
// We show a friendly fallback with a reload action instead (08-07).
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, detail: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, detail: `${error.name}: ${error.message}` };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error captured by ErrorBoundary:', error, info.componentStack);
    // The first stack frame is what a bug report needs; the rest is noise on a phone screen.
    const frame = (info.componentStack ?? '').trim().split('\n')[0]?.trim();
    if (frame) this.setState((previous) => ({ ...previous, detail: `${previous.detail}\n${frame}` }));
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const meta = `${__APP_BUILD__} · ${currentRuleSet.name}`;

    return (
      <main className="mx-auto min-h-screen max-w-[430px] bg-page text-textPrimary">
        <div className="px-6 pb-6 pt-16">
          <span
            className="grid h-[52px] w-[52px] place-items-center rounded-2xl text-danger"
            style={{ background: 'rgb(var(--color-danger) / 0.14)', boxShadow: 'inset 0 0 0 1.5px rgb(var(--color-danger) / 0.35)' }}
          >
            <TriangleAlert size={24} />
          </span>
          <h1 className="mt-[22px] text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">这个页面崩了</h1>
          <p className="mt-2.5 text-[15px] leading-[22px] text-textSecondary">重新载入通常就能恢复，本地数据不受影响。</p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              className="lk-btn-primary flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-accent text-base font-extrabold text-page"
              type="button"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={17} />
              重新载入
            </button>
            <button
              className="flex h-[50px] items-center justify-center rounded-2xl bg-surface text-[15px] font-bold text-textLabel"
              type="button"
              onClick={() => {
                window.location.hash = buildHash({ name: 'env' });
                window.location.reload();
              }}
            >
              回到环境首页
            </button>
          </div>

          <div className="mt-[26px] rounded-2xl bg-sunken p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-bold text-textLabel">错误详情</span>
              <button
                className="inline-flex items-center gap-1.5 text-xs font-bold text-textSecondary"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(`${this.state.detail}\n${meta}`)}
              >
                <Copy size={14} />
                复制
              </button>
            </div>
            <p className="mt-2.5 whitespace-pre-line break-all font-mono text-xs leading-[18px] text-textMuted">{this.state.detail}</p>
            <p className="mt-3 text-xs font-semibold leading-[18px] text-textMuted">{meta}</p>
          </div>
        </div>
      </main>
    );
  }
}
