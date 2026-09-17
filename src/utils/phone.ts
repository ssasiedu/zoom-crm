export const GH_PHONE_REGEX = /^(?:0|\+233)\d{9}$/;

export function cleanPhone(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\-().]/g, '');
}

export function isValidGhanaPhone(value: string | null | undefined): boolean {
  return GH_PHONE_REGEX.test(cleanPhone(value));
}

/** +233241234567 / 233241234567 -> 0241234567 */
export function toLocalPhone(value: string | null | undefined): string {
  const c = cleanPhone(value);
  if (c.startsWith('+233')) return `0${c.slice(4)}`;
  if (c.startsWith('233') && c.length === 12) return `0${c.slice(3)}`;
  return c;
}

/** 0241234567 -> 233241234567 (no plus, as wa.me expects) */
export function toIntlPhone(value: string | null | undefined): string {
  const local = toLocalPhone(value);
  if (local.startsWith('0')) return `233${local.slice(1)}`;
  return local.replace(/^\+/, '');
}

/** 024 123 4567 */
export function formatPhone(value: string | null | undefined): string {
  const local = toLocalPhone(value);
  if (/^0\d{9}$/.test(local)) return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return value ?? '';
}

export function telLink(value: string): string {
  return `tel:+${toIntlPhone(value)}`;
}

export function whatsappLink(value: string, text?: string): string {
  const base = `https://wa.me/${toIntlPhone(value)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
