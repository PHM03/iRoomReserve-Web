'use client';

import StatusBadge from '@/components/StatusBadge';
import { getFloorDisplayLabel } from '@/lib/floorLabels';
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
    case 'Occupied':
    case 'Unavailable':
      return 'border-red-500/45';
    default:
      return 'border-dark/10';
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
      <div className="rounded-2xl border border-dark/10 bg-dark/5 p-6 text-center">
        <p className="text-sm text-black">
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
              <h3 className="text-lg font-bold text-black">{item.room.name}</h3>
              <p className="text-sm text-black">
                {getFloorDisplayLabel(item.room.floor, {
                  id: item.room.buildingId,
                  name: item.room.buildingName,
                })} | Capacity {item.room.capacity}
              </p>
            </div>
            <StatusBadge status={item.resolved.status} />
          </div>

          <p className="text-sm text-black mt-3">{item.resolved.detail}</p>

          <div className="mt-4 pt-4 border-t border-dark/5 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-black uppercase tracking-wide">Type</p>
              <p className="text-black mt-1">{item.room.roomType}</p>
            </div>
            <div>
              <p className="text-black uppercase tracking-wide">Cooling</p>
              <p className="text-black mt-1">{item.room.acStatus}</p>
            </div>
            <div>
              <p className="text-black uppercase tracking-wide">Display</p>
              <p className="text-black mt-1">
                {item.room.tvProjectorStatus}
              </p>
            </div>
            <div>
              <p className="text-black uppercase tracking-wide">Reserved By</p>
              <p className="text-black mt-1">{getReservationMeta(item)}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
