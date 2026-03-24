import "server-only";

import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import {
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
}

export interface RoomStatusUpdateInput {
  status: RoomStatusValue;
  reservedBy?: string | null;
  activeReservationId?: string | null;
  checkedInAt?: Date | string | null;
  checkInMethod?: RoomCheckInMethod | null;
}

export async function createRoomRecord(data: RoomCreateInput) {
  const roomRef = doc(collection(serverClientDb, "rooms"));
  const batch = writeBatch(serverClientDb);
  batch.set(roomRef, {
    ...data,
    status: normalizeRoomStatus(data.status),
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
  await updateDoc(doc(serverClientDb, "rooms", roomId), {
    ...data,
    ...(data.status ? { status: normalizeRoomStatus(data.status) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRoomRecord(roomId: string) {
  await deleteDoc(doc(serverClientDb, "rooms", roomId));
}

export async function updateRoomStatusRecord(
  roomId: string,
  data: RoomStatusUpdateInput
) {
  await updateDoc(doc(serverClientDb, "rooms", roomId), {
    ...data,
    status: normalizeRoomStatus(data.status),
    updatedAt: serverTimestamp(),
  });
}
