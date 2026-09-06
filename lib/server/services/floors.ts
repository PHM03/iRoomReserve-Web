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

  await floorRef.delete();
}
