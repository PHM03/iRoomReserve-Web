export type PublicRoomReservationStatus = "approved" | "pending";

export interface PublicRoomReservation {
  buildingId: string;
  date: string;
  endTime: string;
  hasActiveCheckIn: boolean;
  id: string;
  isCurrentUser: boolean;
  roomId: string;
  roomName: string;
  startTime: string;
  status: PublicRoomReservationStatus;
}

export function sanitizeRoomReservation(
  data: Record<string, unknown>,
  currentUserId: string
): PublicRoomReservation | null {
  if (
    (data.status !== "approved" && data.status !== "pending") ||
    typeof data.roomId !== "string" ||
    typeof data.date !== "string" ||
    typeof data.startTime !== "string" ||
    typeof data.endTime !== "string"
  ) {
    return null;
  }

  const roomId = data.roomId;
  const date = data.date;
  const startTime = data.startTime;
  const status = data.status;

  return {
    id: `${roomId}_${date}_${startTime}_${status}`,
    buildingId: typeof data.buildingId === "string" ? data.buildingId : "",
    date,
    endTime: data.endTime,
    hasActiveCheckIn: Boolean(data.checkedInAt) && !data.occupancyReleasedAt,
    isCurrentUser: data.userId === currentUserId,
    roomId,
    roomName: typeof data.roomName === "string" ? data.roomName : roomId,
    startTime,
    status,
  };
}
