import { cn } from '@/utils/cn';

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-800 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path d="M4 6h10l6 6-6 6H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8.5 9.5 10 12l-1.5 2.5M12 14.5h2" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-white">DM CRM</span>
          <span className="block text-[11px] font-medium text-brand-200/80">Service & Debt Management</span>
        </span>
      )}
    </div>
  );
}
