import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Field, Input, Modal, Select, Textarea, type SelectOption } from '@/components/ui';
import { useLookups } from '@/hooks/useLookups';
import { useOfficers } from '@/hooks/useOfficers';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { ensureLookupValues } from '@/services/lookups';
import { validationsService } from '@/services/validations';
import type { Officer, ValidationBatch, ValidationCustomerInsert } from '@/types';
import { downloadTemplate, readSpreadsheet } from '@/utils/export';
import { isValidGhanaPhone, toLocalPhone } from '@/utils/phone';

/* The columns a validation sheet can carry — the same ones a debtor
   sheet carries, so a team used to that one can reuse their export. */
type Col =
  | 'customer_id'
  | 'customer_name'
  | 'customer_type'
  | 'provider'
  | 'community'
  | 'contact_number'
  | 'outstanding_balance'
  | 'officer_name'
  | 'region';

const COLS: Col[] = [
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

const LABEL: Record<Col, string> = {
  customer_id: 'CUSTOMER ID',
  customer_name: 'CUSTOMER NAME',
  customer_type: 'CUSTOMER TYPE',
  provider: 'PROVIDER',
  community: 'COMMUNITY',
  contact_number: 'CONTACT NUMBER',
  outstanding_balance: 'OUTSTANDING BALANCE',
  officer_name: 'OFFICER',
  region: 'REGION',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function headerMap(): Record<string, Col> {
  const map: Record<string, Col> = {};
  COLS.forEach((c) => {
    map[norm(c)] = c;
    map[norm(LABEL[c])] = c;
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

type LookupIndex = Map<string, string>;

/** Spreadsheet casing rarely matches the stored value, but the foreign
    keys are case-sensitive — match loosely, write back the stored name. */
function canonical(index: LookupIndex, value: string): string | null {
  return index.get(value.trim().toUpperCase()) ?? null;
}

interface ParsedRow {
  line: number;
  values: Record<Col, string>;
  row: ValidationCustomerInsert | null;
  errors: string[];
  warnings: string[];
}

function parseRows(
  data: Record<string, unknown>[],
  batchId: string,
  officers: Officer[],
  known: { customerTypes: LookupIndex; providers: LookupIndex; regions: LookupIndex },
  addMissing: boolean,
): ParsedRow[] {
  const hmap = headerMap();
  const officerByName = new Map(officers.map((o) => [o.full_name.toLowerCase(), o]));

  return data.map((raw, index) => {
    const values = {} as Record<Col, string>;
    COLS.forEach((c) => {
      values[c] = '';
    });
    Object.entries(raw).forEach(([header, value]) => {
      const col = hmap[norm(header)];
      if (col) values[col] = str(value);
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!values.customer_name) errors.push('CUSTOMER NAME is required');

    const balanceText = values.outstanding_balance.replace(/[^0-9.-]/g, '');
    const balance = balanceText === '' ? 0 : Number(balanceText);
    if (!Number.isFinite(balance) || balance < 0) errors.push('OUTSTANDING BALANCE must be a positive number');

    let phone: string | null = null;
    if (values.contact_number) {
      const fixed = fixPhone(values.contact_number);
      if (isValidGhanaPhone(fixed)) phone = toLocalPhone(fixed);
      else warnings.push('phone number not valid — left blank, so nobody can call this one');
    } else {
      warnings.push('no phone number — nobody can call this one');
    }

    let officerId: string | null = null;
    if (values.officer_name) {
      const officer = officerByName.get(values.officer_name.toLowerCase());
      if (officer) officerId = officer.id;
      else errors.push(`OFFICER "${values.officer_name}" is not in the officer list`);
    }

    let customerType = canonical(known.customerTypes, values.customer_type);
    if (values.customer_type && !customerType) {
      if (addMissing) {
        customerType = values.customer_type.trim();
        warnings.push(`new CUSTOMER TYPE "${customerType}" will be added`);
      } else {
        warnings.push(`CUSTOMER TYPE "${values.customer_type}" is not in the list — left blank`);
      }
    }

    let provider = canonical(known.providers, values.provider);
    if (values.provider && !provider) {
      if (addMissing) {
        provider = values.provider.trim();
        warnings.push(`new PROVIDER "${provider}" will be added`);
      } else {
        warnings.push(`PROVIDER "${values.provider}" is not in the list — left blank`);
      }
    }

    const region = canonical(known.regions, values.region);
    if (values.region && !region) {
      warnings.push(`Region "${values.region}" is not one of Ghana's 16 regions — left blank`);
    }

    const line = index + 2;
    if (errors.length) return { line, values, row: null, errors, warnings };

    return {
      line,
      values,
      errors,
      warnings,
      row: {
        batch_id: batchId,
        customer_id: values.customer_id || null,
        customer_name: values.customer_name,
        customer_type: customerType,
        provider,
        community: values.community || null,
        region,
        contact_number: phone,
        outstanding_balance: Math.round(balance * 100) / 100,
        officer_id: officerId,
      } satisfies ValidationCustomerInsert,
    };
  });
}

/**
 * Start an exercise: give it a name and say what it is for, then load
 * the list. The name and purpose are what turn a pile of calls into a
 * report somebody can act on three months later.
 */
export function ValidationUploadDialog({
  open,
  onClose,
  batches,
  batchId,
}: {
  open: boolean;
  onClose: () => void;
  batches: ValidationBatch[];
  batchId?: string;
}) {
  const queryClient = useQueryClient();
  const { lookups } = useLookups();
  const { data: officers = [] } = useOfficers();

  const [target, setTarget] = useState<string>(batchId ?? '');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [addMissing, setAddMissing] = useState(true);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const known = useMemo(
    () => ({
      customerTypes: new Map(lookups.customer_types.map((x) => [x.name.toUpperCase(), x.name])),
      providers: new Map(lookups.providers.map((x) => [x.name.toUpperCase(), x.name])),
      regions: new Map(lookups.regions.map((x) => [x.name.toUpperCase(), x.name])),
    }),
    [lookups],
  );

  const batchOptions: SelectOption[] = batches
    .filter((b) => b.status === 'open')
    .map((b) => ({ value: b.id, label: b.name }));

  const newExercise = target === '';
  const valid = (rows ?? []).filter((r) => r.row);
  const bad = (rows ?? []).filter((r) => !r.row);
  const warned = valid.filter((r) => r.warnings.length > 0);

  const reset = () => {
    setRows(null);
    setFileName('');
  };

  const onFile = async (file: File) => {
    try {
      const data = await readSpreadsheet(file);
      if (data.length === 0) {
        toast.error('That sheet has no rows');
        return;
      }
      setFileName(file.name);
      /* parsed against a placeholder id; the real one is set on submit */
      setRows(parseRows(data as Record<string, unknown>[], target || 'pending', officers, known, addMissing));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const submit = async () => {
    if (valid.length === 0) return;
    if (newExercise && name.trim().length < 3) {
      toast.error('Give the exercise a name');
      return;
    }
    setBusy(true);
    try {
      const batch = newExercise
        ? await validationsService.createBatch(name, purpose)
        : batches.find((b) => b.id === target)!;

      if (addMissing) {
        const newTypes = [...new Set(valid.map((r) => r.row!.customer_type).filter(Boolean))].filter(
          (v) => !known.customerTypes.has(String(v).toUpperCase()),
        ) as string[];
        const newProviders = [...new Set(valid.map((r) => r.row!.provider).filter(Boolean))].filter(
          (v) => !known.providers.has(String(v).toUpperCase()),
        ) as string[];
        if (newTypes.length) await ensureLookupValues('customer_types', newTypes);
        if (newProviders.length) await ensureLookupValues('providers', newProviders);
      }

      const inserted = await validationsService.createMany(
        valid.map((r) => ({ ...r.row!, batch_id: batch.id })),
      );
      await queryClient.invalidateQueries({ queryKey: qk.validations });
      await queryClient.invalidateQueries({ queryKey: qk.lookups });
      toast.success(`${inserted} customers loaded into ${batch.name}`, {
        description: 'Assign them to officers and they will see the list on their phones.',
      });
      reset();
      setName('');
      setPurpose('');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Load a validation list"
      description="A named exercise — a list of customers to call and a question to answer about them."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={valid.length === 0} onClick={submit}>
            Load {valid.length > 0 ? valid.length : ''} customers
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Exercise" htmlFor="v-batch" hint="Add to one already running, or start a new one">
          <Select
            id="v-batch"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Start a new exercise…"
            options={batchOptions}
          />
        </Field>

        {newExercise && (
          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2 dark:border-slate-700">
            <Field label="Name" htmlFor="v-name" required hint="What you will call this on a report">
              <Input
                id="v-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Inactive customers – November 2026"
              />
            </Field>
            <Field label="Purpose" htmlFor="v-purpose" hint="What the officers are trying to find out">
              <Textarea
                id="v-purpose"
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Confirm whether accounts flagged inactive are really inactive"
              />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="size-4" />}
            onClick={() =>
              downloadTemplate(
                'validation-list-template',
                COLS.map((c) => LABEL[c]),
                [['V-001', 'ADOM ENTERPRISE', 'COMMERCIAL', 'ZOOMLION', 'Osu', '0244000001', '1200', '', 'Greater Accra']],
                [
                  ['CUSTOMER NAME is the only column that must be filled.'],
                  ['OFFICER must match an officer already set up, or the row is skipped.'],
                  ['A customer with no phone number is still loaded — they simply cannot be called.'],
                ],
                'Validation list',
              )
            }
          >
            Download the template
          </Button>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={addMissing} onChange={(e) => setAddMissing(e.target.checked)} />
            Add customer types and providers the sheet introduces
          </label>
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-panel border-2 border-dashed p-6 text-center hover:border-brand-400 dark:border-slate-700">
          <FileSpreadsheet className="size-10 text-brand-600" />
          <span className="text-sm font-medium">{fileName || 'Choose a spreadsheet'}</span>
          <span className="text-xs text-slate-500">.xlsx or .csv — CUSTOMER NAME is the only column that must be filled</span>
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

        {rows && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="green">{valid.length} ready</Badge>
              {warned.length > 0 && <Badge tone="amber">{warned.length} with a warning</Badge>}
              {bad.length > 0 && <Badge tone="red">{bad.length} will be skipped</Badge>}
              <Button variant="ghost" size="sm" onClick={reset}>
                Choose another file
              </Button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border text-xs dark:border-slate-800">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 text-left tracking-wide text-slate-500 uppercase dark:bg-slate-900">
                  <tr>
                    <th className="px-2 py-1.5">Line</th>
                    <th className="px-2 py-1.5">Customer</th>
                    <th className="px-2 py-1.5">Phone</th>
                    <th className="px-2 py-1.5">Region</th>
                    <th className="px-2 py-1.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {rows.slice(0, 60).map((r) => (
                    <tr key={r.line} className={!r.row ? 'bg-rose-50/60 dark:bg-rose-500/5' : undefined}>
                      <td className="px-2 py-1 text-slate-400">{r.line}</td>
                      <td className="px-2 py-1 font-medium">{r.values.customer_name || '—'}</td>
                      <td className="px-2 py-1">{r.values.contact_number || '—'}</td>
                      <td className="px-2 py-1">{r.values.region || '—'}</td>
                      <td className="px-2 py-1">
                        {r.errors.map((e) => (
                          <span key={e} className="flex items-center gap-1 text-rose-700 dark:text-rose-400">
                            <XCircle className="size-3 shrink-0" /> {e}
                          </span>
                        ))}
                        {r.warnings.map((w) => (
                          <span key={w} className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="size-3 shrink-0" /> {w}
                          </span>
                        ))}
                        {r.row && r.errors.length === 0 && r.warnings.length === 0 && (
                          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3 shrink-0" /> ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 60 && (
                <p className="border-t px-2 py-1.5 text-slate-500 dark:border-slate-800">
                  …and {rows.length - 60} more rows. All {valid.length} valid ones will be loaded.
                </p>
              )}
            </div>
          </div>
        )}

        {!rows && (
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <Upload className="mt-0.5 size-3.5 shrink-0" />
            Customers with no phone number are still loaded, so the list stays complete — they simply cannot be called.
          </p>
        )}
      </div>
    </Modal>
  );
}
