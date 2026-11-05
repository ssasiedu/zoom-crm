import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Skeleton } from './Skeleton';

export type StatTone = 'brand' | 'blue' | 'amber' | 'green' | 'gray' | 'red' | 'gold' | 'violet';

const ICON_TONE: Record<StatTone, string> = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  blue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  gray: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300',
  red: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  gold: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
};

/**
 * A card is narrow and "GH₵ 1,234,567.00" is not. Rather than clip the
 * figure, drop a size for every few extra characters so the whole number
 * is always readable.
 */
function valueSize(value: ReactNode): string {
  if (typeof value !== 'string' && typeof value !== 'number') return 'text-2xl';
  const n = String(value).length;
  if (n <= 7) return 'text-2xl';
  if (n <= 11) return 'text-xl';
  if (n <= 15) return 'text-lg';
  return 'text-base';
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  hint?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export function StatCard({ label, value, icon, tone = 'brand', hint, loading, onClick, active, className }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick && active !== undefined ? active : undefined}
      className={cn(
        'group flex min-w-0 items-start gap-3 rounded-panel border border-slate-200 bg-white p-4 text-left shadow-xs transition dark:border-slate-800 dark:bg-slate-900',
        onClick && 'hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700',
        active && 'border-brand-600 ring-2 ring-brand-600/20 dark:border-brand-500',
        className,
      )}
    >
      {icon && (
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5', ICON_TONE[tone])}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-20" />
        ) : (
          <span
            title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
            className={cn(
              /* Money runs long — step the size down rather than clip it */
              'mt-0.5 block font-bold tracking-tight break-words text-slate-900 tabular-nums dark:text-white',
              valueSize(value),
            )}
          >
            {value}
          </span>
        )}
        {hint && !loading && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
    </Comp>
  );
}
