import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Eraser, Save, SaveAll } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLookups } from '@/hooks/useLookups';
import { useInvalidateTickets } from '@/hooks/useTickets';
import { errorMessage } from '@/services/errors';
import { ticketsService } from '@/services/tickets';
import { Button, PageHeader } from '@/components/ui';
import { formatRelative } from '@/utils/format';
import { TicketForm } from './TicketForm';
import { buildTicketSchema, EMPTY_TICKET, formToInsert, type TicketFormValues } from './ticketSchema';

const DRAFT_KEY = 'zoomlion-crm:ticket-draft';

interface Draft {
  values: TicketFormValues;
  savedAt: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export default function NewTicketPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { lookups } = useLookups();
  const invalidate = useInvalidateTickets();
  const schema = useMemo(() => buildTicketSchema(lookups), [lookups]);
  const initialDraft = useRef(loadDraft());
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(initialDraft.current?.savedAt ?? null);
  const anotherRef = useRef(false);

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY_TICKET, ...(initialDraft.current?.values ?? {}) },
    mode: 'onTouched',
  });
  const { handleSubmit, reset, watch, formState } = form;

  useEffect(() => {
    if (initialDraft.current) toast.info('Restored your unsaved draft', { description: 'Use “Clear” to start fresh.' });
  }, []);

  // Autosave draft
  useEffect(() => {
    let timer: number | undefined;
    const sub = watch((values) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const hasContent = Object.entries(values).some(([k, v]) => k !== 'priority' && typeof v === 'string' && v.trim() !== '');
        try {
          if (hasContent) {
            const savedAt = new Date().toISOString();
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, savedAt }));
            setDraftSavedAt(savedAt);
          }
        } catch {
          // storage full / unavailable
        }
      }, 800);
    });
    return () => {
      window.clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [watch]);

  // Warn before leaving with unsaved edits
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (formState.isDirty && !formState.isSubmitSuccessful) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [formState.isDirty, formState.isSubmitSuccessful]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setDraftSavedAt(null);
  };

  const onSubmit = async (values: TicketFormValues) => {
    try {
      const ticket = await ticketsService.create(formToInsert(values, { isAdmin: can('tickets:editDateOpened'), lookups, includeDueDate: can('tickets:editCore') }));
      clearDraft();
      invalidate();
      toast.success(`Ticket ${ticket.ticket_number} created`, {
        action: { label: 'View', onClick: () => navigate(`/tickets/${ticket.id}`) },
      });
      if (anotherRef.current) {
        // keep channel/region, clear the rest
        reset({ ...EMPTY_TICKET, contact_type: values.contact_type, region: values.region });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('client_id')?.focus();
      } else {
        navigate(`/tickets/${ticket.id}`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const submit = (another: boolean) => {
    anotherRef.current = another;
    return handleSubmit(onSubmit, () => {
      toast.error('Please fix the highlighted fields');
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
    })();
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          submit(false);
        }
      }}
    >
      <PageHeader
        eyebrow="Tickets"
        title="New ticket"
        description={
          draftSavedAt ? `Draft saved ${formatRelative(draftSavedAt)} on this device.` : 'Fields marked * are required. Ctrl+Enter saves.'
        }
        actions={
          <Button
            variant="ghost"
            leftIcon={<Eraser className="size-4" />}
            onClick={() => {
              reset(EMPTY_TICKET);
              clearDraft();
            }}
          >
            Clear
          </Button>
        }
      />
      <TicketForm form={form} mode="create" isAdmin={can('tickets:editDateOpened')} canEditDueDate={can('tickets:editCore')} canAssign={can('tickets:assign')} />
      <div className="sticky bottom-0 z-20 -mx-3 mt-5 flex flex-wrap justify-end gap-2 border-t bg-slate-50/90 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7 dark:bg-slate-950/90">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button variant="outline" leftIcon={<SaveAll className="size-4" />} loading={formState.isSubmitting && anotherRef.current} disabled={formState.isSubmitting} onClick={() => submit(true)}>
          Save & create another
        </Button>
        <Button type="submit" leftIcon={<Save className="size-4" />} loading={formState.isSubmitting && !anotherRef.current} disabled={formState.isSubmitting}>
          Create ticket
        </Button>
      </div>
    </form>
  );
}
