import { type OccupancyRecord } from "@/lib/occupancy";
import { formatDateTime } from "./dateTime";
import { type Room } from "@/lib/rooms";

export const BLE_MONITOR_REFRESH_INTERVAL_MS = 600_000;
export const BLE_HARDWARE_OFFLINE_WINDOW_MS = 12 * 60 * 1000;

export type BleHistoryTone = "gray" | "green" | "red" | "yellow" | "blue";

export interface BleBeaconRoomLike {
  id: string;
  name: string;
  beaconId?: string | null;
  bleBeaconId?: string | null;
}

function normalizeBeaconId(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function getRoomBleBeaconId(
  room?: Pick<Room, "beaconId" | "bleBeaconId"> | BleBeaconRoomLike | null
) {
  return (
    normalizeBeaconId(room?.bleBeaconId) ?? normalizeBeaconId(room?.beaconId)
  );
}

export function getBeaconConfiguredRooms<T extends BleBeaconRoomLike>(rooms: T[]) {
  return rooms.filter((room) => Boolean(getRoomBleBeaconId(room)));
}

export function parseBleTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function formatBleTimestamp(value?: string | null) {
  if (!value) {
    return "No data yet";
  }

  const parsedDate = parseBleTimestamp(value);
  return parsedDate
    ? formatDateTime(parsedDate, { includeSeconds: true, separator: " " })
    : value;
}

export function formatBleLabel(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return value
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function isBeaconHardwareOnline(
  timestamp?: string | null,
  now: Date = new Date(),
  offlineWindowMs: number = BLE_HARDWARE_OFFLINE_WINDOW_MS
) {
  if (!timestamp) return false;

  // ESP32 sent data but NTP hasn't synced yet — hardware is online
  if (timestamp.trim() === "TIME_ERROR") return true;

  const lastSeenAt = parseBleTimestamp(timestamp);
  if (!lastSeenAt) return false;

  return now.getTime() - lastSeenAt.getTime() <= offlineWindowMs;
}

export function getBleHistoryTone(
  entry: Pick<OccupancyRecord, "connectionStatus" | "eventType">
): BleHistoryTone {
  const eventType = entry.eventType.trim().toUpperCase();

  if (eventType === "END_OF_RESERVATION") {
    return "yellow";
  }

  if (eventType === "INTERVAL" || eventType === "INTERVAL_UPDATE") {
    return "blue";
  }

  switch (entry.connectionStatus.trim().toUpperCase()) {
    case "CONNECTED":
      return "green";
    case "DISCONNECTED":
      return "red";
    default:
      return "gray";
  }
}

export function getTelemetryRoomLabel(rooms: BleBeaconRoomLike[]) {
  if (rooms.length === 1) {
    return rooms[0]?.name ?? "Unknown Room";
  }

  if (rooms.length === 0) {
    return "Unassigned";
  }

  return "Shared Test Feed";
}
