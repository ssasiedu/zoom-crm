import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { qk } from '@/lib/queryClient';
import { commentsService } from '@/services/comments';
import { errorMessage } from '@/services/errors';
import { Avatar, Button, EmptyState, ErrorState, Skeleton, Textarea } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/utils/format';

export function CommentsPanel({ ticketId }: { ticketId: string }) {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.comments(ticketId),
    queryFn: () => commentsService.list(ticketId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.comments(ticketId) });
    queryClient.invalidateQueries({ queryKey: qk.activity(ticketId) });
  };

  const add = useMutation({
    mutationFn: () => commentsService.add(ticketId, body, user!.id),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: commentsService.remove,
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState compact title="No comments yet" description="Internal notes are visible to anyone who can see this ticket." />
      ) : (
        <ul className="space-y-3">
          {data.map((c) => (
            <li key={c.id} className="group flex gap-2.5">
              <Avatar name={c.author?.full_name} size="sm" />
              <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{c.author?.full_name ?? 'Unknown'}</span>
                  <time title={formatDateTime(c.created_at)} className="text-xs text-slate-400">
                    {formatRelative(c.created_at)}
                  </time>
                  {(c.author_id === user?.id || role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => remove.mutate(c.id)}
                      className="ml-auto text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 focus:opacity-100"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <Textarea
          aria-label="Add a comment"
          rows={2}
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && body.trim()) {
              e.preventDefault();
              e.stopPropagation();
              add.mutate();
            }
          }}
          placeholder="Add an internal note… (Ctrl+Enter to send)"
          className="min-h-14"
        />
        <Button type="submit" size="icon" loading={add.isPending} disabled={!body.trim()} aria-label="Send comment">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
