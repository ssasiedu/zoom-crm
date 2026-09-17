import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { ROLE_LABEL } from '@/lib/constants';
import { authService } from '@/services/auth';
import { errorMessage } from '@/services/errors';
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, PageHeader } from '@/components/ui';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import { isValidGhanaPhone } from '@/utils/phone';
import { passwordSchema, type PasswordValues } from '@/features/auth/ResetPasswordPage';

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidGhanaPhone(v), 'Use a Ghana number: 0XXXXXXXXX or +233XXXXXXXXX'),
});
type ProfileValues = z.infer<typeof profileSchema>;

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function ProfilePage() {
  const { profile, user, role, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  const pForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' },
  });
  const pwForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { password: '', confirm: '' } });

  useEffect(() => {
    if (location.hash === '#password') {
      const el = document.getElementById('password-section');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => document.getElementById('new-password')?.focus(), 300);
    }
  }, [location.hash]);

  if (!profile || !user) return null;

  const saveProfile = pForm.handleSubmit(async (v) => {
    try {
      await authService.updateOwnProfile(user.id, { full_name: v.full_name, phone: v.phone || null });
      await refreshProfile();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const savePassword = pwForm.handleSubmit(async (v) => {
    try {
      await authService.updatePassword(v.password);
      pwForm.reset();
      toast.success('Password changed');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <>
      <PageHeader title="My profile" description="Your personal details and preferences." />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-5 text-center">
          <Avatar name={profile.full_name} size="lg" className="mx-auto" />
          <p className="mt-3 text-lg font-semibold">{profile.full_name}</p>
          <p className="text-sm break-all text-slate-500">{profile.email}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <Badge tone="green">{role ? ROLE_LABEL[role] : ''}</Badge>
            {profile.region && <Badge>{profile.region}</Badge>}
          </div>
          <p className="mt-4 text-xs text-slate-400">Member since {formatDate(profile.created_at)}</p>
          <p className="mt-1 text-xs text-slate-400">Role and region are managed by an administrator.</p>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={<UserRound />} title="Personal details" />
            <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={saveProfile} noValidate>
              <Field label="Full name" htmlFor="p-name" required error={pForm.formState.errors.full_name?.message}>
                <Input id="p-name" autoComplete="name" invalid={!!pForm.formState.errors.full_name} {...pForm.register('full_name')} />
              </Field>
              <Field label="Phone" htmlFor="p-phone" error={pForm.formState.errors.phone?.message}>
                <Input id="p-phone" type="tel" autoComplete="tel" invalid={!!pForm.formState.errors.phone} {...pForm.register('phone')} />
              </Field>
              <Field label="Email" htmlFor="p-email" hint="Contact an administrator to change your email.">
                <Input id="p-email" value={profile.email} disabled readOnly />
              </Field>
              <div className="flex items-end justify-end sm:col-span-2">
                <Button type="submit" loading={pForm.formState.isSubmitting} disabled={!pForm.formState.isDirty}>
                  Save details
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Appearance" description="Saved on this device." />
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 p-5">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-3 text-sm font-medium transition',
                    theme === t.value
                      ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60',
                  )}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          <Card id="password-section" className="scroll-mt-20">
            <CardHeader icon={<KeyRound />} title="Change password" description="At least 8 characters with a letter and a number." />
            <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={savePassword} noValidate>
              <Field label="New password" htmlFor="new-password" required error={pwForm.formState.errors.password?.message}>
                <Input id="new-password" type="password" autoComplete="new-password" invalid={!!pwForm.formState.errors.password} {...pwForm.register('password')} />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm-password" required error={pwForm.formState.errors.confirm?.message}>
                <Input id="confirm-password" type="password" autoComplete="new-password" invalid={!!pwForm.formState.errors.confirm} {...pwForm.register('confirm')} />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" loading={pwForm.formState.isSubmitting}>
                  Update password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
