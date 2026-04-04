'use client';

import React from 'react';

import { formatBleLabel } from '@/lib/bleMonitor';

interface BleStatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

function getBleBadgeTheme(status: string) {
  switch (status.trim().toUpperCase()) {
    case 'ONLINE':
    case 'CONNECTED':
      return {
        containerClassName:
          'border-green-500/25 bg-green-500/10 text-green-700',
        dotClassName: 'bg-green-500',
      };
    case 'OFFLINE':
    case 'DISCONNECTED':
      return {
        containerClassName: 'border-red-500/25 bg-red-500/10 text-red-700',
        dotClassName: 'bg-red-500',
      };
    case 'END_OF_RESERVATION':
      return {
        containerClassName:
          'border-yellow-500/25 bg-yellow-500/10 text-yellow-700',
        dotClassName: 'bg-yellow-500',
      };
    case 'INTERVAL':
      return {
        containerClassName: 'border-blue-500/25 bg-blue-500/10 text-blue-700',
        dotClassName: 'bg-blue-500',
      };
    default:
      return {
        containerClassName:
          'border-dark/15 bg-dark/5 text-black/70',
        dotClassName: 'bg-dark/45',
      };
  }
}

export default function BleStatusBadge({
  status,
  label,
  className = '',
}: BleStatusBadgeProps) {
  const theme = getBleBadgeTheme(status);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${theme.containerClassName} ${className}`.trim()}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${theme.dotClassName}`} />
      {label ?? formatBleLabel(status)}
    </span>
  );
}
