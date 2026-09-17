import type { ExportSheet } from '@/utils/export';
import { formatGHS } from '@/utils/format';

/** Format money columns (headers containing "GHS") for PDF output */
export function toPdfSheets(sheets: ExportSheet[]): ExportSheet[] {
  return sheets.map((s) => {
    const moneyCols = s.head.map((h, i) => (h.includes('GHS') ? i : -1)).filter((i) => i >= 0);
    const fix = (row: ExportSheet['rows'][number]) =>
      row.map((c, i) => (moneyCols.includes(i) && typeof c === 'number' ? formatGHS(c, { plain: true }) : c));
    return {
      ...s,
      head: s.head.map((h) => h.replace(' (GHS)', '')),
      rows: s.rows.map(fix),
      foot: s.foot ? fix(s.foot) : undefined,
    };
  });
}
