'use client';

import React from 'react';
import StatusBadge, { Status } from './StatusBadge';

interface RoomCardProps {
  name: string;
  floor: string;
  status: Status;
}

const RoomCard: React.FC<RoomCardProps> = ({ name, floor, status }) => {
  const isAvailable = status === 'Available';

  return (
    <div className="bg-white rounded-lg shadow-md p-5 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
          <p className="text-sm text-gray-500">{floor}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <button
        disabled={!isAvailable}
        className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
          isAvailable
            ? 'bg-red-700 text-white hover:bg-red-800'
            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
        }`}
      >
        Reserve
      </button>
    </div>
  );
};

export default RoomCard;
