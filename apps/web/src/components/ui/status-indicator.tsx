import * as React from 'react';
import { motion } from 'framer-motion';

import { cn } from '../../lib/utils';

export type StatusIndicatorStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type StatusIndicatorSize = 'sm' | 'md' | 'lg';

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: StatusIndicatorStatus;
  /**
   * Overrides the default status label. Pass `null` to hide the text label entirely.
   */
  label?: React.ReactNode | null;
  size?: StatusIndicatorSize;
  /**
   * Override the status icon that is rendered inside the indicator.
   */
  icon?: React.ReactNode;
  /**
   * Optional accessible label. Defaults to the visible label or built-in status text.
   */
  ariaLabel?: string;
}

const STATUS_CONFIG: Record<
  StatusIndicatorStatus,
  {
    label: string;
    base: string;
    ring: string;
    glow: string;
    pulse: boolean;
    icon: (className: string) => React.ReactNode;
  }
> = {
  connected: {
    label: 'Connected',
    base: 'bg-emerald-500',
    ring: 'bg-emerald-400/40',
    glow: 'rgba(16,185,129,0.45)',
    pulse: true,
    icon: className => (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 13.5L9.25 17.75L19 8" />
      </svg>
    ),
  },
  connecting: {
    label: 'Connecting',
    base: 'bg-sky-500',
    ring: 'bg-sky-400/40',
    glow: 'rgba(14,165,233,0.45)',
    pulse: true,
    icon: className => (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 4a8 8 0 0 1 5.657 13.657" opacity={0.7} />
        <path d="M12 20a8 8 0 0 1-5.657-13.657" opacity={0.4} />
      </svg>
    ),
  },
  disconnected: {
    label: 'Disconnected',
    base: 'bg-slate-400',
    ring: 'bg-slate-300/40',
    glow: 'rgba(148,163,184,0.4)',
    pulse: false,
    icon: className => (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 7V4a1 1 0 0 1 1-1h2" opacity={0.8} />
        <path d="M18 17v3a1 1 0 0 1-1 1h-2" opacity={0.8} />
        <path d="M9 11h4" />
        <path d="M15 13V9a2 2 0 0 0-2-2h-1" opacity={0.7} />
        <path d="M4 4l16 16" />
      </svg>
    ),
  },
  error: {
    label: 'Connection Error',
    base: 'bg-rose-500',
    ring: 'bg-rose-400/40',
    glow: 'rgba(244,63,94,0.5)',
    pulse: true,
    icon: className => (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 7v6" />
        <path d="M12 17h.01" />
        <path d="M10.29 3.86 2.82 17.14A2 2 0 0 0 4.58 20h14.84a2 2 0 0 0 1.76-2.86L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
    ),
  },
};

const SIZE_STYLES: Record<
  StatusIndicatorSize,
  {
    container: string;
    indicator: string;
    iconWrapper: string;
    icon: string;
    label: string;
    gap: string;
    glowRadius: string;
  }
> = {
  sm: {
    container: 'h-6 w-6',
    indicator: 'h-3.5 w-3.5',
    iconWrapper: 'h-3.5 w-3.5',
    icon: 'h-3 w-3',
    label: 'text-xs',
    gap: 'gap-1.5',
    glowRadius: '12px',
  },
  md: {
    container: 'h-9 w-9',
    indicator: 'h-5 w-5',
    iconWrapper: 'h-5 w-5',
    icon: 'h-4 w-4',
    label: 'text-sm',
    gap: 'gap-2',
    glowRadius: '18px',
  },
  lg: {
    container: 'h-11 w-11',
    indicator: 'h-6 w-6',
    iconWrapper: 'h-6 w-6',
    icon: 'h-5 w-5',
    label: 'text-base',
    gap: 'gap-3',
    glowRadius: '24px',
  },
};

export const StatusIndicator = React.forwardRef<HTMLDivElement, StatusIndicatorProps>(
  (
    {
      status,
      label,
      size = 'md',
      icon,
      ariaLabel,
      className,
      ...props
    },
    ref
  ) => {
    const config = STATUS_CONFIG[status];
    const sizeStyle = SIZE_STYLES[size];
    const labelContent = label === undefined ? config.label : label;
    const accessibleLabel =
      ariaLabel ??
      (typeof labelContent === 'string' && labelContent.length > 0
        ? labelContent
        : config.label);

    return (
      <div
        ref={ref}
        role="status"
        aria-label={accessibleLabel}
        className={cn('inline-flex items-center transition-colors duration-300', sizeStyle.gap, className)}
        {...props}
      >
        <span
          className={cn(
            'relative inline-flex items-center justify-center',
            sizeStyle.container
          )}
          aria-hidden="true"
        >
          {config.pulse && (
            <motion.span
              className={cn('absolute rounded-full', sizeStyle.container, config.ring)}
              style={{ boxShadow: `0 0 ${sizeStyle.glowRadius} ${config.glow}` }}
              animate={{ scale: [1, 1.35], opacity: [0.45, 0] }}
              transition={{ repeat: Infinity, duration: status === 'connecting' ? 1.3 : 1.8, ease: 'easeOut' }}
            />
          )}
          <motion.span
            className={cn(
              'relative inline-flex items-center justify-center rounded-full text-white shadow-sm',
              sizeStyle.indicator,
              config.base
            )}
            style={{ boxShadow: `0 0 ${sizeStyle.glowRadius} ${config.glow}` }}
            animate={
              config.pulse
                ? { scale: [1, 1.05, 1], opacity: [1, 0.94, 1] }
                : { scale: 1, opacity: 1 }
            }
            transition={
              config.pulse
                ? { repeat: Infinity, repeatType: 'mirror', duration: 1.6, ease: 'easeInOut' }
                : undefined
            }
          >
            <motion.span
              className={cn('flex items-center justify-center text-white', sizeStyle.iconWrapper)}
              animate={status === 'connecting' ? { rotate: [0, 360] } : undefined}
              transition={
                status === 'connecting'
                  ? { repeat: Infinity, duration: 1.4, ease: 'linear' }
                  : undefined
              }
            >
              {icon ?? config.icon(sizeStyle.icon)}
            </motion.span>
          </motion.span>
        </span>
        {labelContent !== null && labelContent !== undefined && (
          <span className={cn('font-medium text-slate-700', sizeStyle.label)}>{labelContent}</span>
        )}
      </div>
    );
  }
);
StatusIndicator.displayName = 'StatusIndicator';
