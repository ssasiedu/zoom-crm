import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

const moneyFormatter = new Intl.NumberFormat('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat('en-GH');

export function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** GH₵ 1,250.00  (use plain=true for PDFs, whose base fonts lack the ₵ glyph) */
export function formatGHS(value: unknown, opts: { plain?: boolean } = {}): string {
  const text = moneyFormatter.format(toNumber(value));
  return opts.plain ? `GHS ${text}` : `GH₵ ${text}`;
}

export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

export function formatPercent(value: unknown, digits = 1): string {
  return `${toNumber(value).toFixed(digits)}%`;
}

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(value);
  return isValid(d) ? d : null;
}

/** DD/MM/YYYY */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? format(d, 'dd/MM/yyyy') : fallback;
}

/** DD/MM/YYYY HH:mm */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(value);
  return d ? format(d, 'dd/MM/yyyy HH:mm') : fallback;
}

export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : '';
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return '—';
  const h = Number(hours);
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** yyyy-MM-dd for <input type="date"> */
export function toInputDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, 'yyyy-MM-dd') : '';
}

/** yyyy-MM-ddTHH:mm for <input type="datetime-local"> */
export function toInputDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : '';
}

/** Local datetime-local value -> ISO string */
export function fromInputDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? d.toISOString() : null;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const t = String(value).trim();
  return t === '' ? null : t;
}
