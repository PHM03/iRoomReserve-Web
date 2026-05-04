'use client';

import { getFloorDisplayLabel } from '@/lib/floorLabels';
import type { Room } from '@/lib/rooms';

interface BeaconStatusSectionProps {
  buildingName?: string;
  rooms: Room[];
  title?: string;
}

function compareRooms(left: Room, right: Room) {
  return (
    left.floor.localeCompare(right.floor) || left.name.localeCompare(right.name)
  );
}

export default function BeaconStatusSection({
  buildingName,
  rooms,
  title = 'Beacon Status',
}: BeaconStatusSectionProps) {
  const sortedRooms = [...rooms].sort(compareRooms);
  const occupiedCount = rooms.filter((room) => room.beaconConnected).length;
  const availableCount = rooms.length - occupiedCount;

  return (
    <div className="glass-card p-5 mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-black">{title}</h3>
          <p className="text-sm text-black mt-1">
            Real-time BLE occupancy for{' '}
            <span className="ui-text-teal font-bold">
              {buildingName ?? 'the active building'}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-2 rounded-full border border-green-500/25 bg-green-500/10 px-3 py-1 ui-text-green">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            {occupiedCount} Occupied
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 ui-text-red">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            {availableCount} Available
          </span>
        </div>
      </div>

      {sortedRooms.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dark/10 bg-dark/5 p-6 text-center">
          <p className="text-sm text-black">
            No rooms are configured for beacon tracking yet.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sortedRooms.map((room) => {
            const isOccupied = room.beaconConnected === true;

            return (
              <div
                key={room.id}
                className="rounded-xl border border-dark/10 bg-dark/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-black">{room.name}</h4>
                    <p className="text-xs text-black mt-0.5">
                      {getFloorDisplayLabel(room.floor, {
                        id: room.buildingId,
                        name: room.buildingName,
                      })}
                      {room.beaconId ? ` | ${room.beaconId}` : ' | No beacon ID'}
                    </p>
                  </div>

                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${
                      isOccupied
                        ? 'border-green-500/30 bg-green-500/10 ui-text-green'
                        : 'border-red-500/30 bg-red-500/10 ui-text-red'
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isOccupied ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    {isOccupied ? 'Occupied' : 'Available'}
                  </div>
                </div>

                <p className="text-xs text-black mt-3">
                  {room.beaconId
                    ? isOccupied
                      ? `BLE connected${room.beaconDeviceName ? ` to ${room.beaconDeviceName}` : ''}.`
                      : `Waiting for ${room.beaconId} to connect.`
                    : 'Assign a beacon ID to enable Bluetooth room tracking.'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
