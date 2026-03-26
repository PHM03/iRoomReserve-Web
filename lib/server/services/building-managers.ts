import "server-only";

import { collection, getDocs, query, where } from "firebase/firestore";

import { serverClientDb } from "@/lib/server/firebase-client";

export async function getAssignedManagerIds(buildingId: string) {
  const [legacySnapshot, multiSnapshot] = await Promise.all([
    getDocs(
      query(
        collection(serverClientDb, "users"),
        where("assignedBuildingId", "==", buildingId),
        where("status", "==", "approved")
      )
    ),
    getDocs(
      query(
        collection(serverClientDb, "users"),
        where("assignedBuildingIds", "array-contains", buildingId),
        where("status", "==", "approved")
      )
    ),
  ]);

  return [...legacySnapshot.docs, ...multiSnapshot.docs].reduce<string[]>(
    (managerIds, userDoc) => {
      if (!managerIds.includes(userDoc.id)) {
        managerIds.push(userDoc.id);
      }

      return managerIds;
    },
    []
  );
}
