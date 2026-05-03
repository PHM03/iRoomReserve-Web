import "server-only";

import { getCampusName, resolveCampusAssignment } from "../../campusAssignments";
import {
  db,
  deleteField,
  serverTimestamp,
} from "@/lib/configs/firebase-admin";
import { normalizeRole } from "@/lib/domain/roles";

const DEFAULT_BUILDINGS = [
  {
    id: "gd1",
    name: "GD1",
    code: "GD1",
    campus: "main",
    address: "Emilio Aguinaldo Highway, Bacoor, Cavite",
    floors: 9,
  },
  {
    id: "gd2",
    name: "GD2",
    code: "GD2",
    campus: "main",
    address: "Emilio Aguinaldo Highway, Bacoor, Cavite",
    floors: 10,
  },
  {
    id: "gd3",
    name: "GD3",
    code: "GD3",
    campus: "main",
    address: "Emilio Aguinaldo Highway, Bacoor, Cavite",
    floors: 10,
  },
  {
    id: "sdca-digital-campus",
    name: "SDCA Digital Campus",
    code: "DIGITAL",
    campus: "digi",
    address: "Emilio Aguinaldo Highway, Bacoor, Cavite",
    floors: 3,
  },
] as const;

export async function seedDefaultBuildings() {
  const existingSnapshot = await db.collection("buildings").get();
  const existingIds = new Set(existingSnapshot.docs.map((buildingDoc) => buildingDoc.id));
  const created: string[] = [];
  const skipped: string[] = [];

  for (const building of DEFAULT_BUILDINGS) {
    if (existingIds.has(building.id)) {
      skipped.push(building.name);
      continue;
    }

    await db.collection("buildings").doc(building.id).set({
      ...building,
      assignedAdminUid: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    created.push(building.name);
  }

  return {
    created,
    skipped
  };
}

export async function migrateUserRoles() {
  const usersSnapshot = await db.collection("users").get();
  const batch = db.batch();
  let updated = 0;

  usersSnapshot.docs.forEach((userDoc) => {
    const nextRole = normalizeRole((userDoc.data() as { role?: string }).role);
    if (!nextRole || userDoc.data().role === nextRole) {
      return;
    }

    batch.update(userDoc.ref, {
      role: nextRole,
      updatedAt: serverTimestamp(),
    });
    updated += 1;
  });

  if (updated > 0) {
    await batch.commit();
  }

  return {
    updated
  };
}

export async function migrateUserCampusAssignments() {
  const usersSnapshot = await db.collection("users").get();
  let batch = db.batch();
  let operationCount = 0;
  let updated = 0;
  let skipped = 0;

  const commitBatch = async () => {
    if (operationCount === 0) {
      return;
    }

    await batch.commit();
    batch = db.batch();
    operationCount = 0;
  };

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data() as {
      campus?: string | null;
      campusName?: string | null;
      assignedBuilding?: string | null;
      assignedBuildingId?: string | null;
      assignedBuildingIds?: string[];
      assignedBuildings?: unknown;
    };
    const { campus, campusName } = resolveCampusAssignment(userData);

    if (!campus || !campusName) {
      skipped += 1;
      continue;
    }

    const currentCampus = resolveCampusAssignment({
      campus: userData.campus,
      campusName: userData.campusName,
    });
    const needsUpdate =
      currentCampus.campus !== campus ||
      userData.campusName !== getCampusName(campus) ||
      typeof userData.assignedBuilding === "string" ||
      typeof userData.assignedBuildingId === "string" ||
      Array.isArray(userData.assignedBuildingIds) ||
      Array.isArray(userData.assignedBuildings);

    if (!needsUpdate) {
      skipped += 1;
      continue;
    }

    batch.update(userDoc.ref, {
      campus,
      campusName,
      assignedBuilding: deleteField(),
      assignedBuildingId: deleteField(),
      assignedBuildingIds: deleteField(),
      assignedBuildings: deleteField(),
      updatedAt: serverTimestamp(),
    });
    operationCount += 1;
    updated += 1;

    if (operationCount >= 400) {
      await commitBatch();
    }
  }

  await commitBatch();

  return {
    skipped,
    updated
  };
}
