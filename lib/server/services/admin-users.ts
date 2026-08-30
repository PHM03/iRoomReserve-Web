import "server-only";

import {
  getCampusName,
  getManagedBuildingIdsForCampus,
  resolveCampusAssignment,
} from "@/lib/buildings/campusAssignments";
import { normalizeRole, USER_ROLES, type UserRole } from "@/lib/auth/roles";
import { type ReservationCampus } from "@/lib/buildings/campuses";
import {
  auth as adminAuth,
  db,
  deleteField,
  serverTimestamp,
} from "@/lib/firebase/firebase-admin";

async function clearManagedCampusIfNeeded(uid: string) {
  const userSnapshot = await db.collection("users").doc(uid).get();
  if (!userSnapshot.exists) {
    return null;
  }

  const userData = userSnapshot.data() as {
    role?: string;
    campus?: string | null;
    campusName?: string | null;
    assignedBuilding?: string | null;
    assignedBuildingId?: string | null;
    assignedBuildingIds?: string[];
    assignedBuildings?: unknown;
  };

  const { campus } = resolveCampusAssignment(userData);
  const normalizedRole = normalizeRole(userData.role);
  const shouldClearManagedCampus =
    campus &&
    (normalizedRole === USER_ROLES.ADMIN ||
      normalizedRole === USER_ROLES.UTILITY);

  if (!shouldClearManagedCampus) {
    return null;
  }

  const buildingsSnapshot = await db
    .collection("buildings")
    .where("assignedAdminUid", "==", uid)
    .get();

  return {
    campus,
    buildingRefs: buildingsSnapshot.docs.map((buildingDoc) => buildingDoc.ref),
  };
}

export async function approveUserProfile(uid: string) {
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function approveManagedUserProfile(
  uid: string,
  role: UserRole,
  campus: ReservationCampus
) {
  const managedBuildingIds = getManagedBuildingIdsForCampus(campus);
  if (managedBuildingIds.length === 0) {
    throw new Error("A managed campus is required.");
  }

  const existingAssignment = await clearManagedCampusIfNeeded(uid);
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), {
    status: "approved",
    role,
    campus,
    campusName: getCampusName(campus),
    assignedBuilding: deleteField(),
    assignedBuildingId: deleteField(),
    assignedBuildings: deleteField(),
    assignedBuildingIds: deleteField(),
    updatedAt: serverTimestamp(),
  });
  existingAssignment?.buildingRefs.forEach((buildingRef) => {
    batch.update(buildingRef, {
      assignedAdminUid: null,
      updatedAt: serverTimestamp(),
    });
  });
  managedBuildingIds.forEach((buildingId) => {
    batch.update(db.collection("buildings").doc(buildingId), {
      assignedAdminUid: uid,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function updateManagedUserCampus(
  uid: string,
  campus: ReservationCampus
) {
  const userSnapshot = await db.collection("users").doc(uid).get();
  if (!userSnapshot.exists) {
    throw new Error("User profile not found.");
  }

  if (normalizeRole(userSnapshot.data()?.role) !== USER_ROLES.ADMIN) {
    throw new Error("Only administrator campus assignments can be changed.");
  }

  const managedBuildingIds = getManagedBuildingIdsForCampus(campus);
  if (managedBuildingIds.length === 0) {
    throw new Error("A managed campus is required.");
  }

  const existingAssignment = await clearManagedCampusIfNeeded(uid);
  const batch = db.batch();
  batch.update(userSnapshot.ref, {
    campus,
    campusName: getCampusName(campus),
    assignedBuilding: deleteField(),
    assignedBuildingId: deleteField(),
    assignedBuildings: deleteField(),
    assignedBuildingIds: deleteField(),
    updatedAt: serverTimestamp(),
  });
  existingAssignment?.buildingRefs.forEach((buildingRef) => {
    batch.update(buildingRef, {
      assignedAdminUid: null,
      updatedAt: serverTimestamp(),
    });
  });
  managedBuildingIds.forEach((buildingId) => {
    batch.update(db.collection("buildings").doc(buildingId), {
      assignedAdminUid: uid,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function rejectUserProfile(uid: string) {
  const managedCampus = await clearManagedCampusIfNeeded(uid);
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), {
    status: "rejected",
    campus: deleteField(),
    campusName: deleteField(),
    assignedBuilding: deleteField(),
    assignedBuildingId: deleteField(),
    assignedBuildings: deleteField(),
    assignedBuildingIds: deleteField(),
    updatedAt: serverTimestamp(),
  });
  managedCampus?.buildingRefs.forEach((buildingRef) => {
    batch.update(buildingRef, {
      assignedAdminUid: null,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function disableUserProfile(uid: string) {
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), {
    status: "disabled",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function enableUserProfile(uid: string) {
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function deleteUserProfile(uid: string) {
  const managedCampus = await clearManagedCampusIfNeeded(uid);
  const batch = db.batch();
  batch.delete(db.collection("users").doc(uid));
  managedCampus?.buildingRefs.forEach((buildingRef) => {
    batch.update(buildingRef, {
      assignedAdminUid: null,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();

  try {
    await adminAuth.deleteUser(uid);
  } catch {
    // Firestore deletion remains completed even if Auth deletion fails.
  }
}
