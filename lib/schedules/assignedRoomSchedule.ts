import type { Room } from '@/lib/rooms/rooms';

export const ASSIGNED_ROOM_EMPTY_STATE =
  'No rooms have been assigned to your account yet.';

export function getAssignedRoomOptions(
  rooms: Room[],
  assignedRoomIds: string[]
): Room[] {
  const assignedIds = new Set(assignedRoomIds.map((roomId) => roomId.trim()));

  return rooms
    .filter((room) => assignedIds.has(room.id))
    .sort(
      (left, right) =>
        left.buildingName.localeCompare(right.buildingName) ||
        left.floor.localeCompare(right.floor) ||
        left.name.localeCompare(right.name, undefined, { numeric: true })
    );
}

export function getAssignedRoomDisplayLabel(room: Room): string {
  const buildingLabel = room.buildingName.trim() || room.buildingId;
  const floorLabel = room.floor.trim();

  return `${room.name}${floorLabel ? ` · ${floorLabel}` : ''} — ${buildingLabel}`;
}
