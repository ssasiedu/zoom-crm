import { RotateCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toOptions, useLookups, useOfficers } from '@/hooks/useLookups';
import { Button, DateRangePicker, Select } from '@/components/ui';
import type { useReportFilters } from './useReportFilters';

export function ReportFiltersBar({ state, children }: { state: ReturnType<typeof useReportFilters>; children?: React.ReactNode }) {
  const { params, set, range, setRange, reset, activeCount } = state;
  const { lookups } = useLookups();
  const { data: officers = [] } = useOfficers();
  const { role } = useAuth();
  const bind = (key: string) => ({
    value: params.get(key) ?? '',
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => set({ [key]: e.target.value || null }),
  });

  return (
    <div className="no-print mb-5 flex flex-wrap items-center gap-2 rounded-panel border bg-white p-3 shadow-xs dark:bg-slate-900">
      <DateRangePicker value={range} onChange={setRange} id="report-range" />
      <Select aria-label="Region" className="w-full sm:w-44" placeholder="All regions" options={toOptions(lookups.regions)} {...bind('region')} />
      {role !== 'dm_officer' && (
        <Select
          aria-label="Officer"
          className="w-full sm:w-48"
          placeholder="All officers"
          options={officers.map((o) => ({ value: o.id, label: o.full_name }))}
          {...bind('officer')}
        />
      )}
      <Select aria-label="Issue type" className="w-full sm:w-48" placeholder="All issue types" options={toOptions(lookups.issue_types)} {...bind('issue_type')} />
      <Select aria-label="Type of contact" className="w-full sm:w-44" placeholder="All channels" options={toOptions(lookups.contact_types)} {...bind('contact_type')} />
      {(activeCount > 0 || params.get('range')) && (
        <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="size-4" />} onClick={reset}>
          Reset
        </Button>
      )}
      {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
