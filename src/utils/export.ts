import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export type Cell = string | number | null | undefined;

export interface ExportSheet {
  name: string;
  head: string[];
  rows: Cell[][];
  /** optional totals row, rendered bold in PDF */
  foot?: Cell[];
}

export interface ExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  sheets: ExportSheet[];
  orientation?: 'portrait' | 'landscape';
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

export function createPdf({ title, subtitle, sheets, orientation = 'landscape' }: ExportOptions): jsPDF {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, pageWidth, 54, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 32, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${subtitle ? `${subtitle}   |   ` : ''}Generated ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 32, 42);
  doc.setTextColor(15, 23, 42);

  let y = 72;
  sheets.forEach((sheet) => {
    if (sheets.length > 1) {
      if (y > doc.internal.pageSize.getHeight() - 80) {
        doc.addPage();
        y = 40;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(sheet.name, 32, y);
      y += 8;
    }
    autoTable(doc, {
      startY: y,
      head: [sheet.head],
      body: sheet.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c)))),
      foot: sheet.foot ? [sheet.foot.map((c) => (c === null || c === undefined ? '' : String(c)))] : undefined,
      margin: { left: 32, right: 32 },
      styles: { fontSize: sheet.head.length > 10 ? 6.5 : 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [20, 102, 62], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Page ${pageCount}`,
          pageWidth - 60,
          doc.internal.pageSize.getHeight() - 16,
        );
        doc.setTextColor(15, 23, 42);
      },
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (last?.finalY ?? y) + 24;
  });
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
