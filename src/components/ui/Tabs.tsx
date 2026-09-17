import { useRef, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('scrollbar-thin flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800', className)}
      onKeyDown={(e) => {
        const idx = items.findIndex((i) => i.value === value);
        let next = idx;
        if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
        else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
        else return;
        e.preventDefault();
        onChange(items[next].value);
        refs.current[next]?.focus();
      }}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              selected
                ? 'border-brand-600 text-brand-800 dark:border-brand-400 dark:text-brand-300'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                  selected
                    ? 'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
