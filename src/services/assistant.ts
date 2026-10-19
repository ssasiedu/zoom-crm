import { supabase } from '@/lib/supabase';
import type { AiSuggestion, IssuePlaybook, SimilarTicket, TicketRow } from '@/types';
import { toNumber } from '@/utils/format';
import { toAppError, unwrap } from './errors';

/**
 * The resolution assistant has two layers:
 *   1. history — similar resolved tickets and what actually fixed them,
 *      straight from the database (always available)
 *   2. ai      — a written suggestion from the ai-assist edge function
 *      (only when an admin has configured a key)
 */
export const assistantService = {
  async similar(ticket: TicketRow, limit = 8): Promise<SimilarTicket[]> {
    const rows = (unwrap(
      await supabase.rpc('similar_tickets', {
        p_issue_type: ticket.issue_type,
        p_description: ticket.description,
        p_community: ticket.community,
        p_region: ticket.region,
        p_exclude: ticket.id,
        p_limit: limit,
      }),
    ) ?? []) as SimilarTicket[];
    return rows.map((r) => ({
      ...r,
      resolution_minutes: r.resolution_minutes === null ? null : toNumber(r.resolution_minutes),
      score: toNumber(r.score),
    }));
  },

  async playbook(issueType: string, region?: string | null): Promise<IssuePlaybook> {
    const d = (unwrap(
      await supabase.rpc('issue_playbook', { p_issue_type: issueType, p_region: region || null }),
    ) ?? {}) as Record<string, unknown>;
    const items = (v: unknown) =>
      ((v ?? []) as { label: string; count: unknown }[]).map((x) => ({ label: x.label, count: toNumber(x.count) }));
    return {
      issue_type: String(d.issue_type ?? issueType),
      tickets: toNumber(d.tickets),
      resolved: toNumber(d.resolved),
      sla_days: d.sla_days === null || d.sla_days === undefined ? null : toNumber(d.sla_days),
      median_resolution_minutes:
        d.median_resolution_minutes === null || d.median_resolution_minutes === undefined
          ? null
          : toNumber(d.median_resolution_minutes),
      avg_resolution_minutes:
        d.avg_resolution_minutes === null || d.avg_resolution_minutes === undefined
          ? null
          : toNumber(d.avg_resolution_minutes),
      within_sla: toNumber(d.within_sla),
      responsible_parties: items(d.responsible_parties),
      payment_types: items(d.payment_types),
      recent_resolutions: ((d.recent_resolutions ?? []) as IssuePlaybook['recent_resolutions']).map((r) => ({
        ...r,
        resolution_minutes: r.resolution_minutes === null ? null : toNumber(r.resolution_minutes),
      })),
    };
  },

  async suggest(ticketId: string): Promise<AiSuggestion> {
    const { data, error } = await supabase.functions.invoke('ai-assist', { body: { ticket_id: ticketId } });
    if (error) {
      let message = error.message || 'The AI assistant could not be reached';
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const payload = (await ctx.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error) message = payload.error;
      }
      throw toAppError({ message });
    }
    const payload = data as AiSuggestion & { error?: string };
    if (payload?.error) throw toAppError({ message: payload.error });
    return payload;
  },
};
