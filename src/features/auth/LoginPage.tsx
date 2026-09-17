import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/lib/permissions';
import { isSupabaseConfigured } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { Button, Field, FullPageSpinner, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { session, profile, role, loading } = useAuth();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const from = (location.state as { from?: string } | null)?.from;

  if (session && profile) return <Navigate to={from && from !== '/' ? from : homePathFor(role)} replace />;
  if (session && loading) return <FullPageSpinner label="Signing you in…" />;

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await authService.signIn(values.email, values.password);
      // <Navigate> above redirects once the profile has loaded
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout title="Sign in" subtitle="Use the work email your administrator registered.">
      {!isSupabaseConfigured && (
        <div role="alert" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
          </div>
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field
          label={
            <span className="flex items-center justify-between">
              Password
              <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
                Forgot password?
              </Link>
            </span>
          }
          htmlFor="password"
          error={errors.password?.message}
        >
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            invalid={!!errors.password}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
            {...register('password')}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} leftIcon={<LogIn className="size-4" />}>
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-xs text-slate-500">
        No account? Ask an administrator to invite you. Accounts are not self-registered.
      </p>
    </AuthLayout>
  );
}
