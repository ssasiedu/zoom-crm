import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, FileText, Loader2, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { ticketsService } from '@/services/tickets';
import { StatusBadge } from '@/components/ui';
import { useDialogBehaviour } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { formatPhone } from '@/utils/phone';
import { NAV_ITEMS } from './nav';

interface Entry {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { can, officerId, role } = useAuth();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounce(term.trim(), 250);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useDialogBehaviour(open, onClose, panelRef);

  useEffect(() => {
    if (open) {
      setTerm('');
      setActive(0);
    }
  }, [open]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['palette', debounced],
    queryFn: () => ticketsService.quickSearch(debounced, 8),
    enabled: open && debounced.length >= 2,
    staleTime: 10_000,
  });

  const entries = useMemo<Entry[]>(() => {
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const pages: Entry[] = NAV_ITEMS.filter((i) =>
      i.officerOnly ? Boolean(officerId) || role === 'dm_officer' : i.permission ? can(i.permission) : true,
    )
      .filter((i) => !term || i.label.toLowerCase().includes(term.toLowerCase()))
      .map((i) => ({ key: `nav-${i.to}`, label: i.label, hint: 'Go to page', icon: <i.icon className="size-4" />, run: go(i.to) }));
    const tickets: Entry[] =
      debounced.length >= 2
        ? results.map((t) => ({
            key: t.id,
            label: `${t.ticket_number} · ${t.client_name}`,
            hint: `ID ${t.client_id} · ${formatPhone(t.contact_number)} · ${t.region} · ${formatDate(t.date_opened)}`,
            icon: <FileText className="size-4" />,
            badge: <StatusBadge status={t.status} />,
            run: go(`/tickets/${t.id}`),
          }))
        : [];
    return [...tickets, ...pages];
  }, [results, debounced, term, can, officerId, role, navigate, onClose]);

  useEffect(() => {
    setActive(0);
  }, [entries.length]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[10vh]">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className="relative w-full max-w-xl animate-pop-in overflow-hidden rounded-panel bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      >
        <div className="flex items-center gap-2 border-b px-4">
          {isFetching ? (
            <Loader2 className="size-5 animate-spin text-brand-600" />
          ) : (
            <Search className="size-5 text-slate-400" />
          )}
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={entries[active] ? `palette-${active}` : undefined}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, entries.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                entries[active]?.run();
              }
            }}
            placeholder="Ticket no., client name, client ID or phone…"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border px-1.5 text-[11px] text-slate-400">Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" className="scrollbar-thin max-h-[55vh] overflow-y-auto p-2">
          {debounced.length >= 2 && !isFetching && results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-500">No tickets match “{debounced}”.</li>
          )}
          {debounced.length < 2 && (
            <li className="px-3 pt-1 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Type at least 2 characters to search tickets
            </li>
          )}
          {entries.map((entry, i) => (
            <li
              key={entry.key}
              id={`palette-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={entry.run}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                i === active ? 'bg-brand-50 dark:bg-brand-500/10' : '',
              )}
            >
              <span className="text-slate-400">{entry.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.label}</p>
                {entry.hint && <p className="truncate text-xs text-slate-500">{entry.hint}</p>}
              </div>
              {entry.badge}
              {i === active && <CornerDownLeft className="size-4 text-slate-400" />}
            </li>
          ))}
        </ul>
        <div className="flex gap-4 border-t bg-slate-50 px-4 py-2 text-[11px] text-slate-500 dark:bg-slate-900/60">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>N new ticket</span>
          <span>/ search</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
