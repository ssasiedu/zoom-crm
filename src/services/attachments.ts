import { ATTACHMENT_BUCKET, supabase } from '@/lib/supabase';
import type { TicketAttachment } from '@/types';
import { AppError, toAppError, unwrap } from './errors';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_ATTACHMENTS =
  'image/jpeg,image/png,image/webp,image/heic,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';

const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
];

function safeName(name: string): string {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-120) || 'file';
}

export const attachmentsService = {
  async list(ticketId: string): Promise<TicketAttachment[]> {
    return unwrap(
      await supabase
        .from('ticket_attachments')
        .select('*, uploader:profiles!ticket_attachments_uploaded_by_fkey(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false }),
    ) as TicketAttachment[];
  },

  async upload(ticketId: string, file: File, userId: string): Promise<TicketAttachment> {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new AppError(`${file.name} is larger than 10 MB.`);
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      throw new AppError(`${file.name}: this file type is not allowed.`);
    }
    const path = `${ticketId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: upErr } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) throw toAppError(upErr);

    const { data, error } = await supabase
      .from('ticket_attachments')
      .insert({
        ticket_id: ticketId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: userId,
      })
      .select('*, uploader:profiles!ticket_attachments_uploaded_by_fkey(full_name)')
      .single();
    if (error) {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
      throw toAppError(error);
    }
    return data as TicketAttachment;
  },

  async signedUrl(path: string, download?: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(path, 60 * 10, download ? { download } : undefined);
    if (error) throw toAppError(error);
    return data.signedUrl;
  },

  async remove(attachment: TicketAttachment): Promise<void> {
    unwrap(await supabase.from('ticket_attachments').delete().eq('id', attachment.id));
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]);
  },
};
