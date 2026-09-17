import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** changing this key resets the boundary (e.g. route path) */
  resetKey?: string;
  fullPage?: boolean;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const isChunkError = /Failed to fetch dynamically imported module|Loading chunk/i.test(this.state.error.message);
    return (
      <div
        role="alert"
        className={
          this.props.fullPage
            ? 'flex min-h-dvh items-center justify-center p-6'
            : 'flex min-h-[50vh] items-center justify-center p-6'
        }
      >
        <div className="max-w-md rounded-panel border border-rose-200 bg-white p-6 text-center shadow-sm dark:border-rose-900/60 dark:bg-slate-900">
          <AlertOctagon className="mx-auto size-10 text-rose-500" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Something went wrong</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isChunkError
              ? 'A new version of the app is available. Reload to continue.'
              : 'This part of the app hit an unexpected error. Your data is safe — try again, or reload the page.'}
          </p>
          <details className="mt-3 text-left text-xs text-slate-400">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre>
          </details>
          <div className="mt-4 flex justify-center gap-2">
            {!isChunkError && (
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="rounded-control px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-control bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              <RotateCcw className="size-4" /> Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
