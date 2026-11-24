import { useBranding } from '@/hooks/useSettings';
import { cn } from '@/utils/cn';

/**
 * Company mark. Uses the logo uploaded under Administration → Branding when
 * there is one, and falls back to the built-in mark.
 */
export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const branding = useBranding();

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/95 shadow-sm">
        {branding.logo_url ? (
          <img src={branding.logo_url} alt="" className="size-full object-contain p-0.5" />
        ) : (
          <svg viewBox="0 0 24 24" className="size-5 text-brand-800" fill="none" aria-hidden>
            <path d="M4 6h10l6 6-6 6H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M8.5 9.5 10 12l-1.5 2.5M12 14.5h2" stroke="#e5a50a" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-bold tracking-tight text-white">{branding.app_name}</span>
          {branding.tagline && (
            <span className="block truncate text-[11px] font-medium text-brand-200/80">{branding.tagline}</span>
          )}
        </span>
      )}
    </div>
  );
}
