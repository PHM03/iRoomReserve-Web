'use client';

import { Timestamp } from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import type { AdminRequest } from "@/lib/admin/adminRequests";
import type { Notification } from "@/lib/notifications/notifications";
import type { Reservation } from "@/lib/reservations/reservations";
import type { RoomHistoryEntry } from "@/lib/rooms/roomHistory";
import type { Room } from "@/lib/rooms/rooms";
import type { Schedule } from "@/lib/schedules/schedules";

type TimestampLike =
  | Timestamp
  | {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    }
  | null
  | undefined;

export interface AdminDashboardSnapshot {
  adminRequests: AdminRequest[];
  allReservations: Reservation[];
  notifications: Notification[];
  requests: Reservation[];
  roomHistory: RoomHistoryEntry[];
  rooms: Room[];
  schedules: Schedule[];
  summary: AdminDashboardSummary | null;
}

export interface AdminDashboardSummary {
  activeBeacons: number;
  availableRooms: number;
  onlineBeacons: number;
  occupiedRooms: number;
  pendingRequests: number;
  pendingPreviewLimit: number | null;
  reservedRooms: number;
  roomPreviewLimit: number | null;
  roomsHasMore: boolean;
  totalBeacons: number;
  totalRooms: number;
  unavailableRooms: number;
}

interface FetchAdminDashboardSnapshotOptions {
  includeApprovedReservations?: boolean;
  includePendingRequests?: boolean;
  includeRooms?: boolean;
  includeRoomHistory?: boolean;
  includeSchedules?: boolean;
  includeSummary?: boolean;
  pendingLimit?: number;
  reservationDate?: string;
  roomLimit?: number;
  roomSearch?: string;
  roomStatus?: string;
  scheduleDayOfWeek?: number;
}

function reviveTimestamp(value: TimestampLike) {
  if (!value) {
    return value ?? undefined;
  }

  if (value instanceof Timestamp) {
    return value;
  }

  const seconds =
    typeof value.seconds === "number"
      ? value.seconds
      : typeof value._seconds === "number"
        ? value._seconds
        : null;
  const nanoseconds =
    typeof value.nanoseconds === "number"
      ? value.nanoseconds
      : typeof value._nanoseconds === "number"
        ? value._nanoseconds
        : 0;

  if (seconds === null) {
    return value;
  }

  return new Timestamp(seconds, nanoseconds);
}

function reviveRecordTimestamps<T extends object>(
  record: T,
  fields: string[]
) {
  const nextRecord = { ...record } as T;
  const mutableRecord = nextRecord as Record<string, unknown>;

  fields.forEach((field) => {
    if (field in mutableRecord) {
      mutableRecord[field] = reviveTimestamp(mutableRecord[field] as TimestampLike);
    }
  });

  return nextRecord;
}

export async function fetchAdminDashboardSnapshot(
  buildingId: string,
  options: FetchAdminDashboardSnapshotOptions = {}
) {
  const snapshot = await apiRequest<AdminDashboardSnapshot>(
    "/api/admin/dashboard",
    {
      method: "GET",
      params: {
        buildingId,
        includeApprovedReservations: options.includeApprovedReservations ?? true,
        includePendingRequests: options.includePendingRequests ?? true,
        includeRoomHistory: options.includeRoomHistory ?? true,
        includeRooms: options.includeRooms ?? true,
        includeSchedules: options.includeSchedules ?? true,
        includeSummary: options.includeSummary ?? false,
        pendingLimit: options.pendingLimit,
        reservationDate: options.reservationDate,
        roomLimit: options.roomLimit,
        roomSearch: options.roomSearch,
        roomStatus: options.roomStatus,
        scheduleDayOfWeek: options.scheduleDayOfWeek,
      },
    }
  );

  return {
    adminRequests: (snapshot.adminRequests ?? []).map((request) =>
      reviveRecordTimestamps(request, ["createdAt"])
    ),
    allReservations: (snapshot.allReservations ?? []).map((reservation) =>
      reviveRecordTimestamps(reservation, [
        "checkedInAt",
        "createdAt",
        "updatedAt",
      ])
    ),
    notifications: (snapshot.notifications ?? []).map((notification) =>
      reviveRecordTimestamps(notification, ["createdAt"])
    ),
    requests: (snapshot.requests ?? []).map((reservation) =>
      reviveRecordTimestamps(reservation, [
        "checkedInAt",
        "createdAt",
        "updatedAt",
      ])
    ),
    roomHistory: (snapshot.roomHistory ?? []).map((entry) =>
      reviveRecordTimestamps(entry, ["createdAt"])
    ),
    rooms: (snapshot.rooms ?? []).map((room) =>
      reviveRecordTimestamps(room, [
        "beaconLastConnectedAt",
        "beaconLastDisconnectedAt",
        "checkedInAt",
        "createdAt",
        "updatedAt",
      ])
    ),
    schedules: (snapshot.schedules ?? []).map((schedule) =>
      reviveRecordTimestamps(schedule, ["createdAt", "updatedAt"])
    ),
    summary: snapshot.summary ?? null,
  };
}
