'use client';

import FloorAccordion from '@/components/room-status/FloorAccordion';
import type { Room } from '@/lib/rooms';

interface AdminRoomStatusSectionProps {
  buildingName?: string;
  rooms: Room[];
  statusMonitorFloorGroups: Array<{
    floor: string;
    rooms: Room[];
  }>;
  computeEffectiveStatus: (room: Room) => {
    status: string;
    detail: string;
  };
  onStatusChange: (roomId: string, status: Room['status']) => void;
  className?: string;
}

function StatusBadge({ status }: { status: string }) {
  const style = (() => {
    switch (status) {
      case 'Ongoing':
        return 'ui-badge-orange';
      case 'Reserved':
        return 'ui-badge-blue';
      case 'Unavailable':
        return 'ui-badge-red';
      case 'Available':
        return 'ui-badge-green';
      default:
        return 'ui-badge-gray';
    }
  })();

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${style}`}
    >
      {status}
    </span>
  );
}

export default function AdminRoomStatusSection({
  buildingName,
  rooms,
  statusMonitorFloorGroups,
  computeEffectiveStatus,
  onStatusChange,
  className = '',
}: AdminRoomStatusSectionProps) {
  return (
    <section className={className}>
      <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30 inline-block mb-6">
        <h3 className="text-xl font-bold text-gray-800">
          Room Status Monitor
          {buildingName ? (
            <span className="text-sm text-gray-600 font-normal ml-2">({buildingName})</span>
          ) : null}
        </h3>
      </div>

      {rooms.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-sm text-black">No rooms configured. Add rooms first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {statusMonitorFloorGroups.map((floorGroup) => (
            <FloorAccordion
              key={floorGroup.floor}
              floor={floorGroup.floor}
              roomCount={floorGroup.rooms.length}
              renderContent={() => (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {floorGroup.rooms.map((room) => {
                    const effective = computeEffectiveStatus(room);
                    const statusBorder =
                      effective.status === 'Ongoing'
                        ? 'border-orange-500/40'
                        : effective.status === 'Reserved'
                          ? 'border-blue-500/40'
                          : effective.status === 'Unavailable'
                            ? 'border-red-500/40'
                            : 'border-green-500/40';

                    return (
                      <div key={room.id} className={`glass-card p-5 border-l-4 ${statusBorder}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="text-lg font-bold text-black">{room.name}</h4>
                            <p className="text-sm text-black">
                              {room.floor} | Cap: {room.capacity}
                            </p>
                          </div>
                          <StatusBadge status={effective.status} />
                        </div>
                        {effective.detail ? (
                          <p className="text-xs text-black mb-2">{effective.detail}</p>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-dark/5">
                          <button
                            onClick={() => onStatusChange(room.id, 'Available')}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                              room.status === 'Available'
                                ? 'ui-button-green'
                                : 'ui-button-gray'
                            }`}
                          >
                            Available
                          </button>
                          <button
                            onClick={() => onStatusChange(room.id, 'Reserved')}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                              room.status === 'Reserved'
                                ? 'ui-button-blue'
                                : 'ui-button-gray'
                            }`}
                          >
                            Reserved
                          </button>
                          <button
                            onClick={() => onStatusChange(room.id, 'Ongoing')}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                              room.status === 'Ongoing'
                                ? 'ui-button-orange'
                                : 'ui-button-gray'
                            }`}
                          >
                            Ongoing
                          </button>
                          <button
                            onClick={() => onStatusChange(room.id, 'Unavailable')}
                            className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                              room.status === 'Unavailable'
                                ? 'ui-button-red'
                                : 'ui-button-gray'
                            }`}
                          >
                            Unavailable
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
