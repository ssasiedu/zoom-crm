import { Suspense, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useRealtimeSync } from '@/hooks/useRealtime';
import { PageSkeleton } from '@/components/ui';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const COLLAPSE_KEY = 'zoomlion-crm:sidebar-collapsed';

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useRealtimeSync();

  useKeyboardShortcuts([
    { combo: 'mod+k', handler: () => setPaletteOpen((o) => !o) },
    { combo: '/', handler: () => setPaletteOpen(true) },
    {
      combo: 'n',
      handler: () => {
        if (can('tickets:create')) navigate('/tickets/new');
      },
    },
  ]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // ignore
      }
      return !c;
    });
  };

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[70] rounded bg-white px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMobileNav={() => setMobileOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-5 outline-none sm:px-5 lg:px-7">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
