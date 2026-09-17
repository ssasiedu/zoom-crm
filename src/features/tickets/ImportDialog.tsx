import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isValid, parse, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useLookups, useOfficers } from '@/hooks/useLookups';
import { useInvalidateTickets } from '@/hooks/useTickets';
import { FIELD_LABELS } from '@/lib/constants';
import { errorMessage } from '@/services/errors';
import { ticketsService } from '@/services/tickets';
import type { Lookups, Officer, Priority, TicketInsert } from '@/types';
import { Badge, Button, Modal } from '@/components/ui';
import { downloadTemplate, readSpreadsheet } from '@/utils/export';
import { isValidGhanaPhone, toLocalPhone } from '@/utils/phone';
import { requiresPayment } from '@/utils/tickets';

interface ParsedRow {
  line: number;
  data: TicketInsert | null;
  errors: string[];
  preview: Record<string, string>;
}

const IMPORT_FIELDS = [
  'client_name',
  'client_id',
  'contact_number',
  'contact_type',
  'community',
  'description',
  'issue_type',
  'responsible_party',
  'payment_amount',
  'payment_source',
  'payment_type',
  'payment_status',
  'region',
  'officer_name',
  'priority',
  'remarks',
  'date_opened',
] as const;
type ImportField = (typeof IMPORT_FIELDS)[number];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** header text -> field, accepting business labels and column names */
function headerMap(): Record<string, ImportField> {
  const map: Record<string, ImportField> = {};
  IMPORT_FIELDS.forEach((f) => {
    map[norm(f)] = f;
    if (FIELD_LABELS[f]) map[norm(FIELD_LABELS[f])] = f;
  });
  map[norm('OFFICER')] = 'officer_name';
  map[norm('PAYMENT')] = 'payment_amount';
  map[norm('ID')] = 'client_id';
  return map;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** Excel drops leading zeros and may store 233… numbers */
function fixPhone(value: string): string {
  const d = value.replace(/[\s\-().]/g, '');
  if (/^\d{9}$/.test(d)) return `0${d}`;
  if (/^233\d{9}$/.test(d)) return `+${d}`;
  return d;
}

function parseDate(v: unknown): string | null {
  if (v instanceof Date && isValid(v)) return v.toISOString();
  const s = str(v);
  if (!s) return null;
  for (const fmt of ['dd/MM/yyyy', 'dd/MM/yyyy HH:mm', 'd/M/yyyy', 'yyyy-MM-dd']) {
    const d = parse(s, fmt, new Date());
    if (isValid(d)) return d.toISOString();
  }
  const iso = parseISO(s);
  return isValid(iso) ? iso.toISOString() : null;
}

function matchLookup(value: string, items: { name: string; is_active: boolean }[]): string | null {
  const v = value.trim().toLowerCase();
  return items.find((i) => i.is_active && i.name.toLowerCase() === v)?.name ?? null;
}

function validateRow(
  raw: Record<string, unknown>,
  line: number,
  hmap: Record<string, ImportField>,
  lookups: Lookups,
  officers: Officer[],
  isAdmin: boolean,
): ParsedRow {
  const r: Partial<Record<ImportField, unknown>> = {};
  Object.entries(raw).forEach(([h, v]) => {
    const f = hmap[norm(h)];
    if (f) r[f] = v;
  });
  const errors: string[] = [];
  const g = (f: ImportField) => str(r[f]);
  const need = (f: ImportField) => {
    if (!g(f)) errors.push(`${FIELD_LABELS[f] ?? f} is required`);
    return g(f);
  };

  const client_name = need('client_name');
  const client_id = need('client_id');
  const phone = fixPhone(need('contact_number'));
  if (phone && !isValidGhanaPhone(phone)) errors.push('CONTACT NUMBER is not a valid Ghana number');
  const community = need('community');
  const description = need('description');

  const lk = (f: ImportField, items: { name: string; is_active: boolean }[], required: boolean) => {
    const v = g(f);
    if (!v) {
      if (required) errors.push(`${FIELD_LABELS[f]} is required`);
      return null;
    }
    const m = matchLookup(v, items);
    if (!m) errors.push(`${FIELD_LABELS[f]} "${v}" is not an allowed value`);
    return m;
  };
  const contact_type = lk('contact_type', lookups.contact_types, true);
  const issue_type = lk('issue_type', lookups.issue_types, true);
  const region = lk('region', lookups.regions, true);
  const needsPay = requiresPayment(issue_type, lookups);
  const payment_source = lk('payment_source', lookups.payment_sources, needsPay);
  const payment_type = lk('payment_type', lookups.payment_types, needsPay);
  const payment_status = lk('payment_status', lookups.payment_statuses, needsPay);

  let payment_amount: number | null = null;
  const amt = g('payment_amount').replace(/[^0-9.-]/g, '');
  if (amt) {
    payment_amount = Number(amt);
    if (!Number.isFinite(payment_amount) || payment_amount < 0) errors.push('PAYMENT must be a positive number');
  } else if (needsPay) errors.push('PAYMENT is required for this issue type');

  let assigned_officer_id: string | null = null;
  if (g('officer_name')) {
    const o = officers.find((x) => x.full_name.toLowerCase() === g('officer_name').toLowerCase());
    if (!o) errors.push(`OFFICER "${g('officer_name')}" not found`);
    else assigned_officer_id = o.id;
  }

  let priority: Priority = 'Medium';
  if (g('priority')) {
    const p = ['Low', 'Medium', 'High', 'Urgent'].find((x) => x.toLowerCase() === g('priority').toLowerCase());
    if (!p) errors.push('Priority must be Low, Medium, High or Urgent');
    else priority = p as Priority;
  }

  let date_opened: string | undefined;
  if (isAdmin && g('date_opened')) {
    const d = parseDate(r.date_opened);
    if (!d) errors.push('DATE OPENED is not a valid date (use DD/MM/YYYY)');
    else date_opened = d;
  }

  const preview = {
    client: client_name,
    id: client_id,
    phone,
    issue: issue_type ?? g('issue_type'),
    region: region ?? g('region'),
  };

  if (errors.length) return { line, data: null, errors, preview };
  return {
    line,
    errors,
    preview,
    data: {
      client_name,
      client_id,
      contact_number: toLocalPhone(phone),
      contact_type: contact_type!,
      community,
      description,
      issue_type: issue_type!,
      region: region!,
      responsible_party: g('responsible_party') || null,
      payment_amount,
      payment_source,
      payment_type,
      payment_status,
      assigned_officer_id,
      priority,
      remarks: g('remarks') || null,
      date_opened,
    },
  };
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const { lookups } = useLookups();
  const { data: officers = [] } = useOfficers();
  const invalidate = useInvalidateTickets();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const isAdmin = can('tickets:editDateOpened');

  const valid = useMemo(() => rows.filter((r) => r.data), [rows]);
  const invalid = rows.length - valid.length;

  const reset = () => {
    setRows([]);
    setFileName('');
    setProgress(0);
  };

  const onFile = async (file: File) => {
    try {
      setBusy(true);
      const data = await readSpreadsheet(file);
      if (data.length === 0) throw new Error('The file has no data rows.');
      if (data.length > 2000) throw new Error('Import at most 2,000 rows at a time.');
      const hmap = headerMap();
      setRows(data.map((raw, i) => validateRow(raw, i + 2, hmap, lookups, officers, isAdmin)));
      setFileName(file.name);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    let done = 0;
    try {
      const chunk = 100;
      for (let i = 0; i < valid.length; i += chunk) {
        await ticketsService.createMany(valid.slice(i, i + chunk).map((r) => r.data!));
        done += Math.min(chunk, valid.length - i);
        setProgress(done);
      }
      toast.success(`Imported ${done} ticket${done === 1 ? '' : 's'}`);
      invalidate();
      reset();
      onClose();
    } catch (err) {
      toast.error(`Stopped after ${done} tickets: ${errorMessage(err)}`);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const template = () => {
    const head = IMPORT_FIELDS.filter((f) => isAdmin || f !== 'date_opened').map((f) => FIELD_LABELS[f] ?? f);
    const example = [
      [
        'Kwame Mensah', 'GHA-712345678-1', '0241234567', 'IN-BOUND CALL', 'Madina',
        'Payment made on 12/05 not reflecting', 'UNREFLECTED PAYMENTS', 'Finance', 250, 'Existing Business',
        lookups.payment_types[0]?.name ?? '', 'Receivables', 'Greater Accra', officers[0]?.full_name ?? '', 'High', '',
        ...(isAdmin ? ['01/06/2026'] : []),
      ],
    ];
    const max = Math.max(...Object.values(lookups).map((l) => l.length), officers.length);
    const notes = [
      ['TYPE OF CONTACT', 'ISSUE TYPE', 'Region', 'PAYMENT SOURCE', 'PAYMENT TYPE', 'PAYMENT STATUS', 'OFFICER', 'Priority'],
      ...Array.from({ length: max }).map((_, i) => [
        lookups.contact_types[i]?.name ?? '',
        lookups.issue_types[i]?.name ?? '',
        lookups.regions[i]?.name ?? '',
        lookups.payment_sources[i]?.name ?? '',
        lookups.payment_types[i]?.name ?? '',
        lookups.payment_statuses[i]?.name ?? '',
        officers[i]?.full_name ?? '',
        ['Low', 'Medium', 'High', 'Urgent'][i] ?? '',
      ]),
    ];
    downloadTemplate('dm-crm-ticket-import-template.xlsx', head, example, notes);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      size="xl"
      title="Import tickets"
      description="Upload an Excel or CSV file. Headers can use the business labels (CLIENT, ID, CONTACT NUMBER…). Imported tickets start as Open."
      footer={
        <>
          <Button variant="ghost" leftIcon={<Download className="size-4" />} onClick={template} className="mr-auto">
            Download template
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button disabled={valid.length === 0} loading={busy && rows.length > 0} onClick={doImport} leftIcon={<Upload className="size-4" />}>
            Import {valid.length || ''} valid row{valid.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-10 text-center hover:border-brand-500 dark:border-slate-700">
          <FileSpreadsheet className="size-10 text-brand-600" />
          <span className="font-medium">{busy ? 'Reading file…' : 'Choose an .xlsx, .xls or .csv file'}</span>
          <span className="text-xs text-slate-500">Rows are validated before anything is saved.</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-brand-600" />
            <span className="font-medium">{fileName}</span>
            <Badge tone="green">{valid.length} valid</Badge>
            {invalid > 0 && <Badge tone="red">{invalid} with errors (will be skipped)</Badge>}
            {busy && progress > 0 && <span className="text-slate-500">Imported {progress}/{valid.length}…</span>}
            <Button variant="ghost" size="xs" onClick={reset} className="ml-auto">
              Choose another file
            </Button>
          </div>
          <div className="scrollbar-thin max-h-[50vh] overflow-auto rounded-lg border dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">CLIENT</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">ISSUE TYPE</th>
                  <th className="px-3 py-2">Region</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.line} className={r.data ? '' : 'bg-rose-50/60 dark:bg-rose-500/5'}>
                    <td className="px-3 py-1.5 text-slate-500 tabular-nums">{r.line}</td>
                    <td className="px-3 py-1.5">{r.preview.client}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.preview.id}</td>
                    <td className="px-3 py-1.5">{r.preview.issue}</td>
                    <td className="px-3 py-1.5">{r.preview.region}</td>
                    <td className="px-3 py-1.5">
                      {r.data ? (
                        <CheckCircle2 className="size-4 text-emerald-600" aria-label="Valid" />
                      ) : (
                        <span className="flex items-start gap-1 text-xs text-rose-700 dark:text-rose-300">
                          <XCircle className="mt-0.5 size-3.5 shrink-0" />
                          {r.errors.join('; ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
