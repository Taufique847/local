import React from 'react';
import { cn } from '@/lib/utils';
import { ConnectionStatus } from '@/types';

interface StatusIndicatorProps {
  status: ConnectionStatus | 'running' | 'idle';
  className?: string;
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  const getStyles = () => {
    switch (status) {
      case 'connected':
      case 'running':
        return {
          container: 'bg-emerald-500/20',
          dot: 'bg-emerald-500',
          pulse: 'bg-emerald-400',
        };
      case 'checking':
        return {
          container: 'bg-amber-500/20',
          dot: 'bg-amber-500',
          pulse: 'bg-amber-400',
        };
      case 'disconnected':
        return {
          container: 'bg-rose-500/20',
          dot: 'bg-rose-500',
          pulse: 'bg-rose-400',
        };
      default:
        return {
          container: 'bg-slate-500/20',
          dot: 'bg-slate-400',
          pulse: 'bg-slate-400',
        };
    }
  };

  const { container, dot, pulse } = getStyles();

  return (
    <span className={cn('relative flex h-3 w-3 items-center justify-center', className)}>
      <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', pulse)} />
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dot)} />
    </span>
  );
}
