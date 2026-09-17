import { useEffect, useState } from 'react';
import { useAssignTickets } from '@/hooks/useTickets';
import { Button, Field, Modal, Textarea } from '@/components/ui';
import { OfficerPicker } from './OfficerPicker';

export function AssignDialog({
  open,
  onClose,
  ticketIds,
  currentOfficerId,
  region,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ticketIds: string[];
  currentOfficerId?: string | null;
  region?: string | null;
  onDone?: () => void;
}) {
  const [officer, setOfficer] = useState(currentOfficerId ?? '');
  const [note, setNote] = useState('');
  const assign = useAssignTickets();
  const multi = ticketIds.length > 1;

  useEffect(() => {
    if (open) {
      setOfficer(currentOfficerId ?? '');
      setNote('');
    }
  }, [open, currentOfficerId]);

  const unchanged = !multi && officer === (currentOfficerId ?? '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={multi ? `Assign ${ticketIds.length} tickets` : currentOfficerId ? 'Reassign ticket' : 'Assign ticket'}
      description="Officers are notified instantly. Workload counts show active tickets only."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={assign.isPending}
            disabled={unchanged}
            onClick={() =>
              assign.mutate(
                { ids: ticketIds, officerId: officer || null, note },
                {
                  onSuccess: () => {
                    onDone?.();
                    onClose();
                  },
                },
              )
            }
          >
            {officer ? 'Assign' : 'Unassign'}
          </Button>
        </>
      }
    >
      <OfficerPicker value={officer} onChange={setOfficer} region={region} />
      <Field label="Assignment note (optional)" htmlFor="assign-note" className="mt-4" hint="Visible in the ticket history.">
        <Textarea
          id="assign-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Client prefers a call after 2pm"
        />
      </Field>
    </Modal>
  );
}
