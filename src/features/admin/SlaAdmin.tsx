import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { useLookups } from '@/hooks/useLookups';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { lookupsService } from '@/services/lookups';
import { Badge, Button, Card, CardHeader, Checkbox, Input, TableSkeleton } from '@/components/ui';

interface Row {
  id: number;
  name: string;
  sla_days: string;
  requires_payment: boolean;
  is_active: boolean;
}

export function SlaAdmin() {
  const queryClient = useQueryClient();
  const { lookups, isLoading } = useLookups();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    setRows(
      lookups.issue_types.map((i) => ({
        id: i.id,
        name: i.name,
        sla_days: String(i.sla_days),
        requires_payment: i.requires_payment,
        is_active: i.is_active,
      })),
    );
  }, [lookups.issue_types]);

  const dirty = rows.filter((r) => {
    const orig = lookups.issue_types.find((i) => i.id === r.id);
    return orig && (String(orig.sla_days) !== r.sla_days || orig.requires_payment !== r.requires_payment);
  });
  const invalid = rows.some((r) => !/^\d+$/.test(r.sla_days) || Number(r.sla_days) > 365);

  const save = useMutation({
    mutationFn: () =>
      Promise.all(
        dirty.map((r) =>
          lookupsService.update('issue_types', r.id, { sla_days: Number(r.sla_days), requires_payment: r.requires_payment }),
        ),
      ),
    onSuccess: () => {
      toast.success('SLA settings saved. New tickets use the new values.');
      queryClient.invalidateQueries({ queryKey: qk.lookups });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader
        icon={<Timer />}
        title="SLA settings"
        description="DUE DATE = DATE OPENED + SLA days. Changes apply to new tickets and to tickets whose issue type is changed; existing due dates are kept."
        actions={
          <Button leftIcon={<Save className="size-4" />} disabled={!dirty.length || invalid} loading={save.isPending} onClick={() => save.mutate()}>
            Save {dirty.length ? `(${dirty.length})` : ''}
          </Button>
        }
      />
      {isLoading ? (
        <TableSkeleton rows={7} cols={3} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase dark:bg-slate-900">
              <tr>
                <th className="px-4 py-2.5">ISSUE TYPE</th>
                <th className="px-4 py-2.5">SLA (days)</th>
                <th className="px-4 py-2.5">Payment details required</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {rows.map((r, idx) => {
                const bad = !/^\d+$/.test(r.sla_days) || Number(r.sla_days) > 365;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">
                      {r.name} {!r.is_active && <Badge>inactive</Badge>}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        aria-label={`SLA days for ${r.name}`}
                        inputMode="numeric"
                        value={r.sla_days}
                        invalid={bad}
                        onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, sla_days: e.target.value } : x)))}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        label={r.requires_payment ? 'Required' : 'Optional'}
                        checked={r.requires_payment}
                        onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, requires_payment: e.target.checked } : x)))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
