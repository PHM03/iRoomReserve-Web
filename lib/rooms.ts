import {
  collection,
  doc,
  documentId,
  FieldValue,
  getDoc,
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
  normalizeRoomCheckInMethod,
  normalizeRoomStatus,
  type RoomCheckInMethod,
  type RoomStatusValue,
} from "@/lib/roomStatus";
import { auth } from "@/lib/firebase";

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
  beaconId?: string | null;
  bleBeaconId?: string | null;
  beaconConnected?: boolean;
  beaconDeviceName?: string | null;
  beaconLastConnectedAt?: Timestamp | null;
  beaconLastDisconnectedAt?: Timestamp | null;
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
  | "beaconConnected"
  | "beaconDeviceName"
  | "beaconLastConnectedAt"
  | "beaconLastDisconnectedAt"
  | "checkedInAt"
  | "checkInMethod"
>;

export interface RoomStatusUpdate {
  status: RoomStatusValue;
  reservedBy?: string | null;
  activeReservationId?: string | null;
  checkedInAt?: Timestamp | FieldValue | null;
  checkInMethod?: RoomCheckInMethod | null;
  beaconConnected?: boolean;
  beaconDeviceName?: string | null;
  beaconLastConnectedAt?: Timestamp | FieldValue | null;
  beaconLastDisconnectedAt?: Timestamp | FieldValue | null;
}

function mapRoom(
  roomId: string,
  data: Omit<Room, "id" | "status"> & { status?: string | null }
): Room {
  const normalizedBeaconId =
    typeof data.bleBeaconId === "string" && data.bleBeaconId.trim().length > 0
      ? data.bleBeaconId.trim()
      : typeof data.beaconId === "string" && data.beaconId.trim().length > 0
        ? data.beaconId.trim()
        : null;

  return {
    id: roomId,
    ...data,
    status: normalizeRoomStatus(data.status),
    beaconId: normalizedBeaconId,
    bleBeaconId: normalizedBeaconId,
    beaconConnected: data.beaconConnected ?? false,
    beaconDeviceName: data.beaconDeviceName ?? null,
    beaconLastConnectedAt: data.beaconLastConnectedAt ?? null,
    beaconLastDisconnectedAt: data.beaconLastDisconnectedAt ?? null,
    reservedBy: data.reservedBy ?? null,
    activeReservationId: data.activeReservationId ?? null,
    checkedInAt: data.checkedInAt ?? null,
    checkInMethod: normalizeRoomCheckInMethod(data.checkInMethod) ?? null,
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
    userId: auth.currentUser?.uid,
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
    userId: auth.currentUser?.uid,
  });
}

export async function deleteRoom(roomId: string): Promise<void> {
  await apiRequest(`/api/rooms/${roomId}`, {
    method: "DELETE",
    userId: auth.currentUser?.uid,
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
    userId: auth.currentUser?.uid,
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

export function onRoomsByBuildingIds(
  buildingIds: string[],
  callback: (rooms: Room[]) => void
): Unsubscribe {
  const uniqueBuildingIds = [...new Set(buildingIds.filter(Boolean))];
  if (uniqueBuildingIds.length === 0) {
    callback([]);
    return () => {};
  }

  const roomsByChunk = new Map<number, Room[]>();
  const buildingChunks = chunkValues(uniqueBuildingIds, 10);

  const emit = () => {
    callback([...roomsByChunk.values()].flat().sort(sortRooms));
  };

  const unsubscribers = buildingChunks.map((buildingChunk, chunkIndex) =>
    onSnapshot(
      query(collection(db, "rooms"), where("buildingId", "in", buildingChunk)),
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
        console.warn("Firestore listener error (rooms by building ids):", error);
      }
    )
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
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

export async function getRoomsByBuilding(buildingId: string): Promise<Room[]> {
  const roomQuery = query(
    collection(db, "rooms"),
    where("buildingId", "==", buildingId),
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

export async function getRoomById(roomId: string): Promise<Room | null> {
  const snapshot = await getDoc(doc(db, "rooms", roomId));
  if (!snapshot.exists()) {
    return null;
  }

  return mapRoom(
    snapshot.id,
    snapshot.data() as Omit<Room, "id" | "status"> & {
      status?: string | null;
    }
  );
}

export async function getRoomsByIds(roomIds: string[]): Promise<Room[]> {
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean))];
  if (uniqueRoomIds.length === 0) {
    return [];
  }

  const roomIdChunks = chunkValues(uniqueRoomIds, 10);
  const chunkResults = await Promise.all(
    roomIdChunks.map(async (roomIdChunk) => {
      const snapshot = await getDocs(
        query(collection(db, "rooms"), where(documentId(), "in", roomIdChunk))
      );

      return snapshot.docs.map((roomDoc) =>
        mapRoom(
          roomDoc.id,
          roomDoc.data() as Omit<Room, "id" | "status"> & {
            status?: string | null;
          }
        )
      );
    })
  );

  return chunkResults.flat().sort(sortRooms);
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
