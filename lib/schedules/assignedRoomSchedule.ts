import type { Room } from '@/lib/rooms/rooms';

export function getAssignedRoomDisplayLabel(room: Room): string {
  const buildingLabel = room.buildingName.trim() || room.buildingId;
  const floorLabel = room.floor.trim();

  return `${room.name}${floorLabel ? ` · ${floorLabel}` : ''} — ${buildingLabel}`;
}
