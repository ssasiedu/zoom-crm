/** Minimal colour helpers for runtime branding (no dependency needed) */

export function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((value ?? '').trim());
}

function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function mix(color: [number, number, number], target: [number, number, number], amount: number): string {
  return toHex([
    color[0] + (target[0] - color[0]) * amount,
    color[1] + (target[1] - color[1]) * amount,
    color[2] + (target[2] - color[2]) * amount,
  ]);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/**
 * Build a 50–950 ramp around a brand colour. The supplied colour becomes
 * the 700 step, which is what buttons and the sidebar use.
 */
export function brandRamp(hex: string): Record<string, string> {
  if (!isHexColor(hex)) return {};
  const base = toRgb(hex);
  return {
    50: mix(base, WHITE, 0.95),
    100: mix(base, WHITE, 0.88),
    200: mix(base, WHITE, 0.75),
    300: mix(base, WHITE, 0.58),
    400: mix(base, WHITE, 0.38),
    500: mix(base, WHITE, 0.18),
    600: mix(base, WHITE, 0.07),
    700: toHex(base),
    800: mix(base, BLACK, 0.14),
    900: mix(base, BLACK, 0.26),
    950: mix(base, BLACK, 0.58),
  };
}

/** Gold-style accent ramp: 300 / 400 / 500 */
export function accentRamp(hex: string): Record<string, string> {
  if (!isHexColor(hex)) return {};
  const base = toRgb(hex);
  return {
    300: mix(base, WHITE, 0.35),
    400: mix(base, WHITE, 0.18),
    500: toHex(base),
  };
}

/** Readable text colour (black or white) for a background */
export function contrastText(hex: string): string {
  if (!isHexColor(hex)) return '#ffffff';
  const [r, g, b] = toRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}
