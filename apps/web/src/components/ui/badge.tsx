import * as React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'info' | 'muted' | 'success' | 'warning' | 'destructive';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-900 border-slate-200',
  info: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  muted: 'bg-white/5 text-slate-400 border-white/10',
  success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  destructive: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-medium',
        'transition-colors duration-200',
        VARIANT_STYLES[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
