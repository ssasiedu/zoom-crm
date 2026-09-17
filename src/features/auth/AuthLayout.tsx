import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/Logo';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #fcd116 0 12px, transparent 12px 24px), repeating-linear-gradient(-45deg, #ffffff 0 12px, transparent 12px 24px)',
          }}
          aria-hidden
        />
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full bg-brand-700/40 blur-3xl" aria-hidden />
        <Logo className="relative" />
        <div className="relative max-w-md">
          <p className="text-sm font-semibold tracking-widest text-gold-400 uppercase">Customer service · Debt management</p>
          <h2 className="mt-3 text-3xl leading-tight font-bold text-white">
            Every client issue, tracked from first call to closed — across all 16 regions.
          </h2>
          <p className="mt-4 text-brand-200/80">
            Log inbound calls, WhatsApp messages and walk-ins, assign them to DM officers, and watch SLAs in real time.
          </p>
        </div>
        <div className="relative h-1 w-40 rounded bg-[linear-gradient(90deg,#ce1126_0_33%,#fcd116_33%_66%,#006b3f_66%)]" aria-hidden />
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="inline-flex rounded-xl bg-brand-950 p-2 pr-4">
              <Logo />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
