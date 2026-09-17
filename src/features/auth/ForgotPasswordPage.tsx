import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { authService } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { Button, Field, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') });

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a secure link to choose a new password.">
      {sentTo ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-100">
          <MailCheck className="mb-2 size-6" />
          If an account exists for <strong>{sentTo}</strong>, a reset link is on its way. Check your inbox and spam folder.
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async ({ email }) => {
            setError(null);
            try {
              await authService.sendPasswordReset(email);
              setSentTo(email);
            } catch (err) {
              setError(errorMessage(err));
            }
          })}
        >
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...register('email')} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </AuthLayout>
  );
}
