import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Lightweight CSS tooltip; the trigger gets aria-describedby */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'right';
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-xs animate-fade-in rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-slate-700',
            side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
            side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
            side === 'right' && 'top-1/2 left-full ml-2 -translate-y-1/2',
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
