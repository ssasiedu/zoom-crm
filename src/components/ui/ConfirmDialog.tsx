import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Field } from './Field';
import { Textarea } from './Input';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** require a typed reason (e.g. reopen) */
  reasonLabel?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  reasonLabel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const needsReason = Boolean(reasonLabel);
  const close = () => {
    setReason('');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            disabled={needsReason && reason.trim().length < 3}
            onClick={async () => {
              await onConfirm(needsReason ? reason.trim() : undefined);
              setReason('');
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={
            tone === 'danger'
              ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10'
              : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10'
          }
        >
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <div className="text-sm text-slate-600 dark:text-slate-300">{message}</div>
      </div>
      {needsReason && (
        <Field label={reasonLabel} htmlFor="confirm-reason" required className="mt-4">
          <Textarea
            id="confirm-reason"
            data-autofocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why…"
          />
        </Field>
      )}
    </Modal>
  );
}
