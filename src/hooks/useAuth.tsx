import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { hasPermission, type Permission } from '@/lib/permissions';
import { queryClient } from '@/lib/queryClient';
import { authService } from '@/services/auth';
import type { Profile, Role } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  officerId: string | null;
  loading: boolean;
  /** true while a password-recovery session is active */
  recovery: boolean;
  can: (permission: Permission) => boolean;
  signOut: (reason?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [officerId, setOfficerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [recovery, setRecovery] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const expiryTimer = useRef<number | undefined>(undefined);

  const signOut = useCallback(async (reason?: string) => {
    try {
      await authService.signOut();
    } catch {
      // fall through: clear local state anyway
    }
    loadedFor.current = null;
    setSession(null);
    setProfile(null);
    setOfficerId(null);
    queryClient.clear();
    if (reason) toast.info(reason);
  }, []);

  const loadProfile = useCallback(
    async (userId: string) => {
      try {
        const [p, oid] = await Promise.all([
          authService.getProfile(userId),
          authService.getOfficerIdForProfile(userId),
        ]);
        if (!p) {
          await signOut('Your account has no profile yet. Please contact an administrator.');
          return;
        }
        if (!p.is_active) {
          await signOut('Your account has been deactivated. Please contact an administrator.');
          return;
        }
        setProfile(p);
        setOfficerId(oid);
      } catch (err) {
        console.error('Failed to load profile', err);
        toast.error('Could not load your profile. Please refresh the page.');
      }
    },
    [signOut],
  );

  // Auto sign-out when the token expires and could not be refreshed
  const scheduleExpiry = useCallback(
    (s: Session | null) => {
      window.clearTimeout(expiryTimer.current);
      if (!s?.expires_at) return;
      const ms = s.expires_at * 1000 - Date.now() + 30_000; // grace period for auto refresh
      expiryTimer.current = window.setTimeout(
        async () => {
          const { data } = await supabase.auth.getSession();
          const current = data.session;
          if (!current || (current.expires_at ?? 0) * 1000 <= Date.now()) {
            const { error } = await supabase.auth.refreshSession();
            if (error) await signOut('Your session has expired. Please sign in again.');
          }
        },
        Math.max(ms, 5_000),
      );
    },
    [signOut],
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      scheduleExpiry(data.session);
      if (data.session?.user) {
        loadedFor.current = data.session.user.id;
        await loadProfile(data.session.user.id);
      }
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') {
        loadedFor.current = null;
        setSession(null);
        setProfile(null);
        setOfficerId(null);
        setRecovery(false);
        queryClient.clear();
        return;
      }
      setSession(s);
      scheduleExpiry(s);
      const uid = s?.user?.id;
      if (uid && loadedFor.current !== uid) {
        loadedFor.current = uid;
        // Defer: calling Supabase inside the callback can deadlock the auth lock
        setTimeout(() => {
          setLoading(true);
          loadProfile(uid).finally(() => mounted && setLoading(false));
        }, 0);
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(expiryTimer.current);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, scheduleExpiry]);

  // React to admins changing this user's role / active flag
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const channel = supabase
      .channel(`profile-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, () => {
        loadProfile(uid);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await loadProfile(session.user.id);
  }, [session?.user?.id, loadProfile]);

  const value = useMemo<AuthContextValue>(() => {
    const role = profile?.role ?? null;
    return {
      session,
      user: session?.user ?? null,
      profile,
      role,
      officerId,
      loading,
      recovery,
      can: (permission) => hasPermission(role, permission),
      signOut,
      refreshProfile,
    };
  }, [session, profile, officerId, loading, recovery, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
