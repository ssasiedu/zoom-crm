import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useLookups } from '@/hooks/useLookups';
import { useUpdateTicket } from '@/hooks/useTickets';
import type { TicketRow } from '@/types';
import { Button, Drawer } from '@/components/ui';
import { TicketForm } from './TicketForm';
import { buildTicketSchema, formToUpdate, ticketToForm, type TicketFormValues } from './ticketSchema';

export function EditTicketDrawer({ ticket, open, onClose }: { ticket: TicketRow; open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const { lookups } = useLookups();
  const schema = useMemo(() => buildTicketSchema(lookups), [lookups]);
  const update = useUpdateTicket('Ticket details saved');
  const form = useForm<TicketFormValues>({ resolver: zodResolver(schema), defaultValues: ticketToForm(ticket) });
  const isAdmin = can('tickets:editDateOpened');

  useEffect(() => {
    if (open) form.reset(ticketToForm(ticket));
  }, [open, ticket, form]);

  const onSubmit = form.handleSubmit(
    (values) => {
      const patch = formToUpdate(values, ticket, { isAdmin, lookups });
      if (Object.keys(patch).length === 0) {
        toast.info('No changes to save');
        onClose();
        return;
      }
      update.mutate({ id: ticket.id, values: patch }, { onSuccess: onClose });
    },
    () => toast.error('Please fix the highlighted fields'),
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      title={`Edit ${ticket.ticket_number}`}
      subtitle="Changes are recorded in the ticket history."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={update.isPending} onClick={onSubmit}>
            Save changes
          </Button>
        </div>
      }
    >
      <form className="p-4 sm:p-5" onSubmit={onSubmit} noValidate>
        <TicketForm
          form={form}
          mode="edit"
          ticketId={ticket.id}
          isAdmin={isAdmin}
          canEditDueDate={can('tickets:editCore')}
          canAssign={false}
        />
      </form>
    </Drawer>
  );
}
