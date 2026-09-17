import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className={cn('size-5 animate-spin text-brand-600', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="size-8" label={label} />
      <span>{label}</span>
    </div>
  );
}
