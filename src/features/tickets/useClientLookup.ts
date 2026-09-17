import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { ticketsService } from '@/services/tickets';
import { isValidGhanaPhone } from '@/utils/phone';

export function useClientLookup(clientId: string, phone: string, enabled = true) {
  const id = useDebounce(clientId.trim(), 400);
  const ph = useDebounce(phone.trim(), 400);
  const usablePhone = isValidGhanaPhone(ph) ? ph : '';
  return useQuery({
    queryKey: ['client-lookup', id, usablePhone],
    queryFn: () => ticketsService.clientLookup(id, usablePhone),
    enabled: enabled && (id.length >= 2 || usablePhone.length > 0),
    staleTime: 30_000,
  });
}

export function useCommunitySuggestions(query: string, region: string) {
  const q = useDebounce(query.trim(), 250);
  return useQuery({
    queryKey: ['communities', q, region],
    queryFn: () => ticketsService.communitySuggestions(q, region || null),
    staleTime: 60_000,
  });
}
