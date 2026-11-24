import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  Clock,
  Eye,
  EyeOff,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSaveSettings, useSettings } from '@/hooks/useSettings';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { PLACEHOLDERS, smsService } from '@/services/sms';
import { DEFAULT_SMS } from '@/services/settings';
import type { SmsEvent, SmsSettings, SmsTemplate } from '@/types';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  StatCard,
  Switch,
  Textarea,
} from '@/components/ui';
import { formatDateTime } from '@/utils/format';
import { formatPhone, isValidGhanaPhone } from '@/utils/phone';

const EVENTS: { value: SmsEvent | ''; label: string }[] = [
  { value: '', label: 'Ad-hoc (offered in the Send SMS box)' },
  { value: 'ticket_created', label: 'When a ticket is logged' },
  { value: 'ticket_assigned', label: 'When a ticket is assigned' },
  { value: 'ticket_in_progress', label: 'When work starts' },
  { value: 'ticket_resolved', label: 'When a ticket is resolved' },
  { value: 'ticket_closed', label: 'When a ticket is closed' },
  { value: 'ticket_reopened', label: 'When a ticket is reopened' },
];

function TemplateDialog({ template, onClose }: { template: Partial<SmsTemplate> | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Partial<SmsTemplate>>(template ?? {});

  useEffect(() => setValues(template ?? {}), [template]);

  const save = useMutation({
    mutationFn: () =>
      smsService.saveTemplate({
        id: values.id,
        code: (values.code ?? '').trim() || (values.name ?? '').trim().toLowerCase().replace(/\W+/g, '_'),
        name: (values.name ?? '').trim(),
        body: (values.body ?? '').trim(),
        event: values.event ?? null,
        auto_send: Boolean(values.auto_send),
        is_active: values.is_active ?? true,
        sort_order: values.sort_order ?? 100,
      }),
    onSuccess: () => {
      toast.success('Template saved');
      queryClient.invalidateQueries({ queryKey: qk.smsTemplates });
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open={Boolean(template)}
      onClose={onClose}
      size="lg"
      title={values.id ? `Edit "${values.name}"` : 'New template'}
      description="Use {placeholders} — they are filled in from the ticket when the message is sent."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={!(values.name ?? '').trim() || !(values.body ?? '').trim()}
            onClick={() => save.mutate()}
          >
            Save template
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="t-name" required>
          <Input
            id="t-name"
            data-autofocus
            value={values.name ?? ''}
            disabled={values.is_system}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
          />
        </Field>
        <Field label="Sent automatically on" htmlFor="t-event" hint="Only one template per event can send automatically.">
          <Select
            id="t-event"
            clearable={false}
            value={values.event ?? ''}
            disabled={values.is_system}
            onChange={(e) => setValues({ ...values, event: (e.target.value || null) as SmsEvent | null })}
            options={EVENTS.map((x) => ({ value: x.value, label: x.label }))}
          />
        </Field>
        <Field label="Message" htmlFor="t-body" required className="sm:col-span-2">
          <Textarea
            id="t-body"
            rows={4}
            maxLength={918}
            value={values.body ?? ''}
            onChange={(e) => setValues({ ...values, body: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-1.5 sm:col-span-2">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                setValues((v) => ({ ...v, body: `${v.body ?? ''}${(v.body ?? '').endsWith(' ') ? '' : ' '}{${p}}`.trim() }))
              }
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
            >
              {`{${p}}`}
            </button>
          ))}
        </div>
        {values.event && (
          <div className="sm:col-span-2">
            <Switch
              label="Send this message automatically when the event happens"
              checked={Boolean(values.auto_send)}
              onChange={(value) => setValues({ ...values, auto_send: value })}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function SmsAdmin() {
  const { data, isLoading } = useSettings();
  const saveSettings = useSaveSettings('sms');
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SmsSettings>(DEFAULT_SMS);
  const [showKey, setShowKey] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [editing, setEditing] = useState<Partial<SmsTemplate> | null>(null);
  const [toDelete, setToDelete] = useState<SmsTemplate | null>(null);

  useEffect(() => {
    if (data?.sms) setForm(data.sms);
  }, [data?.sms]);

  const templates = useQuery({ queryKey: qk.smsTemplates, queryFn: smsService.templates });
  const stats = useQuery({ queryKey: [...qk.smsLog, 'stats'], queryFn: () => smsService.stats(30) });
  const log = useQuery({ queryKey: [...qk.smsLog, 'recent'], queryFn: () => smsService.log({}, 25) });

  const test = useMutation({
    mutationFn: () => smsService.sendTest(testTo, `Test message from ${form.sender_id || 'Zoomlion CRM'}.`),
    onSuccess: () => {
      toast.success(`Test message sent to ${formatPhone(testTo)}`);
      log.refetch();
      stats.refetch();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const dispatch = useMutation({
    mutationFn: () => smsService.dispatch(50),
    onSuccess: (r) => {
      toast.success(`${r.sent} sent, ${r.failed} failed`);
      log.refetch();
      stats.refetch();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeTemplate = useMutation({
    mutationFn: (id: number) => smsService.removeTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted');
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: qk.smsTemplates });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sent (30 days)" value={stats.data?.sent ?? 0} icon={<CheckCheck />} tone="green" loading={stats.isLoading} />
        <StatCard label="Queued" value={stats.data?.pending ?? 0} icon={<Clock />} tone="amber" loading={stats.isLoading} />
        <StatCard label="Failed" value={stats.data?.failed ?? 0} icon={<TriangleAlert />} tone="red" loading={stats.isLoading} />
        <StatCard label="Sent today" value={stats.data?.today ?? 0} icon={<MessageSquare />} tone="blue" loading={stats.isLoading} />
      </div>

      <Card>
        <CardHeader
          title="SMS provider"
          description="Credentials are stored server-side and never sent to the browser. Deploy the send-sms edge function before turning this on."
          actions={
            <Button
              leftIcon={<Save className="size-4" />}
              loading={saveSettings.isPending}
              onClick={() => saveSettings.mutate({ ...form })}
            >
              Save settings
            </Button>
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <Switch
              label="SMS messaging is on"
              checked={form.enabled}
              onChange={(value) => setForm({ ...form, enabled: value })}
            />
          </div>
          <Field label="Provider" htmlFor="sms-provider">
            <Select
              id="sms-provider"
              clearable={false}
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              options={[{ value: 'mnotify', label: 'mNotify (Ghana)' }]}
            />
          </Field>
          <Field label="API endpoint" htmlFor="sms-endpoint" hint="Leave as it is unless mNotify tells you otherwise.">
            <Input id="sms-endpoint" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
          </Field>
          <Field label="API key" htmlFor="sms-key" required>
            <Input
              id="sms-key"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showKey ? 'Hide the key' : 'Show the key'}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />
          </Field>
          <Field label="Sender ID" htmlFor="sms-sender" hint="Registered with mNotify, 11 characters at most.">
            <Input
              id="sms-sender"
              maxLength={11}
              value={form.sender_id}
              onChange={(e) => setForm({ ...form, sender_id: e.target.value })}
            />
          </Field>
          <Field label="Daily limit" htmlFor="sms-limit" hint="A safety net against runaway sending. 0 means no limit.">
            <Input
              id="sms-limit"
              inputMode="numeric"
              value={String(form.daily_limit)}
              onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value.replace(/\D/g, '') || 0) })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Switch
              label="Send event messages automatically (ticket closed, resolved…)"
              checked={form.auto_send}
              onChange={(value) => setForm({ ...form, auto_send: value })}
            />
          </div>
          <Field label="Send a test message to" htmlFor="sms-test" className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                id="sms-test"
                type="tel"
                placeholder="0241234567"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <Button
                variant="secondary"
                leftIcon={<Send className="size-4" />}
                disabled={!isValidGhanaPhone(testTo)}
                loading={test.isPending}
                onClick={() => test.mutate()}
              >
                Send test
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Message templates"
          description="Event templates can send automatically; ad-hoc ones appear in the Send SMS box."
          actions={
            <Button
              variant="secondary"
              leftIcon={<Plus className="size-4" />}
              onClick={() => setEditing({ is_active: true, auto_send: false, event: null })}
            >
              New template
            </Button>
          }
        />
        {templates.isLoading ? (
          <Skeleton className="h-32" />
        ) : (templates.data ?? []).length === 0 ? (
          <EmptyState compact title="No templates yet" />
        ) : (
          <ul className="divide-y dark:divide-slate-800">
            {templates.data!.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {t.name}
                    {t.event && <Badge tone="blue">{EVENTS.find((e) => e.value === t.event)?.label ?? t.event}</Badge>}
                    {t.auto_send && (
                      <Badge tone="green">
                        <Zap className="mr-0.5 inline size-3" />
                        automatic
                      </Badge>
                    )}
                    {!t.is_active && <Badge>off</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">{t.body}</p>
                </div>
                <Switch
                  label={`${t.is_active ? 'Disable' : 'Enable'} ${t.name}`}
                  checked={t.is_active}
                  onChange={async () => {
                    try {
                      await smsService.saveTemplate({ id: t.id, is_active: !t.is_active });
                      queryClient.invalidateQueries({ queryKey: qk.smsTemplates });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                />
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                  <Pencil className="size-4" />
                </Button>
                {!t.is_system && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setToDelete(t)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Recent messages"
          description="Everything the system has sent or queued."
          actions={
            <Button variant="secondary" loading={dispatch.isPending} onClick={() => dispatch.mutate()}>
              Send queued now
            </Button>
          }
        />
        {log.isLoading ? (
          <Skeleton className="h-32" />
        ) : (log.data ?? []).length === 0 ? (
          <EmptyState compact icon={<MessageSquare />} title="Nothing sent yet" />
        ) : (
          <ul className="divide-y text-sm dark:divide-slate-800">
            {log.data!.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                <Badge tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'amber'}>{m.status}</Badge>
                <span className="font-mono text-xs">{formatPhone(m.recipient)}</span>
                <span className="min-w-0 flex-1 truncate" title={m.message}>
                  {m.message}
                </span>
                {m.error && <span className="text-xs text-rose-600">{m.error}</span>}
                <time className="text-xs text-slate-400">{formatDateTime(m.sent_at ?? m.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TemplateDialog template={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title={`Delete "${toDelete?.name}"?`}
        message="Messages already sent with it are kept."
        confirmLabel="Delete"
        loading={removeTemplate.isPending}
        onConfirm={() => toDelete && removeTemplate.mutate(toDelete.id)}
      />
    </div>
  );
}
