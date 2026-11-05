import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useBranding } from '@/hooks/useSettings';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { applyPlaceholders, smsSegments, smsService } from '@/services/sms';
import { Badge, Button, Field, Modal, Select, Textarea } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatPhone, isValidGhanaPhone } from '@/utils/phone';

export interface SendSmsDialogProps {
  open: boolean;
  onClose: () => void;
  recipient: string | null;
  recipientName?: string | null;
  ticketId?: string | null;
  debtorId?: string | null;
  /** values substituted into {placeholders} */
  vars: Record<string, string>;
  /** placeholders offered as quick-insert chips */
  placeholders?: string[];
}

export function SendSmsDialog({
  open,
  onClose,
  recipient,
  recipientName,
  ticketId,
  debtorId,
  vars,
  placeholders,
}: SendSmsDialogProps) {
  const queryClient = useQueryClient();
  const branding = useBranding();
  const [templateCode, setTemplateCode] = useState('');
  const [body, setBody] = useState('');

  const { data: templates = [] } = useQuery({
    queryKey: qk.smsTemplates,
    queryFn: smsService.templates,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const allVars = useMemo(() => ({ company: branding.app_name, ...vars }), [branding.app_name, vars]);
  const preview = useMemo(() => applyPlaceholders(body, allVars), [body, allVars]);
  const { segments, limit, unicode } = smsSegments(preview);
  const valid = Boolean(recipient && isValidGhanaPhone(recipient)) && preview.trim().length > 0;

  useEffect(() => {
    if (open) {
      setTemplateCode('');
      setBody('');
    }
  }, [open]);

  const send = useMutation({
    mutationFn: () =>
      smsService.send({
        recipient: recipient as string,
        message: preview,
        ticket_id: ticketId ?? null,
        debtor_id: debtorId ?? null,
        recipient_name: recipientName ?? null,
        template_code: templateCode || null,
      }),
    onSuccess: () => {
      toast.success(`Message sent to ${formatPhone(recipient ?? '')}`);
      if (ticketId) queryClient.invalidateQueries({ queryKey: qk.smsForTicket(ticketId) });
      queryClient.invalidateQueries({ queryKey: qk.smsLog });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const chips = placeholders ?? Object.keys(allVars).slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Send SMS"
      description={
        recipient
          ? `To ${recipientName ? `${recipientName} · ` : ''}${formatPhone(recipient)}`
          : 'This record has no valid phone number'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon={<Send className="size-4" />} loading={send.isPending} disabled={!valid} onClick={() => send.mutate()}>
            Send message
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Template" htmlFor="sms-template" hint="Pick one to start from, then edit freely.">
          <Select
            id="sms-template"
            placeholder="Write from scratch"
            value={templateCode}
            onChange={(e) => {
              const code = e.target.value;
              setTemplateCode(code);
              const tpl = templates.find((t) => t.code === code);
              if (tpl) setBody(tpl.body);
            }}
            options={templates.filter((t) => t.is_active).map((t) => ({ value: t.code, label: t.name }))}
          />
        </Field>

        <Field label="Message" htmlFor="sms-body">
          <Textarea
            id="sms-body"
            rows={4}
            data-autofocus
            value={body}
            maxLength={918}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type the message…"
          />
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {chips.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}{${p}}`)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
            >
              {`{${p}}`}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <MessageSquare className="size-3.5" /> Preview
          </p>
          <p className="text-sm whitespace-pre-wrap text-slate-800 dark:text-slate-100">
            {preview || <span className="text-slate-400">Nothing to send yet</span>}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={cn('tabular-nums', segments > 3 && 'font-semibold text-amber-700 dark:text-amber-400')}>
              {preview.length} characters · {segments} SMS {segments === 1 ? 'part' : 'parts'}
            </span>
            {unicode && <Badge tone="amber">special characters — {limit} per part</Badge>}
          </p>
        </div>
      </div>
    </Modal>
  );
}
