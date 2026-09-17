import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/utils/cn';

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  compact,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand-100/60 blur-xl dark:bg-brand-500/10" aria-hidden />
        <div className="relative flex size-14 items-center justify-center rounded-2xl border border-brand-100 bg-white text-brand-700 shadow-sm dark:border-brand-900 dark:bg-slate-900 dark:text-brand-400 [&>svg]:size-7">
          {icon ?? <Inbox />}
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">We couldn't load this</p>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
        >
          Try again
        </button>
      )}
    </div>
  );
}
