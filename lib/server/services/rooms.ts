import "server-only";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  normalizeRoomCheckInMethod,
  normalizeRoomStatus,
  type RoomCheckInMethod,
  type RoomStatusValue,
} from "@/lib/roomStatus";
import { serverClientDb } from "@/lib/server/firebase-client";

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

export async function createRoomRecord(data: RoomCreateInput) {
  const roomRef = doc(collection(serverClientDb, "rooms"));
  const batch = writeBatch(serverClientDb);
  batch.set(roomRef, {
    ...data,
    status: normalizeRoomStatus(data.status),
    beaconId: data.beaconId ?? null,
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
  const batch = writeBatch(serverClientDb);
  const roomRef = doc(serverClientDb, "rooms", roomId);

  batch.update(roomRef, {
    ...data,
    ...(data.status ? { status: normalizeRoomStatus(data.status) } : {}),
    updatedAt: serverTimestamp(),
  });

  if (data.name) {
    const scheduleSnapshot = await getDocs(
      query(collection(serverClientDb, "schedules"), where("roomId", "==", roomId))
    );

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
  const batch = writeBatch(serverClientDb);
  const roomRef = doc(serverClientDb, "rooms", roomId);
  const scheduleSnapshot = await getDocs(
    query(collection(serverClientDb, "schedules"), where("roomId", "==", roomId))
  );

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

  await updateDoc(doc(serverClientDb, "rooms", roomId), {
    ...data,
    ...(normalizedCheckInMethod !== undefined
      ? { checkInMethod: normalizedCheckInMethod }
      : {}),
    status: normalizeRoomStatus(data.status),
    ...(data.status !== "Ongoing" && data.beaconConnected === undefined
      ? {
          beaconConnected: false,
          beaconDeviceName: null,
        }
      : {}),
    updatedAt: serverTimestamp(),
  });
}
