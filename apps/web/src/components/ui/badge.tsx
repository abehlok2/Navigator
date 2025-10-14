import * as React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'info' | 'muted' | 'success' | 'destructive';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-900 text-white',
  info: 'bg-sky-100 text-sky-700',
  muted: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  destructive: 'bg-rose-100 text-rose-700',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
