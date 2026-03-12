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
    <div className="glass-card p-5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">{name}</h3>
          <p className="text-sm text-white/40">{floor}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <button
        disabled={!isAvailable}
        className={`w-full py-2.5 px-4 rounded-xl font-bold transition-all ${
          isAvailable
            ? 'btn-primary'
            : 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10'
        }`}
      >
        Reserve
      </button>
    </div>
  );
};

export default RoomCard;
