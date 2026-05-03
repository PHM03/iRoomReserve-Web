import "server-only";

import { resolveCampusAssignment } from "../../campusAssignments";
import { inferCampusFromBuilding } from "@/lib/campuses";
import { db } from "@/lib/configs/firebase-admin";
import { normalizeRole, USER_ROLES } from "@/lib/domain/roles";

export async function getAssignedManagerIds(buildingId: string) {
  const campus = inferCampusFromBuilding({
    id: buildingId
  });
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
