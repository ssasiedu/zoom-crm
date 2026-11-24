/**
 * Charts drawn straight into the PDF, as vectors.
 *
 * The monthly report goes to management, so it needs pictures and not
 * just tables. Two ways to get them: screenshot what is on screen, or
 * draw them. This draws them, because:
 *
 *   - the PDF is built from the same numbers as the tables, whether or
 *     not the section happens to be rendered on screen;
 *   - vectors stay sharp when the report is printed or zoomed, and keep
 *     the file small;
 *   - nothing depends on the browser having painted anything, so the
 *     export cannot quietly come out blank.
 *
 * Everything is drawn with rectangles, lines, circles and text — the
 * primitives jsPDF is surest about — so there is no arc or path maths
 * to go wrong. A proportion is shown as a full-width stacked bar rather
 * than a pie for the same reason.
 */

/** The slice of jsPDF these charts use. jsPDF satisfies it as it stands. */
export interface PdfSurface {
  setFillColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setLineWidth(width: number): void;
  setFontSize(size: number): void;
  setFont(family: string, style?: string): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  circle(x: number, y: number, r: number, style?: string): void;
  text(text: string, x: number, y: number, options?: { align?: string; angle?: number; baseline?: string }): void;
  getTextWidth(text: string): number;
}

export type ChartKind =
  /** categories across the bottom, one bar per series */
  | 'bar'
  /** categories across the bottom, series stacked on top of each other */
  | 'stackedBar'
  /** categories down the side — for long names like officers or issue types */
  | 'hbar'
  /** one full-width bar split into shares, with the percentages in the legend */
  | 'share';

export type ValueFormat = 'number' | 'money' | 'percent';

export interface ChartSeries {
  name: string;
  /** one value per category */
  values: number[];
  /** #rrggbb; falls back to the palette position */
  color?: string;
}

export interface ChartSpec {
  kind: ChartKind;
  title?: string;
  /** one line of explanation under the title */
  note?: string;
  categories: string[];
  series: ChartSeries[];
  format?: ValueFormat;
  /** print the value on each bar (ignored when it would not fit) */
  valueLabels?: boolean;
  /** height in points, default 200 ('share' is always short) */
  height?: number;
  /** show the legend; defaults to on when there is more than one series */
  legend?: boolean;
  /**
   * Keep only the biggest N categories and gather the rest into "Other".
   * Stops a 16-region chart turning into a smear.
   */
  maxCategories?: number;
}

/* ------------------------------------------------------------------ */
/* Palette — the brand green first, then the chart colours used on     */
/* screen, so a chart in the PDF is recognisably the same chart.       */
/* ------------------------------------------------------------------ */
export const PDF_CHART_COLORS = [
  '#15803d', '#0284c7', '#f59e0b', '#7c3aed', '#dc2626',
  '#0d9488', '#c026d3', '#65a30d', '#e11d48', '#475569',
];

/** Status colours, so "Open" is the same colour everywhere */
export const PDF_STATUS_COLORS: Record<string, string> = {
  Open: '#0284c7',
  'In-Progress': '#f59e0b',
  Resolved: '#15803d',
  Closed: '#475569',
  Overdue: '#dc2626',
};

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const INK: Rgb = [15, 23, 42];
const MUTED: Rgb = [100, 116, 139];
const GRID: Rgb = [226, 232, 240];
const AXIS: Rgb = [148, 163, 184];

function fill(doc: PdfSurface, c: Rgb) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function ink(doc: PdfSurface, c: Rgb) {
  doc.setTextColor(c[0], c[1], c[2]);
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */
const GROUPED = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** Axis ticks have to be short or they collide: 1,250,000 becomes 1.25m */
export function compactValue(v: number, fmt: ValueFormat = 'number'): string {
  if (fmt === 'percent') return `${Math.round(v)}%`;
  const abs = Math.abs(v);
  let text: string;
  if (abs >= 1_000_000) text = `${trimZero(v / 1_000_000)}m`;
  else if (abs >= 10_000) text = `${trimZero(v / 1_000)}k`;
  else text = GROUPED.format(v);
  return fmt === 'money' ? `GHS ${text}` : text;
}

function trimZero(v: number): string {
  const s = v.toFixed(v < 10 ? 1 : 0);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** A value label on a bar, in full unless it is huge */
export function labelValue(v: number, fmt: ValueFormat = 'number'): string {
  if (fmt === 'percent') return `${v.toFixed(v % 1 === 0 ? 0 : 1)}%`;
  if (fmt === 'money') return Math.abs(v) >= 100_000 ? compactValue(v, 'money') : `GHS ${GROUPED.format(v)}`;
  return GROUPED.format(v);
}

/**
 * Axis ticks on round numbers — 0, 25, 50, 75, 100 rather than
 * 0, 23.4, 46.8 — chosen from the 1 / 2 / 2.5 / 5 / 10 family.
 */
export function niceTicks(max: number, wanted = 4): { ticks: number[]; top: number } {
  if (!(max > 0)) return { ticks: [0, 1], top: 1 };
  const raw = max / wanted;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { ticks, top };
}

/** Shorten a label to fit a width, with an ellipsis */
function clip(doc: PdfSurface, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/* ------------------------------------------------------------------ */
/* Preparing the data                                                  */
/* ------------------------------------------------------------------ */
interface Prepared {
  categories: string[];
  series: { name: string; values: number[]; color: Rgb }[];
}

function prepare(spec: ChartSpec): Prepared {
  let categories = spec.categories.map((c) => c || 'Unspecified');
  let values = spec.series.map((s) => spec.categories.map((_, i) => s.values[i] ?? 0));

  const limit = spec.maxCategories;
  if (limit && categories.length > limit) {
    const weight = categories.map((_, i) => values.reduce((sum, v) => sum + Math.abs(v[i]), 0));
    const order = categories.map((_, i) => i).sort((a, b) => weight[b] - weight[a]);
    const keep = order.slice(0, limit - 1).sort((a, b) => a - b);
    const rest = order.slice(limit - 1);
    const restTotal = values.map((v) => rest.reduce((sum, i) => sum + v[i], 0));
    const kept = categories.filter((_, i) => keep.includes(i));
    categories = restTotal.some((t) => t !== 0) ? [...kept, `Other (${rest.length})`] : kept;
    values = values.map((v, s) => {
      const picked = keep.map((i) => v[i]);
      return restTotal.some((t) => t !== 0) ? [...picked, restTotal[s]] : picked;
    });
  }

  return {
    categories,
    series: spec.series.map((s, i) => ({
      name: s.name,
      values: values[i],
      color: rgb(s.color ?? PDF_STATUS_COLORS[s.name] ?? PDF_CHART_COLORS[i % PDF_CHART_COLORS.length]),
    })),
  };
}

/** Whether a chart has anything to show — an all-zero chart is noise */
export function chartHasData(spec: ChartSpec): boolean {
  return (
    spec.categories.length > 0 &&
    spec.series.some((s) => s.values.some((v) => Number.isFinite(v) && v !== 0))
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                             */
/* ------------------------------------------------------------------ */
function drawTitle(doc: PdfSurface, spec: ChartSpec, x: number, y: number, w: number): number {
  let cursor = y;
  if (spec.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    ink(doc, INK);
    doc.text(clip(doc, spec.title, w), x, cursor);
    cursor += 12;
  }
  if (spec.note) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    ink(doc, MUTED);
    doc.text(clip(doc, spec.note, w), x, cursor);
    cursor += 10;
  }
  return cursor;
}

/**
 * Legend swatches, wrapped onto as many lines as they need.
 * Returns the y below the last line.
 */
function drawLegend(
  doc: PdfSurface,
  entries: { name: string; color: Rgb }[],
  x: number,
  y: number,
  w: number,
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const size = 6;
  const gap = 12;
  let cx = x;
  let cy = y;
  for (const e of entries) {
    const textWidth = doc.getTextWidth(e.name);
    if (cx + size + 3 + textWidth > x + w && cx > x) {
      cx = x;
      cy += 11;
    }
    fill(doc, e.color);
    doc.rect(cx, cy - size + 1, size, size, 'F');
    ink(doc, INK);
    doc.text(e.name, cx + size + 3, cy);
    cx += size + 3 + textWidth + gap;
  }
  return cy + 8;
}

function drawGrid(
  doc: PdfSurface,
  ticks: number[],
  top: number,
  plot: { x: number; y: number; w: number; h: number },
  fmt: ValueFormat,
  axisWidth: number,
) {
  doc.setFontSize(7);
  doc.setLineWidth(0.4);
  for (const t of ticks) {
    const ty = plot.y + plot.h - (t / top) * plot.h;
    doc.setDrawColor(GRID[0], GRID[1], GRID[2]);
    doc.line(plot.x, ty, plot.x + plot.w, ty);
    ink(doc, MUTED);
    const label = compactValue(t, fmt);
    doc.text(label, plot.x - 4 - Math.min(doc.getTextWidth(label), axisWidth), ty + 2.4);
  }
  doc.setDrawColor(AXIS[0], AXIS[1], AXIS[2]);
  doc.setLineWidth(0.6);
  doc.line(plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h);
}

/**
 * Category labels under the bars. Horizontal while they fit, otherwise
 * turned 40°, which is what keeps sixteen region names legible.
 */
const SIN40 = Math.sin((40 * Math.PI) / 180);
const COS40 = Math.cos((40 * Math.PI) / 180);

function drawCategoryLabels(
  doc: PdfSurface,
  categories: string[],
  plot: { x: number; y: number; w: number; h: number },
  slot: number,
  room: number,
  leftRoom: number,
) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  ink(doc, MUTED);
  const fits = categories.every((c) => doc.getTextWidth(c) <= slot - 2);
  const baseline = plot.y + plot.h + 9;
  /* A turned label runs down and to the left of its bar, so it is bounded
     twice: by the space below the plot, and — for the leftmost bar — by
     the space to the left of the axis. Clip every label to the smaller of
     the two so they stay inside the box and keep the same length. */
  const maxWidth = Math.min(room / SIN40, (leftRoom + slot / 2) / COS40);
  categories.forEach((c, i) => {
    const centre = plot.x + slot * i + slot / 2;
    if (fits) {
      doc.text(c, centre, baseline, { align: 'center' });
    } else {
      doc.text(clip(doc, c, maxWidth), centre - 2, baseline, { angle: 40, align: 'right' });
    }
  });
}

/** How much room the turned category labels need below the plot */
function categoryRoom(
  doc: PdfSurface,
  categories: string[],
  slot: number,
  max: number,
  leftRoom: number,
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (categories.every((c) => doc.getTextWidth(c) <= slot - 2)) return 14;
  const widest = Math.max(0, ...categories.map((c) => doc.getTextWidth(c)));
  /* The label is clipped to whatever the left margin allows, so only ask
     for the height that the clipped label will actually need. */
  const drawn = Math.min(widest, (leftRoom + slot / 2) / COS40);
  return Math.min(max, Math.round(drawn * SIN40) + 12);
}

/* ------------------------------------------------------------------ */
/* The charts                                                          */
/* ------------------------------------------------------------------ */
function drawVerticalBars(
  doc: PdfSurface,
  spec: ChartSpec,
  data: Prepared,
  box: { x: number; y: number; w: number; h: number },
  stacked: boolean,
) {
  const fmt = spec.format ?? 'number';
  let top = drawTitle(doc, spec, box.x, box.y + 10, box.w);
  const showLegend = spec.legend ?? data.series.length > 1;
  if (showLegend) top = drawLegend(doc, data.series, box.x, top + 6, box.w);

  const max = stacked
    ? Math.max(0, ...data.categories.map((_, i) => data.series.reduce((s, ser) => s + Math.max(0, ser.values[i]), 0)))
    : Math.max(0, ...data.series.flatMap((s) => s.values));
  const { ticks, top: axisTop } = niceTicks(max);

  doc.setFontSize(7);
  const axisWidth = Math.max(...ticks.map((t) => doc.getTextWidth(compactValue(t, fmt)))) + 6;
  const plotX = box.x + axisWidth;
  const plotW = Math.max(40, box.w - axisWidth);
  const slot = plotW / Math.max(1, data.categories.length);
  const bottomRoom = categoryRoom(
    doc,
    data.categories,
    slot,
    Math.max(16, (box.y + box.h - top) * 0.45),
    axisWidth,
  );
  const plot = { x: plotX, y: top, w: plotW, h: Math.max(30, box.y + box.h - top - bottomRoom) };

  drawGrid(doc, ticks, axisTop, plot, fmt, axisWidth);

  /* With only a category or two, a bar that fills its slot reads as a
     slab rather than a chart, so cap how wide one bar may get. */
  const maxBarW = 56;
  const naturalInner = slot * 0.64;
  const inner = Math.min(naturalInner, maxBarW * (stacked ? 1 : data.series.length));
  const groupPad = (slot - inner) / 2;
  const barW = stacked ? inner : inner / data.series.length;

  data.categories.forEach((_, i) => {
    let stackTop = plot.y + plot.h;
    data.series.forEach((ser, s) => {
      const v = Math.max(0, ser.values[i]);
      const barH = (v / axisTop) * plot.h;
      const x = plot.x + slot * i + groupPad + (stacked ? 0 : barW * s);
      const y = stacked ? stackTop - barH : plot.y + plot.h - barH;
      if (v > 0) {
        fill(doc, ser.color);
        doc.rect(x, y, barW, barH, 'F');
      }
      if (stacked) stackTop -= barH;
    });

    if (spec.valueLabels) {
      const total = stacked
        ? data.series.reduce((sum, ser) => sum + Math.max(0, ser.values[i]), 0)
        : Math.max(...data.series.map((ser) => ser.values[i]));
      if (total > 0) {
        const label = labelValue(total, fmt);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        if (doc.getTextWidth(label) <= inner + groupPad) {
          ink(doc, INK);
          const topY = plot.y + plot.h - (total / axisTop) * plot.h;
          doc.text(label, plot.x + slot * i + slot / 2, topY - 3, { align: 'center' });
        }
      }
    }
  });

  drawCategoryLabels(doc, data.categories, plot, slot, bottomRoom, axisWidth);
}

function drawHorizontalBars(
  doc: PdfSurface,
  spec: ChartSpec,
  data: Prepared,
  box: { x: number; y: number; w: number; h: number },
) {
  const fmt = spec.format ?? 'number';
  let top = drawTitle(doc, spec, box.x, box.y + 10, box.w);
  const showLegend = spec.legend ?? data.series.length > 1;
  if (showLegend) top = drawLegend(doc, data.series, box.x, top + 6, box.w);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const labelWidth = Math.min(
    box.w * 0.42,
    Math.max(40, ...data.categories.map((c) => doc.getTextWidth(c))) + 6,
  );
  const stacked = data.series.length > 1;
  const max = stacked
    ? Math.max(0, ...data.categories.map((_, i) => data.series.reduce((s, ser) => s + Math.max(0, ser.values[i]), 0)))
    : Math.max(0, ...data.series.flatMap((s) => s.values));
  const { top: axisTop } = niceTicks(max, 3);

  const plotX = box.x + labelWidth;
  const plotW = Math.max(40, box.w - labelWidth - 34);
  const rows = Math.max(1, data.categories.length);
  const slot = Math.min(26, (box.y + box.h - top) / rows);
  const barH = Math.max(4, slot * 0.62);

  data.categories.forEach((c, i) => {
    const cy = top + slot * i + slot / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    ink(doc, INK);
    doc.text(clip(doc, c, labelWidth - 6), plotX - 6, cy + 2.4, { align: 'right' });

    let x = plotX;
    let total = 0;
    data.series.forEach((ser) => {
      const v = Math.max(0, ser.values[i]);
      const w = (v / axisTop) * plotW;
      if (v > 0) {
        fill(doc, ser.color);
        doc.rect(x, cy - barH / 2, w, barH, 'F');
        x += w;
      }
      total += v;
    });

    if (total > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      ink(doc, MUTED);
      doc.text(labelValue(total, fmt), x + 3, cy + 2.2);
    }
  });

  doc.setDrawColor(AXIS[0], AXIS[1], AXIS[2]);
  doc.setLineWidth(0.6);
  doc.line(plotX, top, plotX, top + slot * rows);
}

/**
 * One bar, full width, split into shares. Says "three quarters of the
 * month's money came from debt recovery" at a glance, which is what a
 * pie would be for, without any arc maths.
 */
function drawShareBar(
  doc: PdfSurface,
  spec: ChartSpec,
  data: Prepared,
  box: { x: number; y: number; w: number; h: number },
) {
  const fmt = spec.format ?? 'number';
  const top = drawTitle(doc, spec, box.x, box.y + 10, box.w);
  const parts = data.series.map((s) => ({
    name: s.name,
    color: s.color,
    value: s.values.reduce((a, b) => a + Math.max(0, b), 0),
  }));
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return;

  const barY = top + 4;
  const barH = 20;
  let x = box.x;
  parts.forEach((p) => {
    const w = (p.value / total) * box.w;
    if (w <= 0) return;
    fill(doc, p.color);
    doc.rect(x, barY, w, barH, 'F');
    const pct = (100 * p.value) / total;
    const label = `${Math.round(pct)}%`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    if (doc.getTextWidth(label) + 6 <= w) {
      doc.setTextColor(255, 255, 255);
      doc.text(label, x + w / 2, barY + barH / 2 + 2.6, { align: 'center' });
    }
    x += w;
  });

  ink(doc, INK);
  drawLegend(
    doc,
    parts.map((p) => ({ name: `${p.name} — ${labelValue(p.value, fmt)}`, color: p.color })),
    box.x,
    barY + barH + 12,
    box.w,
  );
}

/** How tall this chart wants to be, so pages can be laid out up front */
export function chartHeight(spec: ChartSpec): number {
  if (spec.kind === 'share') return 74 + (spec.title ? 12 : 0) + (spec.note ? 10 : 0);
  if (spec.kind === 'hbar') {
    const rows = Math.min(spec.maxCategories ?? spec.categories.length, spec.categories.length);
    return 34 + Math.min(26, 220 / Math.max(1, rows)) * Math.max(1, rows) + (spec.note ? 10 : 0);
  }
  return spec.height ?? 200;
}

/** Draw one chart inside the given box */
export function drawChart(
  doc: PdfSurface,
  spec: ChartSpec,
  box: { x: number; y: number; w: number; h: number },
): void {
  if (!chartHasData(spec)) return;
  const data = prepare(spec);
  doc.setLineWidth(0.4);
  switch (spec.kind) {
    case 'stackedBar':
      drawVerticalBars(doc, spec, data, box, true);
      break;
    case 'bar':
      drawVerticalBars(doc, spec, data, box, false);
      break;
    case 'hbar':
      drawHorizontalBars(doc, spec, data, box);
      break;
    case 'share':
      drawShareBar(doc, spec, data, box);
      break;
  }
  ink(doc, INK);
  doc.setFont('helvetica', 'normal');
}

/**
 * A row of headline figures above the charts — the first thing an
 * executive reads, so it goes at the top of the first page.
 */
export interface KpiTile {
  label: string;
  value: string;
  hint?: string;
}

export function drawKpiRow(
  doc: PdfSurface,
  tiles: KpiTile[],
  box: { x: number; y: number; w: number },
): number {
  if (tiles.length === 0) return box.y;
  const gap = 8;
  const h = 46;
  const w = (box.w - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const x = box.x + (w + gap) * i;
    fill(doc, [248, 250, 252]);
    doc.setDrawColor(GRID[0], GRID[1], GRID[2]);
    doc.setLineWidth(0.5);
    doc.rect(x, box.y, w, h, 'FD');
    ink(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(clip(doc, t.label.toUpperCase(), w - 12), x + 6, box.y + 13);
    ink(doc, INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(clipSize(doc, t.value, w - 12));
    doc.text(clip(doc, t.value, w - 10), x + 6, box.y + 30);
    if (t.hint) {
      ink(doc, MUTED);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(clip(doc, t.hint, w - 12), x + 6, box.y + 40);
    }
  });
  ink(doc, INK);
  doc.setFont('helvetica', 'normal');
  return box.y + h;
}

/** Money runs long; step the figure down rather than let it overflow */
function clipSize(doc: PdfSurface, value: string, room: number): number {
  for (const size of [14, 12, 10.5, 9]) {
    doc.setFontSize(size);
    if (doc.getTextWidth(value) <= room) return size;
  }
  return 8;
}
