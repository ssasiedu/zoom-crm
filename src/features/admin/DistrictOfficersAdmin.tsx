import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, MapPin, Plus, Upload, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useLookups } from '@/hooks/useLookups';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { lookupsService } from '@/services/lookups';
import { officersService, type OfficerInput } from '@/services/officers';
import type { Officer, RegionDistrictRow } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  type SelectOption,
  Switch,
  TableSkeleton,
  Textarea,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatPhone, isValidGhanaPhone, toLocalPhone } from '@/utils/phone';

/* ------------------------------------------------------------------ */
/* Adding one officer                                                  */
/* ------------------------------------------------------------------ */
function OfficerDialog({
  open,
  onClose,
  kind,
  officer,
  presetRegion,
  presetDistrict,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'district_officer' | 'regional_manager';
  officer?: Officer | null;
  presetRegion?: string | null;
  presetDistrict?: string | null;
}) {
  const queryClient = useQueryClient();
  const { active } = useLookups();
  const [name, setName] = useState(officer?.full_name ?? '');
  const [phone, setPhone] = useState(officer?.phone ?? '');
  const [email, setEmail] = useState(officer?.email ?? '');
  const [region, setRegion] = useState(officer?.region ?? presetRegion ?? '');
  const [district, setDistrict] = useState(officer?.district ?? presetDistrict ?? '');
  const [manager, setManager] = useState(officer?.manager_officer_id ?? '');
  const [isActive, setIsActive] = useState(officer?.is_active ?? true);

  const managers = useQuery({
    queryKey: [...qk.officers, 'managers'],
    queryFn: () => officersService.listByKind('regional_manager'),
    enabled: open && kind === 'district_officer',
  });

  /* A district officer's region follows their district, so show it rather than ask. */
  const impliedRegion = district ? active.districts.find((d) => d.name === district)?.region ?? '' : '';

  const regionOptions = useMemo<SelectOption[]>(
    () => active.regions.map((r) => ({ value: r.name, label: r.name })),
    [active.regions],
  );
  const districtOptions = useMemo<SelectOption[]>(
    () =>
      active.districts
        .filter((d) => !region || d.region === region)
        .map((d) => ({ value: d.name, label: region ? d.name : `${d.name} — ${d.region}` })),
    [active.districts, region],
  );
  const managerOptions = useMemo<SelectOption[]>(
    () =>
      (managers.data ?? [])
        .filter((m) => !impliedRegion || m.region === impliedRegion)
        .map((m) => ({ value: m.id, label: `${m.full_name} — ${m.region ?? 'no region'}` })),
    [managers.data, impliedRegion],
  );

  const save = useMutation({
    mutationFn: async () => {
      const values: OfficerInput = {
        full_name: name,
        phone: phone.trim() ? toLocalPhone(phone) : null,
        email: email.trim() || null,
        is_active: isActive,
        kind,
        region: kind === 'regional_manager' ? region || null : null,
        district: kind === 'district_officer' ? district || null : null,
        manager_officer_id: kind === 'district_officer' ? manager || null : null,
      };
      return officer ? officersService.update(officer.id, values) : officersService.create(values);
    },
    onSuccess: () => {
      toast.success(officer ? 'Officer updated' : 'Officer added');
      queryClient.invalidateQueries({ queryKey: qk.officers });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const phoneBad = phone.trim() !== '' && !isValidGhanaPhone(phone);
  const ready =
    name.trim().length > 1 &&
    !phoneBad &&
    (kind === 'regional_manager' ? Boolean(region) : Boolean(district));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        officer
          ? `Edit ${officer.full_name}`
          : kind === 'regional_manager'
            ? 'Add a regional manager'
            : 'Add a District Operation Officer'
      }
      description={
        kind === 'regional_manager'
          ? 'A regional manager is alerted whenever a ticket is forwarded inside their region.'
          : 'The district decides the region. Their phone number is what the forwarding SMS goes to.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>
            {officer ? 'Save' : 'Add officer'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="o-name" className="sm:col-span-2">
          <Input id="o-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="KWAME ASANTE" />
        </Field>
        <Field
          label="Phone"
          htmlFor="o-phone"
          error={phoneBad ? 'Use 0XXXXXXXXX or +233XXXXXXXXX' : undefined}
          hint="Used for their login and for SMS alerts"
        >
          <Input id="o-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0241234567" invalid={phoneBad} />
        </Field>
        <Field label="Email (optional)" htmlFor="o-email" hint="With a real email they can reset their own password">
          <Input id="o-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        {kind === 'regional_manager' ? (
          <Field label="Region" htmlFor="o-region" className="sm:col-span-2">
            <Select
              id="o-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Choose a region…"
              options={regionOptions}
            />
          </Field>
        ) : (
          <>
            <Field label="Narrow by region" htmlFor="o-region-filter" hint="Only to shorten the district list">
              <Select
                id="o-region-filter"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setDistrict('');
                }}
                placeholder="All regions"
                options={regionOptions}
              />
            </Field>
            <Field label="District" htmlFor="o-district" hint={impliedRegion ? `Region: ${impliedRegion}` : undefined}>
              <Select
                id="o-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder={districtOptions.length === 0 ? 'No districts set up yet' : 'Choose a district…'}
                options={districtOptions}
              />
            </Field>
            <Field label="Regional manager" htmlFor="o-manager" className="sm:col-span-2" hint="Who is alerted alongside them">
              <Select
                id="o-manager"
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                placeholder="No manager yet"
                options={managerOptions}
              />
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          <Switch checked={isActive} onChange={setIsActive} label="Active" />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Loading a whole region at once                                      */
/* ------------------------------------------------------------------ */
interface ParsedRow {
  full_name: string;
  phone: string | null;
  district: string;
  email: string | null;
  problem?: string;
}

/**
 * One officer per line: name, phone, district, email.
 *
 * Anything a spreadsheet produces when you copy four columns works —
 * tabs, commas or semicolons — so the team can paste straight out of
 * Excel instead of being made to save a file first.
 */
function parseOfficerLines(text: string, districts: string[]): ParsedRow[] {
  const known = new Map(districts.map((d) => [d.toUpperCase(), d]));
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|;|,/).map((p) => p.trim());
      const [name = '', phone = '', district = '', email = ''] = parts;
      const canonical = known.get(district.toUpperCase()) ?? '';
      const row: ParsedRow = {
        full_name: name.toUpperCase(),
        phone: phone ? toLocalPhone(phone) : null,
        district: canonical || district,
        email: email || null,
      };
      if (!name) row.problem = 'No name';
      else if (!district) row.problem = 'No district';
      else if (!canonical) row.problem = `Unknown district "${district}"`;
      else if (phone && !isValidGhanaPhone(phone)) row.problem = `Bad phone "${phone}"`;
      return row;
    })
    .filter((r) => r.full_name || r.district);
}

function BulkLoadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { active } = useLookups();
  const [text, setText] = useState('');
  const [manager, setManager] = useState('');
  const [busy, setBusy] = useState(false);

  const managers = useQuery({
    queryKey: [...qk.officers, 'managers'],
    queryFn: () => officersService.listByKind('regional_manager'),
    enabled: open,
  });

  const rows = useMemo(
    () => parseOfficerLines(text, active.districts.map((d) => d.name)),
    [text, active.districts],
  );
  const good = rows.filter((r) => !r.problem);
  const bad = rows.filter((r) => r.problem);
  const managerOptions = useMemo<SelectOption[]>(
    () => (managers.data ?? []).map((m) => ({ value: m.id, label: `${m.full_name} — ${m.region ?? 'no region'}` })),
    [managers.data],
  );

  const run = async () => {
    setBusy(true);
    try {
      const { created, errors } = await officersService.bulkCreate(
        good.map<OfficerInput>((r) => ({
          full_name: r.full_name,
          phone: r.phone,
          email: r.email,
          is_active: true,
          kind: 'district_officer',
          region: null,
          district: r.district,
          manager_officer_id: manager || null,
        })),
      );
      if (created > 0) toast.success(`${created} District Operation Officer${created === 1 ? '' : 's'} loaded`);
      if (errors.length > 0) {
        toast.error(`${errors.length} could not be loaded`, { description: `${errors[0].name}: ${errors[0].message}` });
      }
      await queryClient.invalidateQueries({ queryKey: qk.officers });
      if (errors.length === 0) {
        setText('');
        onClose();
      }
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
      title="Load District Operation Officers"
      description="Paste one officer per line: name, phone, district, email. Copying four columns out of Excel works as it is."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={good.length === 0} onClick={run}>
            Load {good.length > 0 ? good.length : ''} officer{good.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <Field label="Regional manager for everyone in this batch" htmlFor="bulk-manager" hint="You can change individuals afterwards">
        <Select
          id="bulk-manager"
          value={manager}
          onChange={(e) => setManager(e.target.value)}
          placeholder="No manager yet"
          options={managerOptions}
        />
      </Field>
      <Field label="Officers" htmlFor="bulk-text" className="mt-4">
        <Textarea
          id="bulk-text"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'KWAME ASANTE\t0241234567\tKorle-Klottey\tkwame@example.com\nADWOA BOATENG\t0209876543\tAblekuma North'}
          className="font-mono text-xs"
        />
      </Field>

      {rows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase dark:bg-slate-900/60">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">District</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {rows.slice(0, 40).map((r, i) => (
                <tr key={i} className={r.problem ? 'bg-rose-50/60 dark:bg-rose-500/5' : undefined}>
                  <td className="px-3 py-1.5 font-medium">{r.full_name || '—'}</td>
                  <td className="px-3 py-1.5">{r.phone ? formatPhone(r.phone) : '—'}</td>
                  <td className="px-3 py-1.5">{r.district || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-500">{r.email ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    {r.problem ? <Badge tone="red">{r.problem}</Badge> : <Badge tone="green">Ready</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 40 && (
            <p className="border-t px-3 py-2 text-xs text-slate-500 dark:border-slate-800">
              …and {rows.length - 40} more. All {good.length} valid rows will be loaded.
            </p>
          )}
        </div>
      )}
      {bad.length > 0 && (
        <p className="mt-3 text-xs text-rose-700 dark:text-rose-400">
          {bad.length} line{bad.length === 1 ? '' : 's'} will be skipped. Districts must match the list under Dropdown
          values — add the district first if it is missing.
        </p>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Districts of a region                                               */
/* ------------------------------------------------------------------ */
function AddDistrictDialog({ open, onClose, region }: { open: boolean; onClose: () => void; region: string }) {
  const queryClient = useQueryClient();
  const [names, setNames] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const list = [...new Set(names.split(/\r?\n|,/).map((n) => n.trim()).filter(Boolean))];
    if (list.length === 0) return;
    setBusy(true);
    let added = 0;
    const failed: string[] = [];
    for (const name of list) {
      try {
        await lookupsService.create('districts', { name, region, sort_order: 0, is_active: true });
        added += 1;
      } catch {
        failed.push(name);
      }
    }
    await queryClient.invalidateQueries({ queryKey: qk.lookups });
    if (added > 0) toast.success(`${added} district${added === 1 ? '' : 's'} added to ${region}`);
    if (failed.length > 0) toast.error(`Already there, or not allowed: ${failed.join(', ')}`);
    setBusy(false);
    if (failed.length === 0) {
      setNames('');
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add districts to ${region}`}
      description="One per line. District names are unique across the whole country."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!names.trim()} onClick={run}>
            Add
          </Button>
        </>
      }
    >
      <Field label="District names" htmlFor="d-names">
        <Textarea id="d-names" rows={5} value={names} onChange={(e) => setNames(e.target.value)} />
      </Field>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* The region → districts → officers tree                              */
/* ------------------------------------------------------------------ */
function RegionBlock({
  row,
  onAddOfficer,
  onAddDistricts,
  onEdit,
}: {
  row: RegionDistrictRow;
  onAddOfficer: (district: string) => void;
  onAddDistricts: (region: string) => void;
  onEdit: (id: string) => void;
}) {
  const officerCount = row.districts.reduce((n, d) => n + d.officers.length, 0);
  const covered = row.districts.filter((d) => d.officers.length > 0).length;
  const [open, setOpen] = useState(officerCount > 0);
  const [showEmpty, setShowEmpty] = useState(false);
  const districts = showEmpty ? row.districts : row.districts.filter((d) => d.officers.length > 0);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-slate-400" /> : <ChevronRight className="size-4 shrink-0 text-slate-400" />}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900 dark:text-white">{row.region}</span>
          <span className="block text-xs text-slate-500">
            {row.managers.length > 0
              ? `Manager: ${row.managers.map((m) => m.full_name).join(', ')}`
              : 'No regional manager yet — forwarded tickets will alert nobody above the officer'}
          </span>
        </span>
        <Badge tone={officerCount > 0 ? 'green' : 'gray'}>{officerCount} officers</Badge>
        <Badge tone="gray">
          {covered}/{row.districts.length} districts
        </Badge>
      </button>

      {open && (
        <div className="border-t dark:border-slate-800">
          <div className="flex flex-wrap gap-2 px-4 py-2.5 sm:px-5">
            <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => onAddOfficer('')}>
              Add officer
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<MapPin className="size-4" />} onClick={() => onAddDistricts(row.region)}>
              Add districts
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowEmpty((v) => !v)}>
              {showEmpty ? 'Hide districts with no officer' : `Show all ${row.districts.length} districts`}
            </Button>
          </div>

          {districts.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-slate-500 sm:px-5">
              No officers loaded for this region yet.
            </p>
          ) : (
            <ul className="divide-y dark:divide-slate-800">
              {districts.map((d) => (
                <li key={d.district} className="px-4 py-2.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('text-sm font-medium', !d.is_active && 'text-slate-400 line-through')}>
                      {d.district}
                    </span>
                    {d.officers.length === 0 && <span className="text-xs text-amber-700 dark:text-amber-400">no officer</span>}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      leftIcon={<Plus className="size-3.5" />}
                      onClick={() => onAddOfficer(d.district)}
                    >
                      Officer
                    </Button>
                  </div>
                  {d.officers.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {d.officers.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <button
                            type="button"
                            onClick={() => onEdit(o.id)}
                            className="font-medium text-brand-700 hover:underline dark:text-brand-400"
                          >
                            {o.full_name}
                          </button>
                          <span className="text-xs text-slate-500">
                            {o.phone ? formatPhone(o.phone) : 'no phone'}
                            {o.manager_name ? ` · ${o.manager_name}` : ''}
                          </span>
                          {!o.is_active && <Badge tone="gray">Inactive</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export function DistrictOfficersAdmin() {
  const [dialog, setDialog] = useState<
    | { kind: 'district_officer' | 'regional_manager'; district?: string; region?: string; id?: string }
    | null
  >(null);
  const [bulk, setBulk] = useState(false);
  const [districtsFor, setDistrictsFor] = useState<string | null>(null);

  const tree = useQuery({ queryKey: [...qk.officers, 'tree'], queryFn: officersService.regionTree });
  const all = useQuery({ queryKey: qk.officers, queryFn: officersService.list });
  const editing = dialog?.id ? (all.data ?? []).find((o) => o.id === dialog.id) ?? null : null;

  const totals = useMemo(() => {
    const rows = tree.data ?? [];
    return {
      officers: rows.reduce((n, r) => n + r.districts.reduce((m, d) => m + d.officers.length, 0), 0),
      managers: rows.reduce((n, r) => n + r.managers.length, 0),
      regionsWithoutManager: rows.filter((r) => r.managers.length === 0).length,
    };
  }, [tree.data]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="District officers"
          description="The field layer. A ticket is forwarded to the District Operation Officer for its district; their regional manager is alerted at the same time."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                leftIcon={<UserCog className="size-4" />}
                onClick={() => setDialog({ kind: 'regional_manager' })}
              >
                Add regional manager
              </Button>
              <Button variant="secondary" leftIcon={<Upload className="size-4" />} onClick={() => setBulk(true)}>
                Load a list
              </Button>
              <Button leftIcon={<Plus className="size-4" />} onClick={() => setDialog({ kind: 'district_officer' })}>
                Add officer
              </Button>
            </div>
          }
        />
        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <div className="rounded-lg border p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500">District Operation Officers</p>
            <p className="text-xl font-bold tabular-nums">{totals.officers}</p>
          </div>
          <div className="rounded-lg border p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500">Regional managers</p>
            <p className="text-xl font-bold tabular-nums">{totals.managers}</p>
          </div>
          <div className="rounded-lg border p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500">Regions with no manager</p>
            <p className={cn('text-xl font-bold tabular-nums', totals.regionsWithoutManager > 0 && 'text-amber-600')}>
              {totals.regionsWithoutManager}
            </p>
          </div>
        </div>
        <p className="border-t px-4 py-3 text-xs text-slate-500 sm:px-5 dark:border-slate-800">
          Officers added here can be given a login under Users: pick the <strong>District Operation Officer</strong> role
          and link them to this officer record. Give them a real email address if you want them to be able to reset their
          own password — a login built from a phone number can only be reset by an administrator.
        </p>
      </Card>

      {tree.isLoading ? (
        <Card>
          <TableSkeleton rows={6} cols={3} />
        </Card>
      ) : tree.error ? (
        <Card>
          <ErrorState message={errorMessage(tree.error)} onRetry={() => tree.refetch()} />
        </Card>
      ) : (tree.data ?? []).length === 0 ? (
        <Card>
          <EmptyState icon={<Users />} title="No regions set up" description="Add regions under Dropdown values first." />
        </Card>
      ) : (
        <div className="space-y-3">
          {(tree.data ?? []).map((row) => (
            <RegionBlock
              key={row.region}
              row={row}
              onAddOfficer={(district) =>
                setDialog({ kind: 'district_officer', district: district || undefined, region: row.region })
              }
              onAddDistricts={(region) => setDistrictsFor(region)}
              onEdit={(id) => setDialog({ kind: 'district_officer', id })}
            />
          ))}
        </div>
      )}

      {dialog && (
        <OfficerDialog
          open
          onClose={() => setDialog(null)}
          kind={dialog.kind}
          officer={editing}
          presetRegion={dialog.region}
          presetDistrict={dialog.district}
        />
      )}
      <BulkLoadDialog open={bulk} onClose={() => setBulk(false)} />
      {districtsFor && <AddDistrictDialog open onClose={() => setDistrictsFor(null)} region={districtsFor} />}
    </div>
  );
}
