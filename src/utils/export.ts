import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { chartHasData, chartHeight, drawChart, drawKpiRow, type ChartSpec, type KpiTile } from './pdfCharts';

export type Cell = string | number | null | undefined;

export interface ExportSheet {
  name: string;
  head: string[];
  rows: Cell[][];
  /** optional totals row, rendered bold in PDF */
  foot?: Cell[];
  /** drawn above this table in the PDF; ignored by Excel and CSV */
  chart?: ChartSpec;
}

export interface ExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  sheets: ExportSheet[];
  orientation?: 'portrait' | 'landscape';
  /** headline figures across the top of the first PDF page */
  kpis?: KpiTile[];
  /** charts on their own, before any table — the at-a-glance page */
  charts?: ChartSpec[];
}

const stamp = () => format(new Date(), 'yyyyMMdd-HHmm');

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
}

export function exportToExcel({ filename, sheets }: ExportOptions): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  sheets.forEach((sheet, index) => {
    const data = [sheet.head, ...sheet.rows, ...(sheet.foot ? [sheet.foot] : [])].map((r) =>
      r.map((c) => (c === null || c === undefined ? '' : c)),
    );
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = sheet.head.map((h, i) => ({
      wch: Math.min(
        60,
        Math.max(h.length, ...data.slice(1).map((r) => String(r[i] ?? '').length)) + 2,
      ),
    }));
    let name = safeSheetName(sheet.name);
    if (used.has(name)) name = safeSheetName(`${name} ${index + 1}`);
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  XLSX.writeFile(wb, `${filename}-${stamp()}.xlsx`);
}

export function exportToCsv({ filename, sheets }: ExportOptions): void {
  const sheet = sheets[0];
  if (!sheet) return;
  const ws = XLSX.utils.aoa_to_sheet([sheet.head, ...sheet.rows].map((r) => r.map((c) => c ?? '')));
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${filename}-${stamp()}.csv`);
}

const MARGIN = 32;

export function createPdf({
  title,
  subtitle,
  sheets,
  orientation = 'landscape',
  kpis,
  charts,
}: ExportOptions): jsPDF {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const floor = pageHeight - 40;

  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, pageWidth, 54, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, MARGIN, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${subtitle ? `${subtitle}   |   ` : ''}Generated ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, MARGIN, 42);
  doc.setTextColor(15, 23, 42);

  let y = 72;
  /** Start a new page when what comes next will not fit on this one */
  const room = (needed: number) => {
    if (y + needed > floor) {
      doc.addPage();
      y = 40;
    }
  };

  /**
   * Draw a chart, letting it give up some height rather than leave a
   * third of a page blank — but never squeezing it below the point
   * where it stops being readable.
   */
  const MIN_CHART = 150;
  const putChart = (spec: ChartSpec, gap: number) => {
    if (!chartHasData(spec)) return;
    const wanted = chartHeight(spec);
    if (y + MIN_CHART + 12 > floor) {
      doc.addPage();
      y = 40;
    }
    const h = Math.min(wanted, Math.max(MIN_CHART, floor - y - 12));
    drawChart(doc, spec, { x: MARGIN, y, w: contentWidth, h });
    y += h + gap;
  };

  if (kpis && kpis.length > 0) {
    room(60);
    y = drawKpiRow(doc, kpis, { x: MARGIN, y, w: contentWidth }) + 20;
  }

  for (const spec of charts ?? []) putChart(spec, 20);

  sheets.forEach((sheet) => {
    if (sheet.chart) putChart(sheet.chart, 16);
    if (sheets.length > 1) {
      room(80);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(sheet.name, MARGIN, y);
      y += 8;
    }
    autoTable(doc, {
      startY: y,
      head: [sheet.head],
      body: sheet.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))),
      foot: sheet.foot ? [sheet.foot.map((c) => (c === null || c === undefined ? '' : String(c)))] : undefined,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: sheet.head.length > 10 ? 6.5 : 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [20, 102, 62], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (last?.finalY ?? y) + 24;
  });

  /* Numbered at the end, so the pages the charts added are stamped too
     and every page can say how many there are in total. */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} of ${pages}`, pageWidth - MARGIN, pageHeight - 16, { align: 'right' });
    doc.setTextColor(15, 23, 42);
  }
  return doc;
}

export function exportToPdf(options: ExportOptions): void {
  const doc = createPdf(options);
  doc.save(`${options.filename}-${stamp()}.pdf`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read the first sheet of an Excel/CSV file into objects keyed by header */
export async function readSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const first = wb.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first], { defval: '', raw: true });
}

export function downloadTemplate(
  filename: string,
  head: string[],
  example: Cell[][],
  notes: string[][],
  sheetName = 'Tickets',
): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...example]), safeSheetName(sheetName));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(notes), 'Allowed values');
  XLSX.writeFile(wb, filename);
}
