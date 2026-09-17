import { useNavigate } from 'react-router';
import { KeyRound, LogOut, Menu as MenuIcon, Moon, Plus, Search, Sun, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { ROLE_LABEL } from '@/lib/constants';
import { Avatar, Button, Menu } from '@/components/ui';
import { NotificationBell } from '@/features/notifications/NotificationBell';

export function TopBar({ onOpenMobileNav, onOpenPalette }: { onOpenMobileNav: () => void; onOpenPalette: () => void }) {
  const { profile, role, can, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="no-print sticky top-0 z-30 flex h-15 items-center gap-2 border-b bg-white/85 px-3 backdrop-blur sm:px-5 dark:bg-slate-950/85">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <MenuIcon className="size-5" />
      </Button>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white sm:max-w-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        aria-label="Search tickets"
        aria-keyshortcuts="Control+K Meta+K /"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search ticket no., client, ID or phone…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-slate-300 bg-white px-1.5 text-[11px] font-medium text-slate-500 sm:inline dark:border-slate-700 dark:bg-slate-800">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {can('tickets:create') && (
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            leftIcon={<Plus className="size-4" />}
            onClick={() => navigate('/tickets/new')}
          >
            New ticket
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title="Toggle theme"
        >
          {resolved === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        <NotificationBell />
        <Menu
          label="User menu"
          trigger={({ toggle: t, ref, open }) => (
            <button
              ref={ref}
              type="button"
              onClick={t}
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="Open user menu"
              className="ml-1 rounded-full ring-offset-2 hover:ring-2 hover:ring-brand-200 dark:ring-offset-slate-950"
            >
              <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
            </button>
          )}
        >
          {(close) => (
            <div className="w-60">
              <div className="border-b px-3 py-2.5">
                <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
                <p className="truncate text-xs text-slate-500">{profile?.email}</p>
                {role && (
                  <span className="mt-1.5 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
                    {ROLE_LABEL[role]}
                  </span>
                )}
              </div>
              <div className="p-1">
                {[
                  { label: 'My profile', icon: UserRound, run: () => navigate('/profile') },
                  { label: 'Change password', icon: KeyRound, run: () => navigate('/profile#password') },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      item.run();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <item.icon className="size-4 text-slate-400" /> {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    signOut().then(() => navigate('/login'));
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </Menu>
      </div>
    </header>
  );
}
