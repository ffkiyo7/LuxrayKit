import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

// Top-level safety net: a render error in any lazily-loaded page (or a stale chunk
// after a deploy) would otherwise white-screen the whole app with no way to recover.
// We show a friendly fallback with a reload action instead.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error captured by ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-page px-6 text-center text-textSecondary">
        <div className="max-w-[320px]">
          <AlertTriangle className="mx-auto mb-3 text-warning" size={32} />
          <p className="text-sm font-semibold text-textPrimary">页面出了点问题</p>
          <p className="mt-1 text-sm">本地保存的队伍数据不会丢失，刷新即可重新载入。</p>
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-textPrimary"
            onClick={() => window.location.reload()}
          >
            重新载入
          </button>
        </div>
      </div>
    );
  }
}
