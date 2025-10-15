import * as React from 'react';

import { cn } from '../../lib/utils';

export type GlassCardVariant = 'default' | 'elevated' | 'interactive';
export type GlassCardGlowColor = 'purple' | 'blue' | 'green';
export type GlassCardAnimationState = 'enter' | 'exit' | 'idle';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: GlassCardVariant;
  glowColor?: GlassCardGlowColor;
  animationState?: GlassCardAnimationState;
}

const variantStyles: Record<GlassCardVariant, string> = {
  default: 'shadow-[0_24px_70px_-40px_rgba(15,23,42,0.85)]',
  elevated: 'bg-white/[0.06] border-white/15 shadow-[0_38px_120px_-48px_rgba(15,23,42,0.95)]',
  interactive:
    'bg-white/[0.05] cursor-pointer shadow-[0_30px_95px_-50px_rgba(15,23,42,0.8)] hover:-translate-y-1 hover:scale-[1.01] hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950/60',
};

const glowColorStyles: Record<GlassCardGlowColor, string> = {
  purple:
    'after:bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.28),transparent_60%)] group-hover:shadow-[0_52px_150px_-50px_rgba(139,92,246,0.85)]',
  blue:
    'after:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.32),transparent_60%)] group-hover:shadow-[0_52px_150px_-50px_rgba(59,130,246,0.82)]',
  green:
    'after:bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.3),transparent_60%)] group-hover:shadow-[0_52px_150px_-50px_rgba(16,185,129,0.78)]',
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      className,
      variant = 'default',
      glowColor = 'purple',
      animationState = 'enter',
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      data-state={animationState}
      className={cn(
        'group relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] text-slate-100 backdrop-blur-2xl',
        'transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-white/20',
        'p-6 sm:p-8',
        'before:pointer-events-none before:absolute before:inset-px before:-z-10 before:rounded-[inherit] before:bg-gradient-to-br before:from-white/15 before:via-white/5 before:to-transparent before:opacity-60 before:transition-opacity before:duration-700 before:ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:before:opacity-90',
        'after:pointer-events-none after:absolute after:-z-20 after:inset-[12%] after:rounded-full after:opacity-0 after:blur-[72px] after:transition-all after:duration-700 after:ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:after:opacity-100',
        'data-[state=enter]:animate-glass-card-in data-[state=exit]:animate-glass-card-out',
        variantStyles[variant],
        glowColorStyles[glowColor],
        className
      )}
      {...props}
    />
  )
);
GlassCard.displayName = 'GlassCard';

export type GlassCardSectionProps = React.HTMLAttributes<HTMLDivElement>;

export const GlassCardHeader = React.forwardRef<HTMLDivElement, GlassCardSectionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mb-4 flex flex-col gap-2 border-b border-white/5 pb-4 sm:mb-6 sm:pb-6',
        className
      )}
      {...props}
    />
  )
);
GlassCardHeader.displayName = 'GlassCardHeader';

export const GlassCardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-2xl', className)}
      {...props}
    />
  )
);
GlassCardTitle.displayName = 'GlassCardTitle';

export const GlassCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      'max-w-2xl text-sm text-slate-300 sm:text-base',
      className
    )}
    {...props}
  />
));
GlassCardDescription.displayName = 'GlassCardDescription';

export const GlassCardContent = React.forwardRef<HTMLDivElement, GlassCardSectionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-4 text-sm text-slate-200 sm:text-base', className)}
      {...props}
    />
  )
);
GlassCardContent.displayName = 'GlassCardContent';

export const GlassCardFooter = React.forwardRef<HTMLDivElement, GlassCardSectionProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4 sm:mt-6 sm:pt-6',
        className
      )}
      {...props}
    />
  )
);
GlassCardFooter.displayName = 'GlassCardFooter';
