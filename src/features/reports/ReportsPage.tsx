import { useState } from 'react';
import { BarChart3, CalendarRange, ChevronDown, Clock, Download, FileSpreadsheet, FileText, MapPin, Tags, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Menu, PageHeader } from '@/components/ui';
import { errorMessage } from '@/services/errors';
import { cn } from '@/utils/cn';
import { rangeLabel } from '@/utils/dateRange';
import { exportToExcel, exportToPdf } from '@/utils/export';
import { MonthlyReport } from './MonthlyReport';
import { toPdfSheets } from './pdfSheets';
import { ReportFiltersBar } from './ReportFiltersBar';
import { REPORTS } from './reports';
import { useReportFilters } from './useReportFilters';

const ICONS: Record<string, typeof BarChart3> = {
  'status-region': MapPin,
  'issue-region': Tags,
  'payments-region': Wallet,
  'officer-performance': Users,
  'sla-aging': Clock,
  monthly: CalendarRange,
};

const TABS = [...REPORTS.map((r) => ({ key: r.key, title: r.title, description: r.description })), { key: 'monthly', title: 'Monthly report', description: 'Printable one-month summary (PDF)' }];

export default function ReportsPage() {
  const rf = useReportFilters('month');
  const active = rf.params.get('report') ?? TABS[0].key;
  const report = REPORTS.find((r) => r.key === active);
  const [busy, setBusy] = useState(false);

  const doExport = async (kind: 'xlsx' | 'pdf') => {
    if (!report) return;
    setBusy(true);
    try {
      const sheets = await report.load(rf.filters);
      const subtitle = [rangeLabel(rf.range), rf.filters.region, rf.filters.issueType, rf.filters.contactType].filter(Boolean).join(' · ');
      const opts = { filename: report.key, title: `DM CRM — ${report.title}`, subtitle, sheets };
      if (kind === 'xlsx') exportToExcel(opts);
      else exportToPdf({ ...opts, sheets: toPdfSheets(sheets) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description={report ? `${report.title} · ${rangeLabel(rf.range)}` : 'Monthly summary'}
        actions={
          report && (
            <Menu
              label="Export report"
              trigger={({ toggle, ref, open }) => (
                <Button ref={ref} variant="secondary" loading={busy} onClick={toggle} aria-expanded={open} leftIcon={<Download className="size-4" />} rightIcon={<ChevronDown className="size-3.5" />}>
                  Export
                </Button>
              )}
              items={[
                { label: 'Excel (.xlsx)', icon: <FileSpreadsheet />, onSelect: () => doExport('xlsx') },
                { label: 'PDF', icon: <FileText />, onSelect: () => doExport('pdf') },
              ]}
            />
          )
        }
      />

      <nav aria-label="Reports" className="no-print mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {TABS.map((t) => {
          const Icon = ICONS[t.key] ?? BarChart3;
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => rf.set({ report: t.key })}
              className={cn(
                'flex items-start gap-3 rounded-panel border p-3 text-left transition',
                selected
                  ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/15 dark:bg-brand-500/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900',
              )}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-brand-700 dark:text-brand-300' : 'text-slate-400')} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="block text-xs text-slate-500">{t.description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <ReportFiltersBar state={rf} />

      {report ? <report.Component filters={rf.filters} ticketParams={rf.ticketParams} /> : <MonthlyReport baseFilters={rf.filters} />}
    </>
  );
}
