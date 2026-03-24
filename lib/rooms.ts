import {
  collection,
  documentId,
  FieldValue,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import { db } from "@/lib/firebase";
import {
  normalizeRoomStatus,
  type RoomCheckInMethod,
  type RoomStatusValue,
} from "@/lib/roomStatus";

export interface Room {
  id: string;
  name: string;
  floor: string;
  roomType: string;
  acStatus: string;
  tvProjectorStatus: string;
  capacity: number;
  status: RoomStatusValue;
  buildingId: string;
  buildingName: string;
  reservedBy: string | null;
  activeReservationId?: string | null;
  checkedInAt?: Timestamp | null;
  checkInMethod?: RoomCheckInMethod | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type RoomInput = Omit<
  Room,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "reservedBy"
  | "activeReservationId"
  | "checkedInAt"
  | "checkInMethod"
>;

export interface RoomStatusUpdate {
  status: RoomStatusValue;
  reservedBy?: string | null;
  activeReservationId?: string | null;
  checkedInAt?: Timestamp | FieldValue | null;
  checkInMethod?: RoomCheckInMethod | null;
}

function mapRoom(
  roomId: string,
  data: Omit<Room, "id" | "status"> & { status?: string | null }
): Room {
  return {
    id: roomId,
    ...data,
    status: normalizeRoomStatus(data.status),
    reservedBy: data.reservedBy ?? null,
    activeReservationId: data.activeReservationId ?? null,
    checkedInAt: data.checkedInAt ?? null,
    checkInMethod: data.checkInMethod ?? null,
  };
}

function sortRooms(left: Room, right: Room) {
  return (
    left.buildingName.localeCompare(right.buildingName) ||
    left.floor.localeCompare(right.floor) ||
    left.name.localeCompare(right.name)
  );
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function addRoom(data: RoomInput): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/rooms", {
    body: data,
    method: "POST",
  });

  return payload.id;
}

export async function updateRoom(
  roomId: string,
  data: Partial<Omit<Room, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  await apiRequest(`/api/rooms/${roomId}`, {
    body: data,
    method: "PATCH",
  });
}

export async function deleteRoom(roomId: string): Promise<void> {
  await apiRequest(`/api/rooms/${roomId}`, {
    method: "DELETE",
  });
}

export async function updateRoomStatus(
  roomId: string,
  update: Room["status"] | RoomStatusUpdate
): Promise<void> {
  const payload =
    typeof update === "string"
      ? { status: normalizeRoomStatus(update) }
      : { ...update, status: normalizeRoomStatus(update.status) };

  await apiRequest(`/api/rooms/${roomId}/status`, {
    body: payload,
    method: "PATCH",
  });
}

export function onRoomsByBuilding(
  buildingId: string,
  callback: (rooms: Room[]) => void
): Unsubscribe {
  const roomQuery = query(
    collection(db, "rooms"),
    where("buildingId", "==", buildingId),
    orderBy("floor"),
    orderBy("name")
  );

  return onSnapshot(
    roomQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map((roomDoc) =>
          mapRoom(
            roomDoc.id,
            roomDoc.data() as Omit<Room, "id" | "status"> & {
              status?: string | null;
            }
          )
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (rooms):", error);
    }
  );
}

export function onAvailableRoomsByBuilding(
  buildingId: string,
  callback: (rooms: Room[]) => void
): Unsubscribe {
  const roomQuery = query(
    collection(db, "rooms"),
    where("buildingId", "==", buildingId),
    where("status", "==", "Available"),
    orderBy("floor"),
    orderBy("name")
  );

  return onSnapshot(
    roomQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map((roomDoc) =>
          mapRoom(
            roomDoc.id,
            roomDoc.data() as Omit<Room, "id" | "status"> & {
              status?: string | null;
            }
          )
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (available rooms):", error);
    }
  );
}

export async function getAvailableRoomsByBuilding(
  buildingId: string
): Promise<Room[]> {
  const roomQuery = query(
    collection(db, "rooms"),
    where("buildingId", "==", buildingId),
    where("status", "==", "Available"),
    orderBy("floor"),
    orderBy("name")
  );
  const snapshot = await getDocs(roomQuery);

  return snapshot.docs.map((roomDoc) =>
    mapRoom(
      roomDoc.id,
      roomDoc.data() as Omit<Room, "id" | "status"> & {
        status?: string | null;
      }
    )
  );
}

export function onRoomsByIds(
  roomIds: string[],
  callback: (rooms: Room[]) => void
): Unsubscribe {
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean))];
  if (uniqueRoomIds.length === 0) {
    callback([]);
    return () => {};
  }

  const roomsByChunk = new Map<number, Room[]>();
  const roomIdChunks = chunkValues(uniqueRoomIds, 10);

  const emit = () => {
    const mergedRooms = [...roomsByChunk.values()]
      .flat()
      .sort(sortRooms);
    callback(mergedRooms);
  };

  const unsubscribers = roomIdChunks.map((roomIdChunk, chunkIndex) =>
    onSnapshot(
      query(collection(db, "rooms"), where(documentId(), "in", roomIdChunk)),
      (snapshot) => {
        roomsByChunk.set(
          chunkIndex,
          snapshot.docs.map((roomDoc) =>
            mapRoom(
              roomDoc.id,
              roomDoc.data() as Omit<Room, "id" | "status"> & {
                status?: string | null;
              }
            )
          )
        );
        emit();
      },
      (error) => {
        console.warn("Firestore listener error (rooms by ids):", error);
      }
    )
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export function onAllRooms(callback: (rooms: Room[]) => void): Unsubscribe {
  const roomQuery = query(
    collection(db, "rooms"),
    orderBy("buildingName"),
    orderBy("floor"),
    orderBy("name")
  );

  return onSnapshot(
    roomQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map((roomDoc) =>
          mapRoom(
            roomDoc.id,
            roomDoc.data() as Omit<Room, "id" | "status"> & {
              status?: string | null;
            }
          )
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (all rooms):", error);
    }
  );
}
