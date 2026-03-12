'use client';

import React from 'react';

export type Status = 'Available' | 'Reserved' | 'Occupied' | 'Vacant';

interface StatusBadgeProps {
  status: Status;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'Available':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'Reserved':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Occupied':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'Vacant':
        return 'bg-white/10 text-white/50 border-white/20';
      default:
        return 'bg-white/10 text-white/50 border-white/20';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusStyles()}`}>
      {status}
    </span>
  );
};

export default StatusBadge;
