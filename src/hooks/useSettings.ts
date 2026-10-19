import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { DEFAULT_AI, DEFAULT_BRANDING, DEFAULT_SMS, settingsService } from '@/services/settings';
import { smsService } from '@/services/sms';
import type { AiSettings, Branding, SettingsKey, SmsSettings } from '@/types';
import { accentRamp, brandRamp } from '@/utils/color';

/**
 * Branding is readable without signing in (the login page shows the logo);
 * the SMS and AI rows only come back for admins.
 */
export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: settingsService.getAll,
    staleTime: 5 * 60_000,
  });
}

export function useBranding(): Branding {
  const { data } = useSettings();
  return data?.branding ?? DEFAULT_BRANDING;
}

export function useSmsSettings(): SmsSettings {
  const { data } = useSettings();
  return data?.sms ?? DEFAULT_SMS;
}

export function useAiSettings(): AiSettings {
  const { data } = useSettings();
  return data?.ai ?? DEFAULT_AI;
}

/** True when an admin has switched the AI assistant on */
export function useAiEnabled(): boolean {
  const { data } = useSettings();
  // non-admins cannot read the row, so fall back to "try it and see"
  return data?.ai ? data.ai.enabled && Boolean(data.ai.api_key) : true;
}

/** Applies the company colours, name and favicon to the running app */
export function useApplyBranding() {
  const branding = useBranding();

  useEffect(() => {
    const root = document.documentElement;
    const applied: string[] = [];
    Object.entries(brandRamp(branding.primary_color)).forEach(([step, value]) => {
      root.style.setProperty(`--color-brand-${step}`, value);
      applied.push(`--color-brand-${step}`);
    });
    Object.entries(accentRamp(branding.accent_color)).forEach(([step, value]) => {
      root.style.setProperty(`--color-gold-${step}`, value);
      applied.push(`--color-gold-${step}`);
    });
    return () => applied.forEach((name) => root.style.removeProperty(name));
  }, [branding.primary_color, branding.accent_color]);

  useEffect(() => {
    document.title = branding.app_name;
  }, [branding.app_name]);

  useEffect(() => {
    if (!branding.logo_url) return;
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) return;
    const previous = link.href;
    link.href = branding.logo_url;
    return () => {
      link.href = previous;
    };
  }, [branding.logo_url]);
}

export function useSaveSettings(key: SettingsKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: Record<string, unknown>) => settingsService.save(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.settings });
      toast.success('Settings saved');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/**
 * Whether SMS can actually be sent. Admins read it from the settings row;
 * everyone else asks the database, since the row itself is admin-only.
 */
export function useSmsEnabled(): boolean {
  const { data } = useSettings();
  const admin = Boolean(data?.sms);
  const { data: flag } = useQuery({
    queryKey: qk.smsEnabled,
    queryFn: smsService.isEnabled,
    enabled: !admin,
    staleTime: 5 * 60_000,
  });
  if (admin) return Boolean(data?.sms?.enabled && data.sms.api_key);
  return flag ?? false;
}
