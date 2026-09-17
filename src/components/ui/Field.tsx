import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
  highlight?: boolean;
}

export function Field({ label, htmlFor, required, error, hint, className, children, highlight }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={cn(
            'text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300',
            highlight && 'text-gold-500 dark:text-gold-400',
          )}
        >
          {label}
          {required && (
            <span className="ml-0.5 text-rose-600" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const controlBase =
  'w-full rounded-control border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs transition placeholder:text-slate-400 ' +
  'focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800/60 ' +
  'aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500/15';
