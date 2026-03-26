import "server-only";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  normalizeAssignedBuildings,
  type AssignedBuildingReference,
} from "@/lib/assignedBuildings";
import { normalizeRole, USER_ROLES, type UserRole } from "@/lib/domain/roles";
import { serverClientDb } from "@/lib/server/firebase-client";
import { getOptionalAdminAuth } from "@/lib/server/firebase-admin";

async function clearAssignedBuildingIfNeeded(uid: string) {
  const userSnapshot = await getDoc(doc(serverClientDb, "users", uid));
  if (!userSnapshot.exists()) {
    return null;
  }

  const userData = userSnapshot.data() as {
    role?: string;
    assignedBuilding?: string | null;
    assignedBuildingId?: string | null;
    assignedBuildingIds?: string[];
    assignedBuildings?: AssignedBuildingReference[];
  };

  const assignedBuildings = normalizeAssignedBuildings(userData);
  const normalizedRole = normalizeRole(userData.role);
  const shouldClearBuilding =
    assignedBuildings.length > 0 &&
    (normalizedRole === USER_ROLES.ADMIN ||
      normalizedRole === USER_ROLES.UTILITY);

  if (!shouldClearBuilding) {
    return null;
  }

  const buildingsSnapshot = await getDocs(
    query(
      collection(serverClientDb, "buildings"),
      where("assignedAdminUid", "==", uid)
    )
  );

  return {
    assignedBuildingIds: assignedBuildings.map((building) => building.id),
    buildingRefs: buildingsSnapshot.docs.map((buildingDoc) => buildingDoc.ref),
  };
}

export async function approveUserProfile(uid: string) {
  const batch = writeBatch(serverClientDb);
  batch.update(doc(serverClientDb, "users", uid), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function approveManagedUserProfile(
  uid: string,
  role: UserRole,
  buildings: AssignedBuildingReference[]
) {
  const assignedBuildings = normalizeAssignedBuildings({
    assignedBuildings: buildings,
  });
  if (assignedBuildings.length === 0) {
    throw new Error("At least one building is required.");
  }

  const existingAssignment = await clearAssignedBuildingIfNeeded(uid);
  const batch = writeBatch(serverClientDb);
  batch.update(doc(serverClientDb, "users", uid), {
    status: "approved",
    role,
    assignedBuilding: assignedBuildings[0].name,
    assignedBuildingId: assignedBuildings[0].id,
    assignedBuildings,
    assignedBuildingIds: assignedBuildings.map((building) => building.id),
    updatedAt: serverTimestamp(),
  });
  existingAssignment?.buildingRefs.forEach((buildingRef) => {
    batch.update(buildingRef, {
      assignedAdminUid: null,
      updatedAt: serverTimestamp(),
    });
  });
  assignedBuildings.forEach((building) => {
    batch.update(doc(serverClientDb, "buildings", building.id), {
      assignedAdminUid: uid,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function rejectUserProfile(uid: string) {
  const assignedBuilding = await clearAssignedBuildingIfNeeded(uid);
  const batch = writeBatch(serverClientDb);
  batch.update(doc(serverClientDb, "users", uid), {
    status: "rejected",
    assignedBuilding: null,
    assignedBuildingId: null,
    assignedBuildings: [],
    assignedBuildingIds: [],
    updatedAt: serverTimestamp(),
  });
  assignedBuilding?.buildingRefs.forEach((buildingRef) => {
    batch.update(buildingRef, {
      assignedAdminUid: null,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function disableUserProfile(uid: string) {
  const batch = writeBatch(serverClientDb);
  batch.update(doc(serverClientDb, "users", uid), {
    status: "disabled",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function enableUserProfile(uid: string) {
  const batch = writeBatch(serverClientDb);
  batch.update(doc(serverClientDb, "users", uid), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function deleteUserProfile(uid: string) {
  const assignedBuilding = await clearAssignedBuildingIfNeeded(uid);
  const batch = writeBatch(serverClientDb);
  batch.delete(doc(serverClientDb, "users", uid));
  assignedBuilding?.buildingRefs.forEach((buildingRef) => {
    batch.update(buildingRef, {
      assignedAdminUid: null,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();

  const adminAuth = getOptionalAdminAuth();
  if (adminAuth) {
    try {
      await adminAuth.deleteUser(uid);
    } catch {
      // Firestore deletion remains the compatibility fallback when Admin SDK is unavailable.
    }
  }
}
