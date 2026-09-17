import { cn } from '@/utils/cn';
import { initials } from '@/utils/format';

const COLORS = [
  'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200',
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sz = { xs: 'size-6 text-[10px]', sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-base' }[size];
  if (src) {
    return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', sz, className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        COLORS[hash(name ?? '?') % COLORS.length],
        sz,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
