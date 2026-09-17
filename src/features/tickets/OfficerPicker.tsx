import { useMemo, useState } from 'react';
import { MapPin, Search, Sparkles, UserX } from 'lucide-react';
import { useOfficerWorkload } from '@/hooks/useLookups';
import { officersService } from '@/services/officers';
import { Avatar, Badge, Button, Input, Skeleton } from '@/components/ui';
import { cn } from '@/utils/cn';

/**
 * Workload-aware officer picker. Shows each officer's open / in-progress /
 * overdue counts and suggests the least-loaded officer (same region first).
 */
export function OfficerPicker({
  value,
  onChange,
  region,
  allowUnassigned = true,
  compact,
}: {
  value: string;
  onChange: (officerId: string) => void;
  region?: string | null;
  allowUnassigned?: boolean;
  compact?: boolean;
}) {
  const { data: workload = [], isLoading } = useOfficerWorkload();
  const [q, setQ] = useState('');
  const suggestion = useMemo(() => officersService.suggest(workload, region), [workload, region]);

  const list = workload
    .filter((w) => w.is_active || w.id === value)
    .filter((w) => !q || w.full_name.toLowerCase().includes(q.toLowerCase()) || (w.region ?? '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const ar = region && a.region === region ? 0 : 1;
      const br = region && b.region === region ? 0 : 1;
      return ar - br || a.full_name.localeCompare(b.full_name);
    });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {workload.length > 6 && (
          <Input
            aria-label="Filter officers"
            leftIcon={<Search />}
            placeholder="Filter officers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
          />
        )}
        {suggestion && suggestion.id !== value && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Sparkles className="size-3.5 text-gold-500" />}
            onClick={() => onChange(suggestion.id)}
          >
            Suggest: {suggestion.full_name}
            <span className="text-xs font-normal opacity-70">
              ({suggestion.open_count + suggestion.in_progress_count} active)
            </span>
          </Button>
        )}
      </div>
      <div role="radiogroup" aria-label="Officer" className={cn('grid gap-2', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3')}>
        {allowUnassigned && (
          <OptionCard selected={value === ''} onSelect={() => onChange('')}>
            <span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
              <UserX className="size-4" />
            </span>
            <span className="text-sm font-medium">Unassigned</span>
          </OptionCard>
        )}
        {list.map((w) => {
          const active = w.open_count + w.in_progress_count;
          return (
            <OptionCard key={w.id} selected={value === w.id} onSelect={() => onChange(w.id)}>
              <Avatar name={w.full_name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{w.full_name}</span>
                  {!w.is_active && <Badge>inactive</Badge>}
                  {suggestion?.id === w.id && <Sparkles className="size-3.5 shrink-0 text-gold-500" aria-label="Suggested" />}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                  {w.region && (
                    <span className={cn('inline-flex items-center gap-0.5', region && w.region === region && 'font-medium text-brand-700 dark:text-brand-400')}>
                      <MapPin className="size-3" />
                      {w.region}
                    </span>
                  )}
                  <span className="tabular-nums">
                    {w.open_count} open · {w.in_progress_count} in progress
                  </span>
                  {w.overdue_count > 0 && <span className="font-medium text-rose-600 tabular-nums">{w.overdue_count} overdue</span>}
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800" aria-hidden>
                  <span
                    className={cn('block h-full rounded', active > 15 ? 'bg-rose-500' : active > 8 ? 'bg-amber-500' : 'bg-brand-500')}
                    style={{ width: `${Math.min(100, (active / 20) * 100)}%` }}
                  />
                </span>
              </span>
            </OptionCard>
          );
        })}
      </div>
      {list.length === 0 && <p className="text-sm text-slate-500">No officers found. An administrator can add officers.</p>}
    </div>
  );
}

function OptionCard({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition',
        selected
          ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/15 dark:border-brand-500 dark:bg-brand-500/10'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900',
      )}
    >
      {children}
    </button>
  );
}
