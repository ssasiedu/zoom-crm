import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Image, RotateCcw, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useSaveSettings, useSettings } from '@/hooks/useSettings';
import { qk } from '@/lib/queryClient';
import { errorMessage } from '@/services/errors';
import { DEFAULT_AI, DEFAULT_BRANDING, settingsService } from '@/services/settings';
import type { AiSettings, Branding } from '@/types';
import { Button, Card, CardHeader, Field, Input, Select, Skeleton, Switch } from '@/components/ui';
import { brandRamp, contrastText, isHexColor } from '@/utils/color';
import { cn } from '@/utils/cn';

function ColourField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={isHexColor(value) ? undefined : 'Use a hex colour like #14532d'}>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={isHexColor(value) ? value : '#14532d'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-control border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
        />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </Field>
  );
}

export function BrandingAdmin() {
  const { data, isLoading } = useSettings();
  const queryClient = useQueryClient();
  const saveBranding = useSaveSettings('branding');
  const saveAi = useSaveSettings('ai');
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Branding>(DEFAULT_BRANDING);
  const [ai, setAi] = useState<AiSettings>(DEFAULT_AI);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (data?.branding) setForm(data.branding);
  }, [data?.branding]);
  useEffect(() => {
    if (data?.ai) setAi(data.ai);
  }, [data?.ai]);

  const upload = useMutation({
    mutationFn: (file: File) => settingsService.uploadLogo(file),
    onSuccess: (url) => {
      setForm((f) => ({ ...f, logo_url: url }));
      toast.success('Logo uploaded — press Save to apply it');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const ramp = brandRamp(form.primary_color);

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Branding"
          description="The name, logo and colours used across the app, the sign-in page and exported PDFs."
          actions={
            <>
              <Button
                variant="ghost"
                leftIcon={<RotateCcw className="size-4" />}
                onClick={() => setForm(DEFAULT_BRANDING)}
              >
                Reset
              </Button>
              <Button
                leftIcon={<Save className="size-4" />}
                loading={saveBranding.isPending}
                onClick={() =>
                  saveBranding.mutate(
                    { ...form },
                    { onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.settings }) },
                  )
                }
              >
                Save branding
              </Button>
            </>
          }
        />
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Application name" htmlFor="b-name" required>
              <Input id="b-name" value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} />
            </Field>
            <Field label="Tagline" htmlFor="b-tagline" hint="Shown under the name in the sidebar.">
              <Input id="b-tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </Field>
            <ColourField
              id="b-primary"
              label="Primary colour"
              value={form.primary_color}
              onChange={(v) => setForm({ ...form, primary_color: v })}
              hint="Sidebar, buttons and links."
            />
            <ColourField
              id="b-accent"
              label="Accent colour"
              value={form.accent_color}
              onChange={(v) => setForm({ ...form, accent_color: v })}
              hint="Highlights and payment areas."
            />
            <Field label="Logo" htmlFor="b-logo" className="sm:col-span-2" hint="PNG, JPG, WEBP or SVG up to 2 MB. A square mark works best.">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-14 items-center justify-center overflow-hidden rounded-lg border bg-white dark:border-slate-700">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="Company logo" className="size-full object-contain p-1" />
                  ) : (
                    <Image className="size-6 text-slate-300" aria-hidden />
                  )}
                </span>
                <input
                  ref={fileRef}
                  id="b-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024) toast.error('That file is larger than 2 MB');
                      else upload.mutate(file);
                    }
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="secondary"
                  leftIcon={<Upload className="size-4" />}
                  loading={upload.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {form.logo_url ? 'Replace logo' : 'Upload logo'}
                </Button>
                {form.logo_url && (
                  <Button
                    variant="ghost"
                    leftIcon={<Trash2 className="size-4" />}
                    onClick={() => setForm({ ...form, logo_url: null })}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </Field>
          </div>

          {/* live preview */}
          <div className="rounded-panel border p-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold text-slate-500 uppercase">Preview</p>
            <div className="overflow-hidden rounded-lg" style={{ background: ramp['950'] ?? '#07291a' }}>
              <div className="h-1 w-full bg-[linear-gradient(90deg,#ce1126_0_33%,#fcd116_33%_66%,#006b3f_66%)]" />
              <div className="flex items-center gap-2.5 p-3">
                <span className="flex size-9 items-center justify-center overflow-hidden rounded-lg bg-white/95">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="" className="size-full object-contain p-0.5" />
                  ) : (
                    <Sparkles className="size-5 text-slate-400" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-white">{form.app_name || 'Your company'}</span>
                  <span className="block truncate text-[11px] text-white/70">{form.tagline}</span>
                </span>
              </div>
              <div className="space-y-1 px-3 pb-3">
                {['Dashboard', 'All Tickets', 'Debtor Lists'].map((item, i) => (
                  <span
                    key={item}
                    className={cn(
                      'block rounded-md px-2.5 py-1.5 text-xs font-medium text-white/70',
                      i === 0 && 'bg-white/10 text-white',
                    )}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className="rounded-control px-3 py-1.5 text-sm font-medium"
                style={{ background: ramp['700'] ?? '#14663e', color: contrastText(form.primary_color) }}
              >
                Primary button
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: form.accent_color, color: contrastText(form.accent_color) }}
              >
                Accent
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="AI resolution assistant"
          description="Optional. Without a key the assistant still shows how similar tickets were resolved; with one it also drafts a response. Deploy the ai-assist edge function first."
          actions={
            <Button leftIcon={<Save className="size-4" />} loading={saveAi.isPending} onClick={() => saveAi.mutate({ ...ai })}>
              Save AI settings
            </Button>
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2">
            <Switch
              label="AI suggestions are on"
              checked={ai.enabled}
              onChange={(value) => setAi({ ...ai, enabled: value })}
            />
          </div>
          <Field label="Provider" htmlFor="ai-provider">
            <Select
              id="ai-provider"
              clearable={false}
              value={ai.provider}
              onChange={(e) =>
                setAi({
                  ...ai,
                  provider: e.target.value,
                  model: e.target.value === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-latest',
                })
              }
              options={[
                { value: 'anthropic', label: 'Anthropic (Claude)' },
                { value: 'openai', label: 'OpenAI' },
              ]}
            />
          </Field>
          <Field label="Model" htmlFor="ai-model">
            <Input id="ai-model" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
          </Field>
          <Field label="API key" htmlFor="ai-key" className="sm:col-span-2">
            <Input
              id="ai-key"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              value={ai.api_key}
              onChange={(e) => setAi({ ...ai, api_key: e.target.value })}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showKey ? 'Hide the key' : 'Show the key'}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />
          </Field>
          <Field label="Past tickets to learn from" htmlFor="ai-similar" hint="How many similar resolved tickets are sent with each request.">
            <Input
              id="ai-similar"
              inputMode="numeric"
              value={String(ai.max_similar)}
              onChange={(e) => setAi({ ...ai, max_similar: Math.min(15, Number(e.target.value.replace(/\D/g, '') || 0)) })}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
