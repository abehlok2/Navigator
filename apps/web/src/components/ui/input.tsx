// Input Component
import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl border bg-transparent px-4 py-2 text-sm',
          'border-white/10 text-white placeholder:text-slate-500',
          'focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors duration-200',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

// Select Component
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full appearance-none rounded-xl border bg-transparent px-4 py-2 pr-10 text-sm',
        'border-white/10 text-white',
        'focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-colors duration-200',
        'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%23666\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

// Label Component
export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium text-slate-300',
        'cursor-pointer',
        className
      )}
      {...props}
    />
  )
);
Label.displayName = 'Label';
