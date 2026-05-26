import type { FirestoreTimestampLike } from "@/lib/types/firestore-types";
import { formatDate, formatTimeRange } from "@/lib/utils/dateTime";

export const ROOM_STATUS_VALUES = ["Available", "Reserved", "Occupied"] as const;
export const ROOM_CHECK_IN_METHODS = ["manual", "bluetooth"] as const;
export const DEFAULT_RESERVATION_TIME_ZONE = "Asia/Manila";
export const UTILITY_RESERVATION_HEARTBEAT_TIMEOUT_MS = 30 * 1000;
export const ADMIN_RESERVATION_HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;

export type RoomStatus = (typeof ROOM_STATUS_VALUES)[number];
export type RoomStatusValue = RoomStatus | "Unavailable";
export type RoomCheckInMethod = (typeof ROOM_CHECK_IN_METHODS)[number];

export interface RoomStatusRoomLike {
  id: string;
  status?: string | null;
  activeReservationId?: string | null;
  beaconConnected?: boolean | null;
  beaconLastConnectedAt?: FirestoreTimestampLike | Date | null;
  beaconLastDisconnectedAt?: FirestoreTimestampLike | Date | null;
  checkInMethod?: RoomCheckInMethod | null;
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
  checkedInAt?: FirestoreTimestampLike | null;
  checkInMethod?: RoomCheckInMethod | null;
}

export interface RoomStatusScheduleLike {
  roomId: string;
  subjectName?: string;
  courseCode?: string;
  section?: string;
}

function getScheduleStatusLabel(schedule: RoomStatusScheduleLike) {
  const courseCode = schedule.courseCode?.trim() ?? "";
  const section = schedule.section?.trim() ?? "";

  if (courseCode && section) {
    return `${courseCode} - ${section}`;
  }

  return schedule.subjectName ?? "";
}

export interface ResolvedRoomStatus {
  status: RoomStatusValue;
  reservation: RoomStatusReservationLike | null;
  detail: string;
}

function normalizeRoomStatusTimestamp(
  value?: FirestoreTimestampLike | Date | null
): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value.toDate === "function") {
    const parsedDate = value.toDate();
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  return null;
}

export function isRoomReservationHeartbeatHealthy(
  room: Pick<
    RoomStatusRoomLike,
    "beaconConnected" | "beaconLastConnectedAt" | "beaconLastDisconnectedAt"
  >,
  timeoutMs: number = UTILITY_RESERVATION_HEARTBEAT_TIMEOUT_MS,
  now: Date = new Date()
) {
  if (room.beaconConnected !== true) {
    return false;
  }

  const lastConnectedAt = normalizeRoomStatusTimestamp(
    room.beaconLastConnectedAt
  );
  if (!lastConnectedAt) {
    return false;
  }

  return now.getTime() - lastConnectedAt.getTime() <= timeoutMs;
}

export function normalizeRoomCheckInMethod(
  method?: string | null
): RoomCheckInMethod | null {
  if (typeof method !== "string") {
    return null;
  }

  switch (method.trim().toLowerCase()) {
    case "manual":
      return "manual";
    case "ble":
    case "bluetooth":
      return "bluetooth";
    default:
      return null;
  }
}

export function normalizeRoomStatus(status?: string | null): RoomStatusValue {
  switch (status) {
    case "Reserved":
      return "Reserved";
    case "Occupied":
      return "Occupied";
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

export function getCurrentDateTimeStringInTimeZone(
  date: Date = new Date(),
  timeZone: string = DEFAULT_RESERVATION_TIME_ZONE
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function isReservationActiveTimeSlot(
  reservation: Pick<
    RoomStatusReservationLike,
    "status" | "date" | "startTime" | "endTime"
  >,
  now: Date = new Date(),
  timeZone: string = DEFAULT_RESERVATION_TIME_ZONE
): boolean {
  const currentDateTime = getCurrentDateTimeStringInTimeZone(now, timeZone);

  return (
    reservation.status === "approved" &&
    reservation.date === currentDateTime.date &&
    reservation.startTime <= currentDateTime.time &&
    reservation.endTime > currentDateTime.time
  );
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
  return `${formatDate(reservation.date)} | ${formatTimeRange(
    reservation.startTime,
    reservation.endTime
  )}`;
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
    "id" | "status" | "date" | "checkedInAt" | "checkInMethod"
  >,
  room?: RoomStatusRoomLike | null,
  options: {
    now?: Date;
    connectionTimeoutMs?: number;
  } = {}
): RoomStatusValue {
  const {
    now = new Date(),
    connectionTimeoutMs = UTILITY_RESERVATION_HEARTBEAT_TIMEOUT_MS,
  } = options;
  const roomStatus = normalizeRoomStatus(room?.status);
  const checkInMethod = normalizeRoomCheckInMethod(
    reservation.checkInMethod ?? room?.checkInMethod
  );
  const bluetoothDisconnected =
    Boolean(reservation.checkedInAt) &&
    checkInMethod === "bluetooth" &&
    !isRoomReservationHeartbeatHealthy(room ?? {}, connectionTimeoutMs, now);

  if (reservation.checkedInAt && !bluetoothDisconnected) {
    return "Occupied";
  }

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
    connectionTimeoutMs?: number;
  } = {}
): ResolvedRoomStatus {
  const {
    activeSchedule = null,
    now = new Date(),
    connectionTimeoutMs = UTILITY_RESERVATION_HEARTBEAT_TIMEOUT_MS,
  } = options;
  const roomStatus = normalizeRoomStatus(room.status);
  const reservation = getPrimaryRoomReservation(room, reservations, now);
  const checkInMethod = normalizeRoomCheckInMethod(
    reservation?.checkInMethod ?? room.checkInMethod
  );
  const bluetoothDisconnected =
    Boolean(reservation?.checkedInAt) &&
    checkInMethod === "bluetooth" &&
    !isRoomReservationHeartbeatHealthy(room, connectionTimeoutMs, now);

  if (roomStatus === "Unavailable") {
    return {
      status: "Unavailable",
      reservation,
      detail: "Unavailable",
    };
  }

  if (bluetoothDisconnected) {
    return {
      status: roomStatus,
      reservation,
      detail:
        roomStatus === "Available"
          ? "Beacon disconnected"
          : "Bluetooth beacon lost connection",
    };
  }

  if (roomStatus === "Occupied") {
    return {
      status: "Occupied",
      reservation,
      detail: reservation?.userName
        ? `Checked in: ${reservation.userName}`
        : "Room is currently in use",
    };
  }

  if (activeSchedule) {
    const scheduleLabel = getScheduleStatusLabel(activeSchedule);
    return {
      status: "Reserved",
      reservation,
      detail: scheduleLabel
        ? `Class: ${scheduleLabel}`
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
    const status = reservation.checkedInAt ? "Occupied" : "Reserved";
    return {
      status,
      reservation,
      detail:
        status === "Occupied"
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
