import { QueryClient } from '@tanstack/react-query';
import { AppError } from '@/services/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof AppError && (error.code === '42501' || error.code === 'PGRST116')) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/** Query key roots, used for realtime invalidation */
export const qk = {
  tickets: ['tickets'] as const,
  ticket: (id: string) => ['ticket', id] as const,
  myTickets: ['my-tickets'] as const,
  dashboard: ['dashboard'] as const,
  reports: ['reports'] as const,
  lookups: ['lookups'] as const,
  officers: ['officers'] as const,
  workload: ['workload'] as const,
  notifications: ['notifications'] as const,
  activity: (id: string) => ['ticket-activity', id] as const,
  comments: (id: string) => ['ticket-comments', id] as const,
  attachments: (id: string) => ['ticket-attachments', id] as const,
  profiles: ['profiles'] as const,
  audit: ['audit'] as const,
  savedViews: ['saved-views'] as const,
};
