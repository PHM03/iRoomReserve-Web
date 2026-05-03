'use client';

import React from 'react';

export type StatusBadgeValue =
  | 'Available'
  | 'Reserved'
  | 'Unavailable'
  | 'Occupied'
  | 'Vacant'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'open'
  | 'responded'
  | 'closed'
  | 'Connected'
  | 'Disconnected'
  | 'Connecting...'
  | string;

interface StatusBadgeProps {
  status: StatusBadgeValue;
  className?: string;
}

function getBadgeStyle(status: string): string {
  switch (status) {
    case 'Available':
    case 'open':
      return 'ui-badge-green';
    case 'Reserved':
      return 'ui-badge-blue';
    case 'Occupied':
    case 'Unavailable':
      return 'ui-badge-red';
    case 'approved':
    case 'responded':
    case 'Connected':
      return 'ui-badge-green';
    case 'pending':
      return 'ui-badge-yellow';
    case 'Connecting...':
      return 'ui-badge-orange';
    case 'completed':
      return 'ui-badge-blue';
    case 'rejected':
    case 'Disconnected':
      return 'ui-badge-red';
    case 'cancelled':
    case 'closed':
    case 'Vacant':
      return 'ui-badge-gray';
    default:
      return 'ui-badge-gray';
  }
}

function getBadgeLabel(status: string): string {
  switch (status) {
    case 'Occupied':
      return 'Occupied';
    case 'Vacant':
      return 'Available';
    default:
      return status === status.toLowerCase()
        ? status.charAt(0).toUpperCase() + status.slice(1)
        : status;
  }
}

const StatusBadge: React.FC<Readonly<StatusBadgeProps>> = ({ status, className = '' }) => {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border leading-5 ${getBadgeStyle(status)} ${className}`.trim()}
    >
      {getBadgeLabel(status)}
    </span>
  );
};

export default StatusBadge;
