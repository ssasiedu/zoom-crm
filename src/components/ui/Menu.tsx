import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Accessible dropdown menu (button + role=menu) */
export function Menu({
  trigger,
  items,
  align = 'right',
  label,
  children,
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items?: MenuItem[];
  align?: 'left' | 'right';
  label?: string;
  /** custom panel content instead of items */
  children?: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={wrap} className={cn('relative inline-block', className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: btn })}
      {open && (
        <div
          ref={panel}
          role={items ? 'menu' : 'dialog'}
          aria-label={label}
          onKeyDown={(e) => {
            if (!items) return;
            const els = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
            const i = els.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              els[(i + 1) % els.length]?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              els[(i - 1 + els.length) % els.length]?.focus();
            }
          }}
          className={cn(
            'absolute z-40 mt-1.5 min-w-48 animate-pop-in rounded-control border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items?.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm focus:outline-none disabled:opacity-50',
                item.danger
                  ? 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50 dark:hover:bg-rose-500/10 dark:focus:bg-rose-500/10'
                  : 'text-slate-700 hover:bg-slate-100 focus:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800',
              )}
            >
              {item.icon && <span className="text-slate-400 [&>svg]:size-4">{item.icon}</span>}
              {item.label}
            </button>
          ))}
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
