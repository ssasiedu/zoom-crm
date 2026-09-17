import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { homePathFor } from '@/lib/permissions';
import { authService } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { Button, Field, FullPageSpinner, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
export type PasswordValues = z.infer<typeof passwordSchema>;

export default function ResetPasswordPage() {
  const { session, loading, role } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  if (loading) return <FullPageSpinner />;

  return (
    <AuthLayout title="Choose a new password" subtitle="This also activates your account if you were invited.">
      {!session ? (
        <div role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          This reset link is invalid or has expired. Request a new one from the{' '}
          <a href="/forgot-password" className="font-semibold underline">
            forgot password
          </a>{' '}
          page.
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async ({ password }) => {
            try {
              await authService.updatePassword(password);
              toast.success('Password updated');
              navigate(homePathFor(role), { replace: true });
            } catch (err) {
              toast.error(errorMessage(err));
            }
          })}
        >
          <Field label="New password" htmlFor="password" error={errors.password?.message} hint="At least 8 characters with a letter and a number.">
            <Input id="password" type="password" autoComplete="new-password" autoFocus invalid={!!errors.password} {...register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            Save password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
