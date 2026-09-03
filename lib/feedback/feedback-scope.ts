export const FEEDBACK_ANALYTICS_SCOPES = ['building', 'floor', 'room'] as const;

export type FeedbackAnalyticsScope = (typeof FEEDBACK_ANALYTICS_SCOPES)[number];

interface ScopeRoom {
  id: string;
  buildingId: string;
  floor: string;
}

interface FeedbackScopeOptions {
  buildingId: string;
  buildingIds?: readonly string[];
  floor?: string;
  roomId?: string;
  rooms: ScopeRoom[];
  scope: FeedbackAnalyticsScope;
}

export function scopeFeedback<T extends { buildingId?: string; roomId?: string }>(
  items: T[],
  { buildingId, buildingIds, floor = '', roomId = '', rooms, scope }: FeedbackScopeOptions,
) {
  const scopedBuildingIds = new Set(
    (buildingIds?.length ? buildingIds : [buildingId]).filter(Boolean),
  );
  const buildingItems = items.filter((item) => item.buildingId && scopedBuildingIds.has(item.buildingId));

  if (scope === 'building') {
    return buildingItems;
  }

  if (scope === 'floor') {
    const roomIds = new Set(
      rooms
        .filter((room) => scopedBuildingIds.has(room.buildingId) && room.floor === floor)
        .map((room) => room.id),
    );
    return buildingItems.filter((item) => item.roomId && roomIds.has(item.roomId));
  }

  const selectedRoom = rooms.find(
    (room) => scopedBuildingIds.has(room.buildingId) && room.id === roomId,
  );
  if (!selectedRoom) {
    return [];
  }

  return buildingItems.filter((item) => item.roomId === selectedRoom.id);
}
