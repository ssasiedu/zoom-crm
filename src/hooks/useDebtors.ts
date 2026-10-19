import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk } from '@/lib/queryClient';
import { debtorsService } from '@/services/debtors';
import { errorMessage } from '@/services/errors';
import type { DebtorCallInsert, DebtorCallUpdate, DebtorFilters, DebtorUpdate, SortSpec } from '@/types';
import { useAuth } from './useAuth';

export function useDebtorPeriods() {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.debtorPeriods,
    queryFn: debtorsService.periods,
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}

export function useDebtorList(
  params: { filters?: DebtorFilters; page?: number; pageSize?: number; sort?: SortSpec[]; officerId?: string | null },
  scope: 'all' | 'mine' = 'all',
) {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...(scope === 'mine' ? qk.myDebtors : qk.debtors), 'list', params],
    queryFn: () => debtorsService.list(params),
    enabled: Boolean(session),
    placeholderData: keepPreviousData,
  });
}

export function useDebtorSummary(filters: DebtorFilters) {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...qk.debtorReports, 'summary', filters],
    queryFn: () => debtorsService.summary(filters),
    enabled: Boolean(session),
  });
}

export function useMyDebtorSummary(periodId?: string | null, officerId?: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...qk.myDebtors, 'summary', periodId ?? 'all', officerId ?? 'me'],
    queryFn: () => debtorsService.officerSummary(periodId, officerId),
    enabled: Boolean(session && officerId),
  });
}

export function useInvalidateDebtors() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: qk.debtors });
    queryClient.invalidateQueries({ queryKey: qk.myDebtors });
    queryClient.invalidateQueries({ queryKey: qk.debtorReports });
    queryClient.invalidateQueries({ queryKey: qk.debtorPeriods });
  };
}

export function useUpdateDebtor(successMessage = 'Call result saved') {
  const invalidate = useInvalidateDebtors();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: DebtorUpdate }) => debtorsService.update(id, values),
    onSuccess: () => {
      toast.success(successMessage);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useAssignDebtors() {
  const invalidate = useInvalidateDebtors();
  return useMutation({
    mutationFn: ({ ids, officerId }: { ids: string[]; officerId: string | null }) =>
      debtorsService.assign(ids, officerId),
    onSuccess: (count, { officerId }) => {
      toast.success(
        officerId ? `${count} record${count === 1 ? '' : 's'} assigned` : `${count} record${count === 1 ? '' : 's'} unassigned`,
      );
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/* ---------- Call history ---------- */

export function useDebtorCalls(debtorId: string | null | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: qk.debtorCalls(debtorId ?? 'none'),
    queryFn: () => debtorsService.calls(debtorId as string),
    enabled: Boolean(session && debtorId),
  });
}

/** Adding, correcting or removing a call also moves the debtor's totals */
function useCallMutation<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
  debtorId: string,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateDebtors();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(successMessage);
      queryClient.invalidateQueries({ queryKey: qk.debtorCalls(debtorId) });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      queryClient.invalidateQueries({ queryKey: qk.reports });
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useAddDebtorCall(debtorId: string) {
  return useCallMutation<DebtorCallInsert>((input) => debtorsService.addCall(input), debtorId, 'Call recorded');
}

export function useUpdateDebtorCall(debtorId: string) {
  return useCallMutation<{ id: string; values: DebtorCallUpdate }>(
    ({ id, values }) => debtorsService.updateCall(id, values),
    debtorId,
    'Call updated',
  );
}

export function useRemoveDebtorCall(debtorId: string) {
  return useCallMutation<string>((id) => debtorsService.removeCall(id), debtorId, 'Call removed');
}
