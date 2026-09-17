import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { ticketsService, type ListParams } from '@/services/tickets';
import type { TicketRow, TicketUpdate } from '@/types';
import { useAuth } from './useAuth';

export function useTicketList(params: ListParams, scope: 'all' | 'mine' = 'all') {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...(scope === 'mine' ? qk.myTickets : qk.tickets), 'list', params],
    queryFn: () => ticketsService.list(params),
    enabled: Boolean(session),
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string | null | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.ticket(id ?? 'none'),
    queryFn: () => ticketsService.get(id as string),
    enabled: Boolean(session && id),
  });
}

export function useInvalidateTickets() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: qk.tickets });
    queryClient.invalidateQueries({ queryKey: qk.myTickets });
    queryClient.invalidateQueries({ queryKey: qk.dashboard });
    queryClient.invalidateQueries({ queryKey: qk.reports });
    queryClient.invalidateQueries({ queryKey: qk.workload });
    if (id) {
      queryClient.invalidateQueries({ queryKey: qk.ticket(id) });
      queryClient.invalidateQueries({ queryKey: qk.activity(id) });
    }
  };
}

/** Update a single ticket with an optimistic patch of the detail cache */
export function useUpdateTicket(successMessage = 'Ticket updated') {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: TicketUpdate }) => ticketsService.update(id, values),
    onMutate: async ({ id, values }) => {
      await queryClient.cancelQueries({ queryKey: qk.ticket(id) });
      const previous = queryClient.getQueryData<TicketRow>(qk.ticket(id));
      if (previous) queryClient.setQueryData<TicketRow>(qk.ticket(id), { ...previous, ...values } as TicketRow);
      return { previous };
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(qk.ticket(id), ctx.previous);
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      toast.success(successMessage);
    },
    onSettled: (_d, _e, { id }) => invalidate(id),
  });
}

export function useAssignTickets() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: ({ ids, officerId, note }: { ids: string[]; officerId: string | null; note?: string | null }) =>
      ticketsService.assign(ids, officerId, note),
    onSuccess: (count, { officerId, ids }) => {
      toast.success(
        officerId
          ? `${count} ticket${count === 1 ? '' : 's'} assigned`
          : `${count} ticket${count === 1 ? '' : 's'} unassigned`,
      );
      ids.forEach((id) => invalidate(id));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
