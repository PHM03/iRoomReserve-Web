import "server-only";

import {
  compareFloorsBySortOrder,
  getFloorDocumentId,
  getNextFloorSortOrder,
  normalizeFloorName,
} from "@/lib/buildings/floorNames";
import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import { ApiError } from "@/lib/server/api-error";

export interface FloorRecord {
  id: string;
  name: string;
  normalizedName: string;
  sortOrder: number;
  hidden: boolean;
  replacesName: string | null;
}

function getBuildingRef(buildingId: string) {
  const normalizedBuildingId = buildingId.trim();
  if (!normalizedBuildingId) {
    throw new ApiError(400, "missing_building_id", "Building ID is required.");
  }

  return db.collection("buildings").doc(normalizedBuildingId);
}

async function assertBuildingExists(buildingId: string) {
  const buildingRef = getBuildingRef(buildingId);
  const snapshot = await buildingRef.get();

  if (!snapshot.exists) {
    throw new ApiError(404, "not_found", "Building not found.");
  }

  return buildingRef;
}

function mapFloor(floorId: string, data: FirebaseFirestore.DocumentData): FloorRecord {
  return {
    id: floorId,
    name: typeof data.name === "string" ? data.name : "",
    normalizedName:
      typeof data.normalizedName === "string"
        ? data.normalizedName
        : normalizeFloorName(typeof data.name === "string" ? data.name : ""),
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
    hidden: data.hidden === true,
    replacesName: typeof data.replacesName === "string" ? data.replacesName : null,
  };
}

export async function listFloors(buildingId: string): Promise<FloorRecord[]> {
  const buildingRef = await assertBuildingExists(buildingId);
  const snapshot = await buildingRef.collection("floors").get();

  return snapshot.docs
    .map((floorDoc) => mapFloor(floorDoc.id, floorDoc.data()))
    .sort(compareFloorsBySortOrder);
}

export async function createFloor(
  buildingId: string,
  name: string
): Promise<FloorRecord> {
  const trimmedName = name.trim();
  const normalizedName = normalizeFloorName(trimmedName);
  const floorId = getFloorDocumentId(trimmedName);

  if (!trimmedName || !normalizedName || !floorId) {
    throw new ApiError(400, "invalid_floor_name", "A valid floor name is required.");
  }

  const buildingRef = getBuildingRef(buildingId);
  const floorRef = buildingRef.collection("floors").doc(floorId);
  let createdSortOrder = 0;

  await db.runTransaction(async (transaction) => {
    const buildingSnapshot = await transaction.get(buildingRef);
    if (!buildingSnapshot.exists) {
      throw new ApiError(404, "not_found", "Building not found.");
    }

    const existingFloorSnapshot = await transaction.get(floorRef);
    if (existingFloorSnapshot.exists) {
      throw new ApiError(409, "duplicate_floor", "This floor already exists in the selected building.");
    }

    const floorsSnapshot = await transaction.get(
      buildingRef.collection("floors").orderBy("sortOrder")
    );
    createdSortOrder = getNextFloorSortOrder(
      floorsSnapshot.docs.map((floorDoc) => floorDoc.data().sortOrder)
    );

    transaction.create(floorRef, {
      name: trimmedName,
      normalizedName,
      sortOrder: createdSortOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return {
    id: floorId,
    name: trimmedName,
    normalizedName,
    sortOrder: createdSortOrder,
  };
}

export async function deleteFloor(buildingId: string, floorId: string) {
  const buildingRef = await assertBuildingExists(buildingId);
  const floorRef = buildingRef.collection("floors").doc(floorId);
  const floorSnapshot = await floorRef.get();

  if (!floorSnapshot.exists) {
    throw new ApiError(404, "not_found", "Floor not found.");
  }

  const floor = mapFloor(floorSnapshot.id, floorSnapshot.data() ?? {});
  const referencedRooms = await db
    .collection("rooms")
    .where("buildingId", "==", buildingId.trim())
    .where("floor", "==", floor.name)
    .limit(1)
    .get();

  if (!referencedRooms.empty) {
    throw new ApiError(
      409,
      "floor_in_use",
      "Cannot delete this floor while rooms reference it. Move or remove the rooms first."
    );
  }

  await floorRef.update({ hidden: true, updatedAt: serverTimestamp() });
}

export async function updateFloor(
  buildingId: string,
  floorId: string,
  name: string
): Promise<FloorRecord> {
  const trimmedName = name.trim();
  const normalizedName = normalizeFloorName(trimmedName);
  if (!trimmedName || !normalizedName) {
    throw new ApiError(400, "invalid_floor_name", "A valid floor name is required.");
  }

  const buildingRef = getBuildingRef(buildingId);
  const floorRef = buildingRef.collection("floors").doc(floorId);
  let updatedFloor: FloorRecord | null = null;

  await db.runTransaction(async (transaction) => {
    const buildingSnapshot = await transaction.get(buildingRef);
    if (!buildingSnapshot.exists) {
      throw new ApiError(404, "not_found", "Building not found.");
    }

    const floorSnapshot = await transaction.get(floorRef);
    if (!floorSnapshot.exists || floorSnapshot.data()?.hidden === true) {
      throw new ApiError(404, "not_found", "Floor not found.");
    }

    const currentFloor = mapFloor(floorSnapshot.id, floorSnapshot.data() ?? {});
    const allFloors = await transaction.get(buildingRef.collection("floors"));
    const duplicateFloor = allFloors.docs.find(
      (floorDoc) =>
        floorDoc.id !== floorId &&
        floorDoc.data().hidden !== true &&
        normalizeFloorName(String(floorDoc.data().name ?? "")) === normalizedName
    );
    if (duplicateFloor) {
      throw new ApiError(409, "duplicate_floor", "This floor already exists in the selected building.");
    }

    const replacesName = currentFloor.replacesName ?? currentFloor.name;
    transaction.update(floorRef, {
      name: trimmedName,
      normalizedName,
      replacesName,
      updatedAt: serverTimestamp(),
    });

    const referencedRooms = await transaction.get(
      db.collection("rooms")
        .where("buildingId", "==", buildingId.trim())
        .where("floor", "==", currentFloor.name)
    );
    referencedRooms.docs.forEach((roomDoc) => {
      transaction.update(roomDoc.ref, { floor: trimmedName, updatedAt: serverTimestamp() });
    });

    updatedFloor = {
      ...currentFloor,
      name: trimmedName,
      normalizedName,
      replacesName,
    };
  });

  return updatedFloor!;
}
