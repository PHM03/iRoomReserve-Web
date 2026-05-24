import "server-only";

import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import {
  normalizeRoomCheckInMethod,
  normalizeRoomStatus,
  type RoomCheckInMethod,
  type RoomStatusValue,
} from "@/lib/rooms/roomStatus";

export interface RoomCreateInput {
  name: string;
  floor: string;
  roomType: string;
  acStatus: string;
  tvProjectorStatus: string;
  capacity: number;
  status: RoomStatusValue;
  buildingId: string;
  buildingName: string;
  beaconId?: string | null;
  bleBeaconId?: string | null;
}

export interface RoomStatusUpdateInput {
  status: RoomStatusValue;
  reservedBy?: string | null;
  activeReservationId?: string | null;
  checkedInAt?: Date | string | null;
  checkInMethod?: RoomCheckInMethod | null;
  beaconConnected?: boolean;
  beaconDeviceName?: string | null;
  beaconLastConnectedAt?: Date | string | null;
  beaconLastDisconnectedAt?: Date | string | null;
}

export interface RoomBeaconTelemetrySyncInput {
  beaconId?: string | null;
  connectionStatus: string;
  roomId?: string | null;
}

function normalizeBuildingName(buildingId: string, buildingName: string) {
  const normalizedBuildingId = buildingId.trim().toLowerCase();
  const trimmedBuildingName = buildingName.trim();

  if (normalizedBuildingId === "gd1") {
    return "GD1 Main Campus";
  }

  if (normalizedBuildingId === "gd2") {
    return "GD2 Main Campus";
  }

  if (normalizedBuildingId === "gd3") {
    return "GD3 Main Campus";
  }

  return trimmedBuildingName;
}

function normalizeBeaconId(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function resolveBeaconId(input: {
  beaconId?: string | null;
  bleBeaconId?: string | null;
}) {
  return normalizeBeaconId(input.bleBeaconId) ?? normalizeBeaconId(input.beaconId);
}

function isConnectedTelemetryStatus(connectionStatus: string) {
  return connectionStatus.trim().toUpperCase() === "CONNECTED";
}

export async function createRoomRecord(data: RoomCreateInput) {
  const roomRef = db.collection("rooms").doc();
  const batch = db.batch();
  const beaconId = resolveBeaconId(data);
  const buildingName = normalizeBuildingName(data.buildingId, data.buildingName);

  batch.set(roomRef, {
    ...data,
    buildingName,
    status: normalizeRoomStatus(data.status),
    beaconId,
    bleBeaconId: beaconId,
    beaconConnected: false,
    beaconDeviceName: null,
    beaconLastConnectedAt: null,
    beaconLastDisconnectedAt: null,
    reservedBy: null,
    activeReservationId: null,
    checkedInAt: null,
    checkInMethod: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return roomRef.id;
}

export async function updateRoomRecord(
  roomId: string,
  data: Partial<RoomCreateInput>
) {
  const batch = db.batch();
  const roomRef = db.collection("rooms").doc(roomId);
  const beaconIdProvided =
    data.beaconId !== undefined || data.bleBeaconId !== undefined;
  const normalizedBeaconId = beaconIdProvided ? resolveBeaconId(data) : undefined;

  const normalizedBuildingName =
    data.buildingId && data.buildingName
      ? normalizeBuildingName(data.buildingId, data.buildingName)
      : data.buildingName;

  batch.update(roomRef, {
    ...data,
    ...(normalizedBuildingName !== undefined
      ? { buildingName: normalizedBuildingName }
      : {}),
    ...(beaconIdProvided
      ? {
          beaconId: normalizedBeaconId,
          bleBeaconId: normalizedBeaconId,
        }
      : {}),
    ...(data.status ? { status: normalizeRoomStatus(data.status) } : {}),
    updatedAt: serverTimestamp(),
  });

  if (data.name) {
    const scheduleSnapshot = await db
      .collection("schedules")
      .where("roomId", "==", roomId)
      .get();

    scheduleSnapshot.docs.forEach((scheduleDoc) => {
      batch.update(scheduleDoc.ref, {
        roomName: data.name,
        updatedAt: serverTimestamp(),
      });
    });
  }

  await batch.commit();
}

export async function deleteRoomRecord(roomId: string) {
  const batch = db.batch();
  const roomRef = db.collection("rooms").doc(roomId);
  const scheduleSnapshot = await db
    .collection("schedules")
    .where("roomId", "==", roomId)
    .get();

  batch.delete(roomRef);
  scheduleSnapshot.docs.forEach((scheduleDoc) => {
    batch.delete(scheduleDoc.ref);
  });

  await batch.commit();
}

export async function updateRoomStatusRecord(
  roomId: string,
  data: RoomStatusUpdateInput
) {
  const normalizedCheckInMethod =
    data.checkInMethod === undefined
      ? undefined
      : normalizeRoomCheckInMethod(data.checkInMethod);

  await db.collection("rooms").doc(roomId).update({
    ...data,
    ...(normalizedCheckInMethod !== undefined
      ? { checkInMethod: normalizedCheckInMethod }
      : {}),
    status: normalizeRoomStatus(data.status),
    ...(data.status !== "Occupied" && data.beaconConnected === undefined
      ? {
          beaconConnected: false,
          beaconDeviceName: null,
        }
      : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function syncRoomBeaconTelemetry(
  input: RoomBeaconTelemetrySyncInput
) {
  const normalizedRoomId =
    typeof input.roomId === "string" && input.roomId.trim().length > 0
      ? input.roomId.trim()
      : null;
  const normalizedBeaconId = normalizeBeaconId(input.beaconId);
  const isConnected = isConnectedTelemetryStatus(input.connectionStatus);

  let roomRef = normalizedRoomId
    ? db.collection("rooms").doc(normalizedRoomId)
    : null;

  if (roomRef) {
    const directSnapshot = await roomRef.get();
    if (!directSnapshot.exists) {
      roomRef = null;
    }
  }

  if (!roomRef && normalizedBeaconId) {
    const beaconSnapshot = await db
      .collection("rooms")
      .where("bleBeaconId", "==", normalizedBeaconId)
      .limit(1)
      .get();

    if (!beaconSnapshot.empty) {
      roomRef = beaconSnapshot.docs[0].ref;
    } else {
      const legacyBeaconSnapshot = await db
        .collection("rooms")
        .where("beaconId", "==", normalizedBeaconId)
        .limit(1)
        .get();

      if (!legacyBeaconSnapshot.empty) {
        roomRef = legacyBeaconSnapshot.docs[0].ref;
      }
    }
  }

  if (!roomRef) {
    return;
  }

  await roomRef.update({
    beaconConnected: isConnected,
    beaconDeviceName: isConnected ? normalizedBeaconId : null,
    beaconLastConnectedAt: isConnected ? serverTimestamp() : null,
    beaconLastDisconnectedAt: isConnected ? null : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
