import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { SearchX } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { EmptyState, FullPageSpinner, PageSkeleton } from '@/components/ui';
import { AuthProvider } from '@/hooks/useAuth';
import { useApplyBranding } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useTheme';
import type { Permission } from '@/lib/permissions';
import { queryClient } from '@/lib/queryClient';
import { HomeRedirect, RequireAuth, RequirePermission } from '@/features/auth/ProtectedRoute';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const MyTicketsPage = lazy(() => import('@/features/tickets/MyTicketsPage'));
const AllTicketsPage = lazy(() => import('@/features/tickets/AllTicketsPage'));
const NewTicketPage = lazy(() => import('@/features/tickets/NewTicketPage'));
const TicketDetailPage = lazy(() => import('@/features/tickets/TicketDetailPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const AdminPage = lazy(() => import('@/features/admin/AdminPage'));
const DebtorsPage = lazy(() => import('@/features/debtors/DebtorsPage'));
const MyDebtorsPage = lazy(() => import('@/features/debtors/MyDebtorsPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));

function Page({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const content = <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
  return permission ? <RequirePermission permission={permission}>{content}</RequirePermission> : content;
}

function NotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="Page not found"
      description="The link may be broken or the page may have moved."
      action={
        <Link to="/" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
          Go to home
        </Link>
      }
    />
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster richColors closeButton position="top-right" theme={resolved} toastOptions={{ duration: 4500 }} />;
}

/** Applies the company name, logo and colours from Administration → Branding */
function Branding() {
  useApplyBranding();
  return null;
}

export function App() {
  return (
    <ErrorBoundary fullPage>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<FullPageSpinner />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<HomeRedirect />} />
                  <Route path="dashboard" element={<Page permission="dashboard:view"><DashboardPage /></Page>} />
                  <Route path="my-tickets" element={<Page><MyTicketsPage /></Page>} />
                  <Route path="tickets" element={<Page permission="tickets:list"><AllTicketsPage /></Page>} />
                  <Route path="tickets/new" element={<Page permission="tickets:create"><NewTicketPage /></Page>} />
                  <Route path="tickets/:id" element={<Page><TicketDetailPage /></Page>} />
                  <Route path="my-debtors" element={<Page><MyDebtorsPage /></Page>} />
                  <Route path="debtors" element={<Page permission="debtors:view"><DebtorsPage /></Page>} />
                  <Route path="reports" element={<Page permission="reports:view"><ReportsPage /></Page>} />
                  <Route path="notifications" element={<Page><NotificationsPage /></Page>} />
                  <Route path="admin" element={<Page permission="admin"><AdminPage /></Page>} />
                  <Route path="profile" element={<Page><ProfilePage /></Page>} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
            <Branding />
            <ThemedToaster />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
