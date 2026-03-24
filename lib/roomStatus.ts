import { Timestamp } from "firebase/firestore";

export const ROOM_STATUS_VALUES = ["Available", "Reserved", "Ongoing"] as const;
export const ROOM_CHECK_IN_METHODS = ["manual", "ble"] as const;

export type RoomStatus = (typeof ROOM_STATUS_VALUES)[number];
export type RoomStatusValue = RoomStatus | "Unavailable";
export type RoomCheckInMethod = (typeof ROOM_CHECK_IN_METHODS)[number];

export interface RoomStatusRoomLike {
  id: string;
  status?: string | null;
  activeReservationId?: string | null;
}

export interface RoomStatusReservationLike {
  id: string;
  roomId: string;
  userId?: string;
  userName?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  checkedInAt?: Timestamp | null;
  checkInMethod?: RoomCheckInMethod | null;
}

export interface RoomStatusScheduleLike {
  roomId: string;
  subjectName?: string;
}

export interface ResolvedRoomStatus {
  status: RoomStatusValue;
  reservation: RoomStatusReservationLike | null;
  detail: string;
}

export function normalizeRoomStatus(status?: string | null): RoomStatusValue {
  switch (status) {
    case "Reserved":
      return "Reserved";
    case "Ongoing":
    case "Occupied":
      return "Ongoing";
    case "Unavailable":
      return "Unavailable";
    default:
      return "Available";
  }
}

export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCurrentTimeString(date: Date = new Date()): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function compareReservationSchedule(
  left: Pick<RoomStatusReservationLike, "id" | "date" | "startTime" | "endTime">,
  right: Pick<RoomStatusReservationLike, "id" | "date" | "startTime" | "endTime">
): number {
  return (
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.endTime.localeCompare(right.endTime) ||
    left.id.localeCompare(right.id)
  );
}

export function isReservationScheduledForToday(
  reservation: Pick<RoomStatusReservationLike, "date">,
  now: Date = new Date()
): boolean {
  return reservation.date === getLocalDateString(now);
}

export function canReservationCheckIn(
  reservation: Pick<RoomStatusReservationLike, "status" | "date" | "checkedInAt">,
  now: Date = new Date()
): boolean {
  return (
    reservation.status === "approved" &&
    !reservation.checkedInAt &&
    isReservationScheduledForToday(reservation, now)
  );
}

export function formatReservationWindow(
  reservation: Pick<RoomStatusReservationLike, "date" | "startTime" | "endTime">
): string {
  return `${reservation.date} | ${reservation.startTime} - ${reservation.endTime}`;
}

export function getPrimaryRoomReservation(
  room: RoomStatusRoomLike,
  reservations: RoomStatusReservationLike[],
  now: Date = new Date()
): RoomStatusReservationLike | null {
  const approvedReservations = reservations
    .filter(
      (reservation) =>
        reservation.roomId === room.id && reservation.status === "approved"
    )
    .sort(compareReservationSchedule);

  if (approvedReservations.length === 0) {
    return null;
  }

  if (room.activeReservationId) {
    const activeReservation = approvedReservations.find(
      (reservation) => reservation.id === room.activeReservationId
    );

    if (activeReservation) {
      return activeReservation;
    }
  }

  const checkedInReservation = approvedReservations.find((reservation) =>
    Boolean(reservation.checkedInAt)
  );

  if (checkedInReservation) {
    return checkedInReservation;
  }

  const today = getLocalDateString(now);
  const currentTime = getCurrentTimeString(now);
  const currentReservation = approvedReservations.find(
    (reservation) =>
      reservation.date === today &&
      reservation.startTime <= currentTime &&
      reservation.endTime > currentTime
  );

  return currentReservation ?? approvedReservations[0] ?? null;
}

export function getReservationRoomStatus(
  reservation: Pick<
    RoomStatusReservationLike,
    "id" | "status" | "date" | "checkedInAt"
  >,
  room?: RoomStatusRoomLike | null
): RoomStatusValue {
  if (reservation.checkedInAt) {
    return "Ongoing";
  }

  const roomStatus = normalizeRoomStatus(room?.status);

  if (roomStatus === "Unavailable") {
    return "Unavailable";
  }

  if (room?.activeReservationId === reservation.id) {
    return roomStatus;
  }

  return reservation.status === "approved" ? "Reserved" : roomStatus;
}

export function resolveRoomStatus(
  room: RoomStatusRoomLike,
  reservations: RoomStatusReservationLike[],
  options: {
    activeSchedule?: RoomStatusScheduleLike | null;
    now?: Date;
  } = {}
): ResolvedRoomStatus {
  const { activeSchedule = null, now = new Date() } = options;
  const roomStatus = normalizeRoomStatus(room.status);
  const reservation = getPrimaryRoomReservation(room, reservations, now);

  if (roomStatus === "Unavailable") {
    return {
      status: "Unavailable",
      reservation,
      detail: "Unavailable",
    };
  }

  if (roomStatus === "Ongoing") {
    return {
      status: "Ongoing",
      reservation,
      detail: reservation?.userName
        ? `Checked in: ${reservation.userName}`
        : "Room is currently in use",
    };
  }

  if (activeSchedule) {
    return {
      status: "Reserved",
      reservation,
      detail: activeSchedule.subjectName
        ? `Class: ${activeSchedule.subjectName}`
        : "Class in progress",
    };
  }

  if (roomStatus === "Reserved") {
    return {
      status: "Reserved",
      reservation,
      detail: reservation
        ? `${reservation.userName ?? "Reserved"} | ${formatReservationWindow(
            reservation
          )}`
        : "Reserved",
    };
  }

  if (reservation) {
    const status = reservation.checkedInAt ? "Ongoing" : "Reserved";
    return {
      status,
      reservation,
      detail:
        status === "Ongoing"
          ? reservation.userName
            ? `Checked in: ${reservation.userName}`
            : "Room is currently in use"
          : `${reservation.userName ?? "Reserved"} | ${formatReservationWindow(
              reservation
            )}`,
    };
  }

  return {
    status: "Available",
    reservation: null,
    detail: "Ready for reservation",
  };
}
