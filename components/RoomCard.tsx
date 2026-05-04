'use client';

import React from 'react';

interface RoomCardProps {
  availability: 'Available' | 'Occupied';
  buildingName?: string;
  campusName: string;
  disabled?: boolean;
  floor: string;
  name: string;
  onClick?: () => void;
  roomType: string;
}

function getAccentClass(availability: RoomCardProps['availability']) {
  return availability === 'Available'
    ? 'border-green-500/45'
    : 'border-orange-500/45';
}

function getAvailabilityClass(availability: RoomCardProps['availability']) {
  return availability === 'Available' ? 'ui-badge-green' : 'ui-badge-orange';
}

export default function RoomCard({
  availability,
  buildingName,
  campusName,
  disabled = false,
  floor,
  name,
  onClick,
  roomType,
}: Readonly<RoomCardProps>) {
  const isAvailable = availability === 'Available';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`glass-card w-full border-l-4 p-5 text-left transition-all ${getAccentClass(
        availability
      )} ${
        disabled
          ? 'cursor-not-allowed opacity-80 hover:translate-y-0 hover:!border-dark/10 hover:!shadow-none'
          : 'cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-black">{name}</h3>
          <p className="mt-1 text-xs text-black">
            {[buildingName, floor].filter(Boolean).join(' | ')}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${getAvailabilityClass(
            availability
          )}`}
        >
          {availability}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="uppercase tracking-wide text-black">Type</p>
          <p className="mt-1 text-sm text-black">{roomType || 'Room'}</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-black">Campus</p>
          <p className="mt-1 text-sm text-black">{campusName}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-dark/5 pt-4">
        <span
          className={`text-sm font-bold transition-colors ${
            isAvailable ? 'text-primary hover:text-primary-hover' : 'text-black/60'
          }`}
        >
          {isAvailable ? 'View reservation details' : 'Currently occupied'}
        </span>
      </div>
    </button>
  );
}
