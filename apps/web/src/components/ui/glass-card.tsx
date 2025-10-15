import * as React from 'react';
import { cn } from '../../lib/utils';

export type GlassCardVariant = 'default' | 'elevated';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: GlassCardVariant;
  glowColor?: string;
}

const VARIANT_STYLES: Record<GlassCardVariant, string> = {
  default: 'bg-white/5 shadow-lg',
  elevated: 'bg-white/[0.07] shadow-xl',
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', glowColor, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // Base styles
        'rounded-2xl border border-white/10 backdrop-blur-sm',
        'transition-all duration-300 ease-out',
        // Variant styles
        VARIANT_STYLES[variant],
        // Custom class
        className
      )}
      {...props}
    />
  )
);
GlassCard.displayName = 'GlassCard';

export interface GlassCardSectionProps extends React.HTMLAttributes<HTMLDivElement> {}

export const GlassCardHeader = React.forwardRef<HTMLDivElement, GlassCardSectionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 py-5 border-b border-white/10', className)}
      {...props}
    />
  )
);
GlassCardHeader.displayName = 'GlassCardHeader';

export const GlassCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-xl font-semibold text-white', className)}
    {...props}
  />
));
GlassCardTitle.displayName = 'GlassCardTitle';

export const GlassCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-slate-400 mt-1', className)}
    {...props}
  />
));
GlassCardDescription.displayName = 'GlassCardDescription';

export const GlassCardContent = React.forwardRef<HTMLDivElement, GlassCardSectionProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-6 py-5', className)} {...props} />
  )
);
GlassCardContent.displayName = 'GlassCardContent';

export const GlassCardFooter = React.forwardRef<HTMLDivElement, GlassCardSectionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 py-4 border-t border-white/10', className)}
      {...props}
    />
  )
);
GlassCardFooter.displayName = 'GlassCardFooter';
