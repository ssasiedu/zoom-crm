import { useSearchParams } from 'react-router';
import { PageHeader, Tabs } from '@/components/ui';
import { AuditLog } from './AuditLog';
import { LookupsAdmin } from './LookupsAdmin';
import { OfficersAdmin } from './OfficersAdmin';
import { SlaAdmin } from './SlaAdmin';
import { UsersAdmin } from './UsersAdmin';

type Tab = 'users' | 'officers' | 'lookups' | 'sla' | 'audit';
const TABS: { value: Tab; label: string }[] = [
  { value: 'users', label: 'Users' },
  { value: 'officers', label: 'Officers' },
  { value: 'lookups', label: 'Dropdown values' },
  { value: 'sla', label: 'SLA settings' },
  { value: 'audit', label: 'Audit log' },
];

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'users') as Tab;
  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="Manage users, officers, dropdown values, SLAs and review the audit trail." />
      <Tabs className="mb-5" items={TABS} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} ariaLabel="Administration sections" />
      {tab === 'users' && <UsersAdmin />}
      {tab === 'officers' && <OfficersAdmin />}
      {tab === 'lookups' && <LookupsAdmin />}
      {tab === 'sla' && <SlaAdmin />}
      {tab === 'audit' && <AuditLog />}
    </>
  );
}
