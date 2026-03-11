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
        return 'bg-green-100 text-green-800';
      case 'Reserved':
        return 'bg-blue-100 text-blue-800';
      case 'Occupied':
        return 'bg-orange-100 text-orange-800';
      case 'Vacant':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusStyles()}`}>
      {status}
    </span>
  );
};

export default StatusBadge;
