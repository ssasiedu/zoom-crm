import { NavLink } from 'react-router';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABEL } from '@/lib/constants';
import { cn } from '@/utils/cn';
import { Avatar } from '@/components/ui';
import { Logo } from './Logo';
import { NAV_ITEMS } from './nav';

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { can, officerId, profile, role } = useAuth();
  const items = NAV_ITEMS.filter((i) =>
    i.officerOnly ? Boolean(officerId) || role === 'dm_officer' : i.permission ? can(i.permission) : true,
  );

  const content = (isMobile: boolean) => {
    const narrow = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col bg-brand-950 text-brand-100">
        {/* kente-inspired accent stripe */}
        <div className="h-1 w-full bg-[linear-gradient(90deg,#ce1126_0_33%,#fcd116_33%_66%,#006b3f_66%)]" aria-hidden />
        <div className={cn('flex h-15 items-center border-b border-white/10', narrow ? 'justify-center px-2' : 'justify-between px-4')}>
          <Logo collapsed={narrow} />
          {isMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-md p-1.5 text-brand-200 hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
        <nav aria-label="Main" className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2.5 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/tickets'}
              onClick={isMobile ? onCloseMobile : undefined}
              title={narrow ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  narrow && 'justify-center',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-brand-200/80 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-1.5 bottom-1.5 left-0 w-0.75 rounded-r bg-gold-400" aria-hidden />
                  )}
                  <item.icon className={cn('size-4.5 shrink-0', isActive && 'text-gold-300')} aria-hidden />
                  {!narrow && <span className="flex-1 truncate">{item.label}</span>}
                  {!narrow && item.shortcut && (
                    <kbd className="rounded border border-white/15 px-1.5 text-[10px] text-brand-200/70">{item.shortcut}</kbd>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {profile && (
          <div className={cn('border-t border-white/10 p-3', narrow && 'flex justify-center')}>
            <div className="flex items-center gap-2.5">
              <Avatar name={profile.full_name} src={profile.avatar_url} size="sm" />
              {!narrow && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{profile.full_name}</p>
                  <p className="truncate text-xs text-brand-200/70">
                    {role ? ROLE_LABEL[role] : ''}
                    {profile.region ? ` · ${profile.region}` : ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {!isMobile && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex items-center justify-center gap-2 border-t border-white/10 py-2.5 text-xs text-brand-200/70 hover:bg-white/5 hover:text-white"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          'no-print sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 lg:block',
          collapsed ? 'w-17' : 'w-64',
        )}
      >
        {content(false)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-slate-950/50" onClick={onCloseMobile} aria-hidden />
          <div className="relative h-full w-72 max-w-[85vw] shadow-2xl">{content(true)}</div>
        </div>
      )}
    </>
  );
}
