import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertRole, assertVerifiedAuthentication } from "@/lib/server/route-guards";
import { seedDefaultBuildings } from "@/lib/server/services/admin-tools";
import { db } from "@/lib/firebase/firebase-admin";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);

    const result = await seedDefaultBuildings();
    await Promise.all(result.createdBuildingIds.map(async (buildingId) => {
      const snapshot = await db.collection("buildings").doc(buildingId).get();
      const building = snapshot.data() ?? {};
      await writeAuditLog(authContext, {
        action: "building.created",
        entityType: "building",
        entityId: buildingId,
        summary: `Created building ${String(building.name ?? buildingId)}.`,
        buildingId,
        buildingName: typeof building.name === "string" ? building.name : null,
        campus: typeof building.campus === "string" ? building.campus : null,
        changes: { building: { from: null, to: typeof building.name === "string" ? building.name : buildingId } },
      });
    }));
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
