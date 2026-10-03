import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parse, startOfMonth } from 'date-fns';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useLookups, useOfficers } from '@/hooks/useLookups';
import { useDebtorPeriods, useInvalidateDebtors } from '@/hooks/useDebtors';
import { DEBTOR_FIELD_LABELS } from '@/lib/constants';
import { qk } from '@/lib/queryClient';
import { debtorsService } from '@/services/debtors';
import { errorMessage } from '@/services/errors';
import { ensureLookupValues } from '@/services/lookups';
import type { DebtorInsert, Officer } from '@/types';
import { Badge, Button, Checkbox, Field, Input, Modal, Select } from '@/components/ui';
import { downloadTemplate, readSpreadsheet } from '@/utils/export';
import { formatGHS } from '@/utils/format';
import { isValidGhanaPhone, toLocalPhone } from '@/utils/phone';

const L = DEBTOR_FIELD_LABELS;

type Field8 =
  | 'customer_id'
  | 'customer_name'
  | 'customer_type'
  | 'provider'
  | 'community'
  | 'contact_number'
  | 'outstanding_balance'
  | 'officer_name'
  | 'region';

const FIELDS: Field8[] = [
  'customer_id',
  'customer_name',
  'customer_type',
  'provider',
  'community',
  'contact_number',
  'outstanding_balance',
  'officer_name',
  'region',
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function headerMap(): Record<string, Field8> {
  const map: Record<string, Field8> = {};
  FIELDS.forEach((f) => {
    map[norm(f)] = f;
    if (L[f]) map[norm(L[f])] = f;
  });
  map[norm('OFFICER')] = 'officer_name';
  map[norm('BALANCE')] = 'outstanding_balance';
  map[norm('AMOUNT OUTSTANDING')] = 'outstanding_balance';
  map[norm('CUSTOMER')] = 'customer_name';
  map[norm('NAME')] = 'customer_name';
  map[norm('TEL')] = 'contact_number';
  map[norm('PHONE')] = 'contact_number';
  return map;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function fixPhone(value: string): string {
  const d = value.replace(/[\s\-().]/g, '');
  if (/^\d{9}$/.test(d)) return `0${d}`;
  if (/^233\d{9}$/.test(d)) return `+${d}`;
  return d;
}

interface ParsedRow {
  line: number;
  values: Record<Field8, string>;
  row: DebtorInsert | null;
  errors: string[];
  warnings: string[];
}

function parseRows(
  data: Record<string, unknown>[],
  periodId: string,
  officers: Officer[],
  known: { customerTypes: Set<string>; providers: Set<string>; regions: Set<string> },
): ParsedRow[] {
  const hmap = headerMap();
  const officerByName = new Map(officers.map((o) => [o.full_name.toLowerCase(), o]));

  return data.map((raw, index) => {
    const values = {} as Record<Field8, string>;
    FIELDS.forEach((f) => {
      values[f] = '';
    });
    Object.entries(raw).forEach(([header, value]) => {
      const field = hmap[norm(header)];
      if (field) values[field] = str(value);
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!values.customer_name) errors.push('CUSTOMER NAME is required');

    const balanceText = values.outstanding_balance.replace(/[^0-9.-]/g, '');
    const balance = balanceText === '' ? 0 : Number(balanceText);
    if (!Number.isFinite(balance) || balance < 0) errors.push('OUTSTANDING BALANCE must be a positive number');
    if (balanceText === '') warnings.push('no balance — recorded as 0');

    let phone: string | null = null;
    if (values.contact_number) {
      const fixed = fixPhone(values.contact_number);
      if (isValidGhanaPhone(fixed)) phone = toLocalPhone(fixed);
      else warnings.push('phone number not valid — left blank');
    }

    let officerId: string | null = null;
    if (values.officer_name) {
      const officer = officerByName.get(values.officer_name.toLowerCase());
      if (officer) officerId = officer.id;
      else errors.push(`OFFICER "${values.officer_name}" is not in the officer list`);
    }

    if (values.customer_type && !known.customerTypes.has(values.customer_type.toUpperCase())) {
      warnings.push(`new CUSTOMER TYPE "${values.customer_type}"`);
    }
    if (values.provider && !known.providers.has(values.provider.toUpperCase())) {
      warnings.push(`new PROVIDER "${values.provider}"`);
    }

    const line = index + 2;
    if (errors.length) return { line, values, row: null, errors, warnings };

    return {
      line,
      values,
      errors,
      warnings,
      row: {
        period_id: periodId,
        customer_id: values.customer_id || null,
        customer_name: values.customer_name,
        customer_type: values.customer_type || null,
        provider: values.provider || null,
        community: values.community || null,
        region: values.region && known.regions.has(values.region.toUpperCase()) ? values.region : null,
        contact_number: phone,
        outstanding_balance: Math.round(balance * 100) / 100,
        officer_id: officerId,
        amount_collected: null,
        feedback: null,
        comment: null,
        promised_amount: null,
        promised_date: null,
      } as DebtorInsert,
    };
  });
}

export function DebtorUploadDialog({ open, onClose, periodId }: { open: boolean; onClose: () => void; periodId?: string }) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateDebtors();
  const { lookups } = useLookups();
  const { data: officers = [] } = useOfficers();
  const { data: periods = [] } = useDebtorPeriods();

  const [month, setMonth] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM'));
  const [targetPeriod, setTargetPeriod] = useState(periodId ?? '');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [replace, setReplace] = useState(false);
  const [addMissing, setAddMissing] = useState(true);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const known = useMemo(
    () => ({
      customerTypes: new Set(lookups.customer_types.map((x) => x.name.toUpperCase())),
      providers: new Set(lookups.providers.map((x) => x.name.toUpperCase())),
      regions: new Set(lookups.regions.map((x) => x.name.toUpperCase())),
    }),
    [lookups],
  );

  const valid = rows.filter((r) => r.row);
  const invalid = rows.length - valid.length;
  const totalOutstanding = valid.reduce((s, r) => s + Number(r.row?.outstanding_balance ?? 0), 0);
  const unassigned = valid.filter((r) => !r.row?.officer_id).length;

  const reset = () => {
    setRows([]);
    setFileName('');
    setProgress(0);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  /** Make sure a period exists for the chosen month and return its id */
  const resolvePeriod = async (): Promise<string> => {
    if (targetPeriod) return targetPeriod;
    const first = `${month}-01`;
    const existing = periods.find((p) => p.period_month.slice(0, 7) === month);
    if (existing) return existing.id;
    const created = await debtorsService.createPeriod(first);
    queryClient.invalidateQueries({ queryKey: qk.debtorPeriods });
    return created.id;
  };

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const data = await readSpreadsheet(file);
      if (data.length === 0) throw new Error('That file has no data rows.');
      if (data.length > 20000) throw new Error('Upload at most 20,000 rows at a time.');
      const period = await resolvePeriod();
      setTargetPeriod(period);
      setRows(parseRows(data, period, officers, known));
      setFileName(file.name);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (valid.length === 0) return;
    setBusy(true);
    try {
      const period = targetPeriod || (await resolvePeriod());

      if (addMissing) {
        const newTypes = valid
          .map((r) => r.values.customer_type)
          .filter((v) => v && !known.customerTypes.has(v.toUpperCase()));
        const newProviders = valid.map((r) => r.values.provider).filter((v) => v && !known.providers.has(v.toUpperCase()));
        if (newTypes.length) await ensureLookupValues('customer_types', newTypes);
        if (newProviders.length) await ensureLookupValues('providers', newProviders);
        queryClient.invalidateQueries({ queryKey: qk.lookups });
      }

      if (replace) {
        const existing = await debtorsService.listAll({ period });
        await debtorsService.remove(existing.map((d) => d.id));
      }

      const payload = valid.map((r) => ({ ...(r.row as DebtorInsert), period_id: period }));
      const chunk = 500;
      let done = 0;
      for (let i = 0; i < payload.length; i += chunk) {
        done += await debtorsService.createMany(payload.slice(i, i + chunk));
        setProgress(done);
      }

      if (notify) await debtorsService.notifyAssignment(period);

      toast.success(`${done} debtor record${done === 1 ? '' : 's'} uploaded`);
      invalidate();
      reset();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const template = () => {
    const head = [
      L.customer_id,
      L.customer_name,
      L.customer_type,
      L.provider,
      L.community,
      L.contact_number,
      L.outstanding_balance,
      L.officer_name,
    ];
    const example = [
      [
        'ZL-00123',
        'Ama Serwaa',
        lookups.customer_types[0]?.name ?? 'RESIDENTIAL',
        lookups.providers[0]?.name ?? 'ZOOMLION',
        'Madina',
        '0241234567',
        450,
        officers[0]?.full_name ?? '',
      ],
    ];
    const max = Math.max(lookups.customer_types.length, lookups.providers.length, officers.length, 1);
    const notes = [
      ['CUSTOMER TYPE', 'PROVIDER', 'OFFICER'],
      ...Array.from({ length: max }).map((_, i) => [
        lookups.customer_types[i]?.name ?? '',
        lookups.providers[i]?.name ?? '',
        officers[i]?.full_name ?? '',
      ]),
    ];
    downloadTemplate('zoomlion-debtor-upload-template.xlsx', head, example, notes, 'Debtors');
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Upload monthly debtor list"
      description="Excel or CSV with: CUSTOMER ID, CUSTOMER NAME, CUSTOMER TYPE, PROVIDER, COMMUNITY, CONTACT NUMBER, OUTSTANDING BALANCE, OFFICER."
      footer={
        <>
          <Button variant="ghost" className="mr-auto" leftIcon={<Download className="size-4" />} onClick={template}>
            Download template
          </Button>
          <Button variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            leftIcon={<Upload className="size-4" />}
            disabled={valid.length === 0}
            loading={busy && rows.length > 0}
            onClick={run}
          >
            Upload {valid.length || ''} row{valid.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Month" htmlFor="debtor-month" hint="A period is created if this month doesn't have one yet.">
            <Input
              id="debtor-month"
              type="month"
              value={month}
              disabled={rows.length > 0}
              onChange={(e) => {
                setMonth(e.target.value);
                setTargetPeriod('');
              }}
            />
          </Field>
          <Field label="Or add to an existing month" htmlFor="debtor-period">
            <Select
              id="debtor-period"
              placeholder="Create from the month above"
              value={targetPeriod}
              disabled={rows.length > 0}
              onChange={(e) => {
                setTargetPeriod(e.target.value);
                const p = periods.find((x) => x.id === e.target.value);
                if (p) setMonth(p.period_month.slice(0, 7));
              }}
              options={periods.map((p) => ({
                value: p.id,
                label: format(parse(p.period_month, 'yyyy-MM-dd', new Date()), 'MMMM yyyy'),
              }))}
            />
          </Field>
        </div>

        {rows.length === 0 ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-10 text-center hover:border-brand-500 dark:border-slate-700">
            <FileSpreadsheet className="size-10 text-brand-600" />
            <span className="font-medium">{busy ? 'Reading file…' : 'Choose an .xlsx, .xls or .csv file'}</span>
            <span className="text-xs text-slate-500">Nothing is saved until you press Upload.</span>
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
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-brand-600" />
              <span className="font-medium">{fileName}</span>
              <Badge tone="green">{valid.length} ready</Badge>
              {invalid > 0 && <Badge tone="red">{invalid} with errors (skipped)</Badge>}
              <Badge tone="gold">{formatGHS(totalOutstanding)} outstanding</Badge>
              {unassigned > 0 && <Badge tone="amber">{unassigned} without an officer</Badge>}
              {busy && progress > 0 && <span className="text-slate-500">Saved {progress}/{valid.length}…</span>}
              <Button variant="ghost" size="xs" className="ml-auto" onClick={reset} disabled={busy}>
                Choose another file
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Checkbox
                label="Replace this month's list"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              <Checkbox
                label="Add new customer types / providers"
                checked={addMissing}
                onChange={(e) => setAddMissing(e.target.checked)}
              />
              <Checkbox label="Notify officers" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            </div>
            {replace && (
              <p className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-3.5" /> Existing rows for this month, including any feedback already
                recorded, will be deleted first.
              </p>
            )}

            <div className="scrollbar-thin max-h-[44vh] overflow-auto rounded-lg border dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">{L.customer_name}</th>
                    <th className="px-3 py-2">{L.customer_id}</th>
                    <th className="px-3 py-2">{L.community}</th>
                    <th className="px-3 py-2 text-right">{L.outstanding_balance}</th>
                    <th className="px-3 py-2">{L.officer_name}</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {rows.slice(0, 500).map((r) => (
                    <tr key={r.line} className={r.row ? '' : 'bg-rose-50/60 dark:bg-rose-500/5'}>
                      <td className="px-3 py-1.5 text-slate-500 tabular-nums">{r.line}</td>
                      <td className="px-3 py-1.5">{r.values.customer_name}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.values.customer_id}</td>
                      <td className="px-3 py-1.5">{r.values.community}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.values.outstanding_balance}</td>
                      <td className="px-3 py-1.5">{r.values.officer_name}</td>
                      <td className="px-3 py-1.5">
                        {r.row ? (
                          r.warnings.length ? (
                            <span className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              {r.warnings.join('; ')}
                            </span>
                          ) : (
                            <CheckCircle2 className="size-4 text-emerald-600" aria-label="Ready" />
                          )
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
              {rows.length > 500 && (
                <p className="px-3 py-2 text-xs text-slate-500">Showing the first 500 rows of {rows.length}.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
