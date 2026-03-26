'use client';

import StatusBadge from '@/components/StatusBadge';
import type { RoomStatusValue } from '@/lib/roomStatus';
import type { RoomStatusViewItem } from '@/lib/roomStatusView';

interface RoomListProps {
  items: RoomStatusViewItem[];
}

function getAccentClass(status: RoomStatusValue) {
  switch (status) {
    case 'Available':
      return 'border-green-500/45';
    case 'Reserved':
      return 'border-blue-500/45';
    case 'Ongoing':
      return 'border-orange-500/45';
    case 'Unavailable':
      return 'border-red-500/45';
    default:
      return 'border-white/10';
  }
}

function getReservationMeta(item: RoomStatusViewItem) {
  if (item.resolved.reservation?.userName) {
    return item.resolved.reservation.userName;
  }

  return 'No active reservation';
}

export default function RoomList({ items }: RoomListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm text-white/40">
          No rooms are configured for this floor yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((item) => (
        <article
          key={item.room.id}
          className={`glass-card p-5 border-l-4 ${getAccentClass(
            item.resolved.status
          )}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">{item.room.name}</h3>
              <p className="text-sm text-white/40">
                {item.room.floor} | Capacity {item.room.capacity}
              </p>
            </div>
            <StatusBadge status={item.resolved.status} />
          </div>

          <p className="text-sm text-white/55 mt-3">{item.resolved.detail}</p>

          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-white/25 uppercase tracking-wide">Type</p>
              <p className="text-white/60 mt-1">{item.room.roomType}</p>
            </div>
            <div>
              <p className="text-white/25 uppercase tracking-wide">Cooling</p>
              <p className="text-white/60 mt-1">{item.room.acStatus}</p>
            </div>
            <div>
              <p className="text-white/25 uppercase tracking-wide">Display</p>
              <p className="text-white/60 mt-1">
                {item.room.tvProjectorStatus}
              </p>
            </div>
            <div>
              <p className="text-white/25 uppercase tracking-wide">Reserved By</p>
              <p className="text-white/60 mt-1">{getReservationMeta(item)}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
