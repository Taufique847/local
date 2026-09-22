import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  /** Id of the element describing this field (usually the error message). */
  describedBy?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, describedBy, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    return (
      <input
        type={type}
        // Screen readers need the invalid state and the error text association;
        // previously the component accepted an `error` prop but exposed neither.
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy ?? ariaDescribedBy}
        className={cn(
          'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-2xs',
          error ? 'border-rose-400 focus-visible:ring-rose-500' : 'border-slate-300',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
