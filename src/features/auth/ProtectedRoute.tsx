import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Permission } from '@/lib/permissions';
import { homePathFor } from '@/lib/permissions';
import { EmptyState, FullPageSpinner } from '@/components/ui';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session || !profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState
        icon={<ShieldAlert />}
        title="You don't have access to this page"
        description="Ask an administrator if you believe you should."
      />
    );
  }
  return <>{children}</>;
}

export function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={homePathFor(role)} replace />;
}
