import { CalendarDays } from 'lucide-react';
import { RANGE_PRESETS, rangeLabel, type DateRangeValue, type RangePreset } from '@/utils/dateRange';
import { cn } from '@/utils/cn';
import { controlBase } from './Field';

export function DateRangePicker({
  value,
  onChange,
  className,
  presets = RANGE_PRESETS.map((p) => p.value),
  id = 'date-range',
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
  presets?: RangePreset[];
  id?: string;
}) {
  const options = RANGE_PRESETS.filter((p) => presets.includes(p.value));
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
        <select
          id={id}
          aria-label="Date range"
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as RangePreset;
            onChange(preset === 'custom' ? { preset, from: value.from, to: value.to } : { preset });
          }}
          className={cn(controlBase, 'h-9 w-auto appearance-none pr-8 pl-8')}
        >
          {options.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {value.preset === 'custom' ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From date"
            value={value.from ?? ''}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={cn(controlBase, 'h-9 w-auto')}
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            aria-label="To date"
            value={value.to ?? ''}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={cn(controlBase, 'h-9 w-auto')}
          />
        </div>
      ) : (
        <span className="hidden text-xs text-slate-500 tabular-nums sm:inline dark:text-slate-400">{rangeLabel(value)}</span>
      )}
    </div>
  );
}
