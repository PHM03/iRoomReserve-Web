import "server-only";

import { db, serverTimestamp } from "@/lib/configs/firebase-admin";
import type { FirestoreTimestampLike } from "@/lib/firestore-types";
import { normalizeRoomCheckInMethod } from "@/lib/roomStatus";
import { ApiError } from "@/lib/server/api-error";

export const RESERVATION_PRESENCE_TIMEOUT_MS = 10 * 60 * 1000;

export type ReservationPresenceAppState = "background" | "foreground";
export type ReservationPresenceStatus =
  | "healthy"
  | "stopped"
  | "timed_out"
  | "warning";

interface ReservationPresenceMonitorRecord {
  beaconId?: string | null;
  buildingId: string;
  currentStatus: ReservationPresenceStatus;
  lastAppState?: ReservationPresenceAppState | null;
  lastBluetoothOn?: boolean | null;
  lastClientCheckedAt?: string | null;
  lastHeartbeatAt?: FirestoreTimestampLike | null;
  lastHealthyHeartbeatAt?: FirestoreTimestampLike | null;
  lastInRange?: boolean | null;
  lastRssi?: number | null;
  monitoringActive: boolean;
  reservationId: string;
  roomId: string;
  timedOutAt?: FirestoreTimestampLike | null;
  userId: string;
}

interface ReservationRecord {
  buildingId: string;
  checkInMethod?: string | null;
  checkedInAt?: FirestoreTimestampLike | null;
  roomId: string;
  status?: string | null;
  userId: string;
}

function getPresenceMonitorRef(reservationId: string) {
  return db.collection("reservationPresenceMonitors").doc(reservationId);
}

function getTimestampMillis(value: unknown) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const timestampValue = value as {
    _seconds?: number;
    seconds?: number;
  };
  const seconds =
    typeof timestampValue.seconds === "number"
      ? timestampValue.seconds
      : typeof timestampValue._seconds === "number"
        ? timestampValue._seconds
        : 0;

  return seconds * 1000;
}

function computePresenceStatus(
  monitor: Pick<
    ReservationPresenceMonitorRecord,
    | "lastBluetoothOn"
    | "lastHealthyHeartbeatAt"
    | "lastInRange"
    | "monitoringActive"
  >,
  nowMs: number
): ReservationPresenceStatus {
  if (!monitor.monitoringActive) {
    return "stopped";
  }

  const lastHealthyAtMs = getTimestampMillis(monitor.lastHealthyHeartbeatAt);
  if (lastHealthyAtMs > 0 && nowMs - lastHealthyAtMs >= RESERVATION_PRESENCE_TIMEOUT_MS) {
    return "timed_out";
  }

  if (monitor.lastBluetoothOn === false || monitor.lastInRange === false) {
    return "warning";
  }

  return "healthy";
}

async function getReservationForPresenceMonitor(
  reservationId: string,
  userId?: string
) {
  const reservationSnapshot = await db.collection("reservations").doc(reservationId).get();
  if (!reservationSnapshot.exists) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = reservationSnapshot.data() as ReservationRecord;

  if (userId && reservation.userId !== userId) {
    throw new ApiError(
      403,
      "forbidden",
      "You cannot update presence monitoring for this reservation."
    );
  }

  if (reservation.status !== "approved") {
    throw new ApiError(
      400,
      "invalid_status",
      "Presence monitoring is only available for approved reservations."
    );
  }

  if (!reservation.checkedInAt) {
    throw new ApiError(
      400,
      "not_checked_in",
      "Presence monitoring requires an active checked-in reservation."
    );
  }

  if (normalizeRoomCheckInMethod(reservation.checkInMethod) !== "bluetooth") {
    throw new ApiError(
      400,
      "invalid_check_in_method",
      "Presence monitoring is only available for Bluetooth check-ins."
    );
  }

  return reservation;
}

async function upsertPresenceMonitor(
  reservationId: string,
  update: Record<string, unknown>
) {
  const monitorRef = getPresenceMonitorRef(reservationId);
  const existingSnapshot = await monitorRef.get();

  if (existingSnapshot.exists) {
    await monitorRef.update({
      ...update,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await monitorRef.set({
    ...update,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function startReservationPresenceMonitorRecord(input: {
  beaconId: string;
  reservationId: string;
  userId: string;
}) {
  const reservation = await getReservationForPresenceMonitor(
    input.reservationId,
    input.userId
  );

  await upsertPresenceMonitor(input.reservationId, {
    beaconId: input.beaconId.trim(),
    buildingId: reservation.buildingId,
    currentStatus: "healthy" satisfies ReservationPresenceStatus,
    lastAppState: "foreground" satisfies ReservationPresenceAppState,
    lastBluetoothOn: true,
    lastClientCheckedAt: new Date().toISOString(),
    lastHeartbeatAt: serverTimestamp(),
    lastHealthyHeartbeatAt: serverTimestamp(),
    lastInRange: true,
    lastRssi: null,
    monitoringActive: true,
    reservationId: input.reservationId,
    roomId: reservation.roomId,
    timedOutAt: null,
    userId: input.userId,
  });
}

export async function recordReservationPresenceHeartbeat(input: {
  appState: ReservationPresenceAppState;
  beaconId?: string;
  bluetoothOn: boolean;
  checkedAt?: string;
  inRange: boolean;
  reservationId: string;
  rssi?: number | null;
  userId: string;
}) {
  const reservation = await getReservationForPresenceMonitor(
    input.reservationId,
    input.userId
  );
  const monitorRef = getPresenceMonitorRef(input.reservationId);
  const monitorSnapshot = await monitorRef.get();
  const existingMonitor = monitorSnapshot.exists
    ? (monitorSnapshot.data() as ReservationPresenceMonitorRecord)
    : null;
  const nowMs = Date.now();
  const isHealthy = input.bluetoothOn && input.inRange;
  const nextStatus = isHealthy
    ? ("healthy" as const)
    : computePresenceStatus(
        {
          lastBluetoothOn: input.bluetoothOn,
          lastHealthyHeartbeatAt:
            existingMonitor?.lastHealthyHeartbeatAt ?? existingMonitor?.lastHeartbeatAt ?? null,
          lastInRange: input.inRange,
          monitoringActive: true,
        },
        nowMs
      );

  await upsertPresenceMonitor(input.reservationId, {
    beaconId: input.beaconId?.trim() || existingMonitor?.beaconId || null,
    buildingId: reservation.buildingId,
    currentStatus: nextStatus,
    lastAppState: input.appState,
    lastBluetoothOn: input.bluetoothOn,
    lastClientCheckedAt: input.checkedAt?.trim() || new Date(nowMs).toISOString(),
    lastHeartbeatAt: serverTimestamp(),
    ...(isHealthy ? { lastHealthyHeartbeatAt: serverTimestamp() } : {}),
    lastInRange: input.inRange,
    lastRssi: typeof input.rssi === "number" ? input.rssi : null,
    monitoringActive: true,
    reservationId: input.reservationId,
    roomId: reservation.roomId,
    timedOutAt: nextStatus === "timed_out" ? serverTimestamp() : null,
    userId: input.userId,
  });

  return {
    healthy: isHealthy,
    status: nextStatus,
    timedOut: nextStatus === "timed_out",
  };
}

export async function stopReservationPresenceMonitorRecord(input: {
  reservationId: string;
  status?: ReservationPresenceStatus;
  userId?: string;
}) {
  if (input.userId) {
    await getReservationForPresenceMonitor(input.reservationId, input.userId);
  }

  const monitorRef = getPresenceMonitorRef(input.reservationId);
  const monitorSnapshot = await monitorRef.get();
  if (!monitorSnapshot.exists) {
    return;
  }

  await monitorRef.update({
    currentStatus: input.status ?? "stopped",
    monitoringActive: false,
    updatedAt: serverTimestamp(),
  });
}

export async function evaluateExpiredPresenceMonitors() {
  const snapshot = await db
    .collection("reservationPresenceMonitors")
    .where("monitoringActive", "==", true)
    .get();

  const nowMs = Date.now();
  const timedOutMonitors = snapshot.docs.filter((doc) => {
    const monitor = doc.data() as ReservationPresenceMonitorRecord;
    return computePresenceStatus(monitor, nowMs) === "timed_out";
  });

  if (timedOutMonitors.length === 0) {
    return;
  }

  const batch = db.batch();

  timedOutMonitors.forEach((doc) => {
    batch.update(doc.ref, {
      currentStatus: "timed_out",
      timedOutAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function getReservationPresenceMonitorsByReservationIds(
  reservationIds: string[]
) {
  const uniqueReservationIds = [...new Set(reservationIds.filter(Boolean))];
  if (uniqueReservationIds.length === 0) {
    return new Map<string, ReservationPresenceMonitorRecord>();
  }

  const snapshots = await db.getAll(
    ...uniqueReservationIds.map((reservationId) => getPresenceMonitorRef(reservationId))
  );

  return new Map(
    snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => [
        snapshot.id,
        snapshot.data() as ReservationPresenceMonitorRecord,
      ])
  );
}
