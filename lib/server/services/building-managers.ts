import "server-only";

import { resolveCampusAssignment } from "@/lib/buildings/campusAssignments";
import { inferCampusFromBuilding } from "@/lib/buildings/campuses";
import { db } from "@/lib/firebase/firebase-admin";
import { normalizeRole, USER_ROLES } from "@/lib/auth/roles";
import type { ReservationApprovalStep } from "@/lib/reservations/reservation-approval";

export async function getAssignedManagerIds(buildingId: string) {
  const campus = inferCampusFromBuilding({ id: buildingId });
  const [campusSnapshot, legacySnapshot, multiSnapshot] = await Promise.all([
    campus
      ? db.collection("users").where("campus", "==", campus).get()
      : Promise.resolve(null),
    db.collection("users").where("assignedBuildingId", "==", buildingId).get(),
    db
      .collection("users")
      .where("assignedBuildingIds", "array-contains", buildingId)
      .get(),
  ]);

  const candidateDocs = [
    ...(campusSnapshot?.docs ?? []),
    ...legacySnapshot.docs,
    ...multiSnapshot.docs,
  ];

  return candidateDocs.reduce<string[]>(
    (managerIds, userDoc) => {
      const userData = userDoc.data() as {
        role?: string | null;
        status?: string | null;
        campus?: string | null;
        campusName?: string | null;
        assignedBuilding?: string | null;
        assignedBuildingId?: string | null;
        assignedBuildingIds?: string[];
        assignedBuildings?: unknown;
      };
      const normalizedRole = normalizeRole(userData.role);
      const resolvedCampus = resolveCampusAssignment(userData).campus;
      const canManageCampus =
        Boolean(campus) &&
        resolvedCampus === campus;
      const canManageLegacyBuilding =
        userData.assignedBuildingId === buildingId ||
        userData.assignedBuildingIds?.includes(buildingId) === true;

      if (
        userData.status !== "approved" ||
        (normalizedRole !== USER_ROLES.ADMIN &&
          normalizedRole !== USER_ROLES.UTILITY) ||
        (!canManageCampus && !canManageLegacyBuilding)
      ) {
        return managerIds;
      }

      if (!managerIds.includes(userDoc.id)) {
        managerIds.push(userDoc.id);
      }

      return managerIds;
    },
    []
  );
}

export async function getAssignedBuildingAdminIds(buildingId: string) {
  const managerIds = await getAssignedManagerIds(buildingId);
  const managerSnapshots = await Promise.all(
    managerIds.map((managerId) => db.collection("users").doc(managerId).get())
  );

  return managerSnapshots.flatMap((managerSnapshot) => {
    if (!managerSnapshot.exists) {
      return [];
    }

    const managerData = managerSnapshot.data() as {
      role?: string | null;
      status?: string | null;
    };

    return managerData.status === "approved" &&
      normalizeRole(managerData.role) === USER_ROLES.ADMIN
      ? [managerSnapshot.id]
      : [];
  });
}

export async function getResponsibleBuildingAdminIds(
  approvalFlow?: ReservationApprovalStep[]
) {
  const buildingAdminStep = approvalFlow?.find(
    (approvalStep) => approvalStep.role === "building_admin"
  );
  const email = buildingAdminStep?.email.trim().toLowerCase();

  if (!email) {
    return [];
  }

  const usersSnapshot = await db
    .collection("users")
    .where("email", "==", email)
    .where("status", "==", "approved")
    .get();

  return usersSnapshot.docs
    .filter((userDoc) => {
      const userData = userDoc.data() as { role?: string | null };
      return normalizeRole(userData.role) === USER_ROLES.ADMIN;
    })
    .map((userDoc) => userDoc.id);
}
