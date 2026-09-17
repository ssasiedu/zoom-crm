import { useState } from 'react';
import { toast } from 'sonner';
import { useInvalidateTickets } from '@/hooks/useTickets';
import { ticketsService } from '@/services/tickets';
import type { TicketRow, TicketStatus } from '@/types';
import { Button, Field, Modal, Select, Textarea } from '@/components/ui';

const TRANSITIONS: { value: TicketStatus; label: string; from: TicketStatus[] }[] = [
  { value: 'In-Progress', label: 'In-Progress (from Open)', from: ['Open'] },
  { value: 'Resolved', label: 'Resolved (from In-Progress)', from: ['In-Progress'] },
  { value: 'Closed', label: 'Closed (from Resolved)', from: ['Resolved'] },
  { value: 'Open', label: 'Reopen (from Resolved/Closed)', from: ['Resolved', 'Closed'] },
];

export function BulkStatusDialog({
  open,
  onClose,
  tickets,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tickets: TicketRow[];
  onDone: () => void;
}) {
  const invalidate = useInvalidateTickets();
  const [target, setTarget] = useState<TicketStatus>('In-Progress');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const t = TRANSITIONS.find((x) => x.value === target)!;
  const eligible = tickets.filter((x) => t.from.includes(x.status));
  const needsText = target === 'Resolved' || target === 'Open';

  const run = async () => {
    setBusy(true);
    const extra =
      target === 'Resolved'
        ? { remarks: text.trim(), completion_date: new Date().toISOString() }
        : target === 'Open'
          ? { reopen_reason: text.trim() }
          : {};
    // Resolved tickets keep their own remarks when closing
    const { ok, failed } = await ticketsService.bulkStatus(
      eligible.map((x) => x.id),
      target,
      extra,
    );
    setBusy(false);
    invalidate();
    if (ok) toast.success(`${ok} ticket${ok === 1 ? '' : 's'} updated`);
    if (failed.length) {
      const first = failed[0];
      const num = tickets.find((x) => x.id === first.id)?.ticket_number;
      toast.error(`${failed.length} failed. ${num}: ${first.message}`);
    }
    onDone();
    onClose();
    setText('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Change status of ${tickets.length} tickets`}
      description="Tickets only move one step at a time. Selected tickets not in the right starting status are skipped."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={eligible.length === 0 || (needsText && text.trim().length < 3)} onClick={run}>
            Update {eligible.length}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="New status" htmlFor="bulk-status" hint={`${eligible.length} of ${tickets.length} selected tickets are eligible.`}>
          <Select
            id="bulk-status"
            clearable={false}
            value={target}
            onChange={(e) => setTarget(e.target.value as TicketStatus)}
            options={TRANSITIONS.map((x) => ({ value: x.value, label: x.label }))}
          />
        </Field>
        {needsText && (
          <Field label={target === 'Resolved' ? 'REMARKS (applied to all)' : 'Reason for reopening'} htmlFor="bulk-text" required>
            <Textarea id="bulk-text" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        {target === 'Resolved' && (
          <p className="text-xs text-slate-500">COMPLETION DATE will be set to now. Payment issue tickets must already have payment details.</p>
        )}
      </div>
    </Modal>
  );
}
