import "server-only";

import {
  getCampusName,
  getManagedBuildingIdsForCampus,
  resolveCampusAssignment,
} from "@/lib/buildings/campusAssignments";
import { normalizeRole, USER_ROLES, type UserRole } from "@/lib/auth/roles";
import { type ReservationCampus } from "@/lib/buildings/campuses";
import { isEligibleDsasProfessor, planMainCampusDsasDesignation } from "@/lib/auth/dsas-designation";
import { ApiError } from "@/lib/server/api-error";
import {
  auth as adminAuth,
  db,
  deleteField,
  serverTimestamp,
} from "@/lib/firebase/firebase-admin";

const mainCampusDsasAssignmentRef = db
  .collection("systemSettings")
  .doc("main-campus-dsas");

export async function assignMainCampusDsasDesignation(uid: string) {
  const targetRef = db.collection("users").doc(uid);

  await db.runTransaction(async (transaction) => {
    const [targetSnapshot, assignmentSnapshot, designatedSnapshot] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(mainCampusDsasAssignmentRef),
      transaction.get(
        db
          .collection("users")
          .where("designation", "==", "DSAS")
          .where("designationCampus", "==", "main")
      ),
    ]);

    if (!targetSnapshot.exists) {
      throw new ApiError(404, "not_found", "Professor account was not found.");
    }

    const targetData = targetSnapshot.data() as {
      role?: string | null;
      status?: string | null;
    };
    if (!isEligibleDsasProfessor({ uid, ...targetData })) {
      throw new ApiError(
        400,
        "invalid_dsas_designation_target",
        "Only approved Faculty Professor accounts can be designated as DSAS."
      );
    }

    const profiles = designatedSnapshot.docs.map((userDoc) => ({
      uid: userDoc.id,
      ...(userDoc.data() as {
        role?: string | null;
        status?: string | null;
        designation?: string | null;
        designationCampus?: string | null;
      }),
    }));
    profiles.push({ uid, ...targetData });

    const assignmentData = assignmentSnapshot.data() as {
      mainCampusDsasUid?: string | null;
    } | undefined;
    const previousUid = assignmentData?.mainCampusDsasUid;
    if (previousUid && previousUid !== uid && !profiles.some((profile) => profile.uid === previousUid)) {
      const previousSnapshot = await transaction.get(db.collection("users").doc(previousUid));
      if (previousSnapshot.exists) {
        profiles.push({
          uid: previousUid,
          ...(previousSnapshot.data() as {
            role?: string | null;
            status?: string | null;
            designation?: string | null;
            designationCampus?: string | null;
          }),
        });
      }
    }

    const plan = planMainCampusDsasDesignation(uid, profiles);
    const oldUidsToClear = [
      ...plan.uidsToClear,
      ...(previousUid && previousUid !== uid && profiles.some((profile) => profile.uid === previousUid)
        ? [previousUid]
        : []),
    ];
    for (const oldUid of new Set(oldUidsToClear)) {
      transaction.update(db.collection("users").doc(oldUid), {
        designation: deleteField(),
        designationCampus: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.update(targetRef, {
      designation: "DSAS",
      designationCampus: "main",
      updatedAt: serverTimestamp(),
    });
    transaction.set(mainCampusDsasAssignmentRef, {
      mainCampusDsasUid: uid,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function removeMainCampusDsasDesignation(uid: string) {
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, assignmentSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(mainCampusDsasAssignmentRef),
    ]);
    const assignmentData = assignmentSnapshot.data() as {
      mainCampusDsasUid?: string | null;
    } | undefined;

    if (userSnapshot.exists) {
      transaction.update(userRef, {
        designation: deleteField(),
        designationCampus: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }

    if (assignmentData?.mainCampusDsasUid === uid) {
      transaction.set(mainCampusDsasAssignmentRef, {
        mainCampusDsasUid: null,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

async function clearDsasDesignationBeforeAccountChange(uid: string) {
  await removeMainCampusDsasDesignation(uid);
}

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
    rejectionReason: deleteField(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function approveManagedUserProfile(
  uid: string,
  role: UserRole,
  campus: ReservationCampus
) {
  await clearDsasDesignationBeforeAccountChange(uid);
  const managedBuildingIds = getManagedBuildingIdsForCampus(campus);
  if (managedBuildingIds.length === 0) {
    throw new Error("A managed campus is required.");
  }

  const existingAssignment = await clearManagedCampusIfNeeded(uid);
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), {
    status: "approved",
    rejectionReason: deleteField(),
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

export async function rejectUserProfile(uid: string, rejectionReason: string) {
  await clearDsasDesignationBeforeAccountChange(uid);
  const managedCampus = await clearManagedCampusIfNeeded(uid);
  const batch = db.batch();
  batch.update(db.collection("users").doc(uid), {
    status: "rejected",
    rejectionReason: rejectionReason.trim(),
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
  await clearDsasDesignationBeforeAccountChange(uid);
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
    rejectionReason: deleteField(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function deleteUserProfile(uid: string) {
  await clearDsasDesignationBeforeAccountChange(uid);
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
