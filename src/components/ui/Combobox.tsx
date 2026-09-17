import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { controlBase } from './Field';

export interface ComboOption {
  value: string;
  label: string;
  description?: ReactNode;
  meta?: ReactNode;
}

export interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** options to show; parent can filter them using onQueryChange */
  options: ComboOption[];
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  /** freeSolo: the typed text itself is the value (e.g. COMMUNITY) */
  freeSolo?: boolean;
  loading?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  emptyText?: string;
  className?: string;
  onBlur?: () => void;
}

export function Combobox({
  id,
  value,
  onChange,
  options,
  onQueryChange,
  placeholder,
  freeSolo,
  loading,
  invalid,
  disabled,
  emptyText = 'No matches',
  className,
  onBlur,
}: ComboboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(freeSolo ? value : '');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (freeSolo) setQuery(value);
  }, [value, freeSolo]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = onQueryChange
    ? options
    : options.filter((o) => !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));

  const pick = (opt: ComboOption) => {
    onChange(opt.value);
    setQuery(freeSolo ? opt.value : '');
    setOpen(false);
  };

  const display = freeSolo ? query : open ? query : (selected?.label ?? '');

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${inputId}-error` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected && !freeSolo ? selected.label : placeholder}
        value={display}
        className={cn(controlBase, 'h-9 pr-8')}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={onBlur}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          setActive(0);
          onQueryChange?.(v);
          if (freeSolo) onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && filtered[active]) {
            e.preventDefault();
            pick(filtered[active]);
          } else if (e.key === 'Escape') {
            if (open) e.stopPropagation();
            setOpen(false);
          } else if (e.key === 'Tab') {
            setOpen(false);
          }
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ChevronsUpDown className="size-4" />}
      </span>
      {open && !disabled && (filtered.length > 0 || !freeSolo) && (
        <ul
          id={listId}
          role="listbox"
          className="scrollbar-thin absolute z-40 mt-1 max-h-64 w-full min-w-56 animate-pop-in overflow-auto rounded-control border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>}
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(opt);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm',
                i === active && 'bg-brand-50 dark:bg-brand-500/10',
              )}
            >
              <Check
                className={cn('mt-0.5 size-4 shrink-0 text-brand-600', opt.value === value ? 'opacity-100' : 'opacity-0')}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{opt.label}</span>
                  {opt.meta}
                </div>
                {opt.description && <div className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
