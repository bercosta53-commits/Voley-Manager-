import { cn } from '@/lib/utils';

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'vr-data inline-flex h-5 min-w-5 items-center justify-center rounded-chip border border-border bg-muted px-1 text-[11px] font-medium text-text-3',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
