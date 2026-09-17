import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useDialogBehaviour } from './Modal';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

const WIDTH = { md: 'sm:max-w-md', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

export function Drawer({ open, onClose, title, subtitle, actions, children, footer, width = 'lg' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehaviour(open, onClose, panelRef);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex h-full w-full animate-drawer-in flex-col bg-white shadow-2xl outline-none dark:bg-slate-950 dark:ring-1 dark:ring-slate-800',
          WIDTH[width],
        )}
      >
        <header className="flex items-start gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>}
          </div>
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Close panel"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="border-t bg-slate-50/80 px-4 py-3 sm:px-5 dark:bg-slate-900/70">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
