import {
  addDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';

export type RangePreset = 'today' | 'week' | 'month' | 'quarter' | 'last30' | 'last6m' | 'all' | 'custom';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last6m', label: 'Last 6 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

export interface DateRangeValue {
  preset: RangePreset;
  /** yyyy-MM-dd, inclusive (custom only) */
  from?: string;
  /** yyyy-MM-dd, inclusive (custom only) */
  to?: string;
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/** Resolve a preset into inclusive yyyy-MM-dd bounds */
export function resolveRange(value: DateRangeValue): { from?: string; to?: string } {
  const now = new Date();
  switch (value.preset) {
    case 'today':
      return { from: fmt(now), to: fmt(now) };
    case 'week':
      return { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(endOfWeek(now, { weekStartsOn: 1 })) };
    case 'month':
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case 'quarter':
      return { from: fmt(startOfQuarter(now)), to: fmt(endOfQuarter(now)) };
    case 'last30':
      return { from: fmt(subDays(now, 29)), to: fmt(now) };
    case 'last6m':
      return { from: fmt(subMonths(now, 6)), to: fmt(now) };
    case 'custom':
      return { from: value.from || undefined, to: value.to || undefined };
    default:
      return {};
  }
}

/** Inclusive yyyy-MM-dd -> ISO timestamp at local start of day */
export function startOfDayISO(date: string): string {
  const d = parseISO(date);
  return isValid(d) ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() : date;
}

/** Inclusive yyyy-MM-dd upper bound -> exclusive ISO timestamp (next day start) */
export function exclusiveEndISO(date: string): string {
  const d = parseISO(date);
  return isValid(d) ? addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), 1).toISOString() : date;
}

export function rangeLabel(value: DateRangeValue): string {
  const r = resolveRange(value);
  if (!r.from && !r.to) return 'All time';
  const f = (s?: string) => (s ? format(parseISO(s), 'dd/MM/yyyy') : '…');
  return `${f(r.from)} – ${f(r.to)}`;
}

export function parsePreset(value: string | null, fallback: RangePreset = 'month'): RangePreset {
  return RANGE_PRESETS.find((p) => p.value === value)?.value ?? fallback;
}
