import * as React from 'react';
import { cn } from '../../lib/utils';

export type StatusIndicatorStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type StatusIndicatorSize = 'sm' | 'md' | 'lg';

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: StatusIndicatorStatus;
  label?: React.ReactNode | null;
  size?: StatusIndicatorSize;
  ariaLabel?: string;
}

const STATUS_CONFIG: Record<
  StatusIndicatorStatus,
  {
    label: string;
    dotColor: string;
    textColor: string;
  }
> = {
  connected: {
    label: 'Connected',
    dotColor: 'bg-emerald-400',
    textColor: 'text-emerald-300',
  },
  connecting: {
    label: 'Connecting',
    dotColor: 'bg-sky-400',
    textColor: 'text-sky-300',
  },
  disconnected: {
    label: 'Disconnected',
    dotColor: 'bg-slate-400',
    textColor: 'text-slate-400',
  },
  error: {
    label: 'Error',
    dotColor: 'bg-rose-400',
    textColor: 'text-rose-300',
  },
};

const SIZE_CONFIG: Record<
  StatusIndicatorSize,
  {
    dot: string;
    text: string;
    gap: string;
  }
> = {
  sm: {
    dot: 'h-2 w-2',
    text: 'text-xs',
    gap: 'gap-1.5',
  },
  md: {
    dot: 'h-2.5 w-2.5',
    text: 'text-sm',
    gap: 'gap-2',
  },
  lg: {
    dot: 'h-3 w-3',
    text: 'text-base',
    gap: 'gap-2.5',
  },
};

export const StatusIndicator = React.forwardRef<HTMLDivElement, StatusIndicatorProps>(
  ({ status, label, size = 'md', ariaLabel, className, ...props }, ref) => {
    const config = STATUS_CONFIG[status];
    const sizeConfig = SIZE_CONFIG[size];
    const displayLabel = label === undefined ? config.label : label;
    const accessibleLabel = ariaLabel ?? (typeof displayLabel === 'string' ? displayLabel : config.label);

    const isAnimated = status === 'connecting';

    return (
      <div
        ref={ref}
        role="status"
        aria-label={accessibleLabel}
        className={cn('inline-flex items-center', sizeConfig.gap, className)}
        {...props}
      >
        <span className="relative inline-flex">
          {/* Pulse animation for connecting state */}
          {isAnimated && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                config.dotColor
              )}
            />
          )}
          {/* Status dot */}
          <span
            className={cn(
              'relative inline-flex rounded-full',
              sizeConfig.dot,
              config.dotColor
            )}
          />
        </span>
        
        {/* Label */}
        {displayLabel !== null && displayLabel !== undefined && (
          <span className={cn('font-medium', sizeConfig.text, config.textColor)}>
            {displayLabel}
          </span>
        )}
      </div>
    );
  }
);
StatusIndicator.displayName = 'StatusIndicator';
