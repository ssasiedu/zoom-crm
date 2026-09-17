import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { qk } from '@/lib/queryClient';
import { ACCEPTED_ATTACHMENTS, attachmentsService } from '@/services/attachments';
import { errorMessage } from '@/services/errors';
import type { TicketAttachment } from '@/types';
import { Button, ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatBytes, formatDateTime } from '@/utils/format';

export function AttachmentsPanel({ ticketId }: { ticketId: string }) {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [toDelete, setToDelete] = useState<TicketAttachment | null>(null);

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.attachments(ticketId),
    queryFn: () => attachmentsService.list(ticketId),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.attachments(ticketId) });
    queryClient.invalidateQueries({ queryKey: qk.activity(ticketId) });
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length || !user) return;
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        await attachmentsService.upload(ticketId, file, user.id);
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    refresh();
  };

  const remove = useMutation({
    mutationFn: attachmentsService.remove,
    onSuccess: () => {
      setToDelete(null);
      refresh();
      toast.success('Attachment removed');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const open = async (a: TicketAttachment, download: boolean) => {
    try {
      const url = await attachmentsService.signedUrl(a.storage_path, download ? a.file_name : undefined);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={cn(
          'no-print flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm transition',
          dragging ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800',
        )}
      >
        <Upload className="size-5 text-slate-400" aria-hidden />
        <p className="text-slate-500">
          Drag files here or{' '}
          <button type="button" className="font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => inputRef.current?.click()}>
            browse
          </button>
        </p>
        <p className="text-xs text-slate-400">Images, PDF, Word, Excel, CSV · max 10 MB each</p>
        {uploading > 0 && <p className="text-xs font-medium text-brand-700">Uploading {uploading} file(s)…</p>}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={ACCEPTED_ATTACHMENTS}
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-12" />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState compact icon={<Paperclip />} title="No attachments" />
      ) : (
        <ul className="divide-y rounded-lg border dark:divide-slate-800">
          {data.map((a) => {
            const isImage = a.mime_type?.startsWith('image/');
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                {isImage ? <ImageIcon className="size-5 text-sky-500" /> : <FileText className="size-5 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => open(a, false)} className="block max-w-full truncate text-left text-sm font-medium hover:underline">
                    {a.file_name}
                  </button>
                  <p className="text-xs text-slate-500">
                    {formatBytes(a.size_bytes)} · {a.uploader?.full_name ?? 'Unknown'} · {formatDateTime(a.created_at)}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => open(a, true)} aria-label={`Download ${a.file_name}`}>
                  <Download className="size-4" />
                </Button>
                {(a.uploaded_by === user?.id || can('tickets:close')) && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(a)} aria-label={`Delete ${a.file_name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        loading={remove.isPending}
        title="Delete attachment?"
        message={
          <>
            <strong>{toDelete?.file_name}</strong> will be permanently removed.
          </>
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
