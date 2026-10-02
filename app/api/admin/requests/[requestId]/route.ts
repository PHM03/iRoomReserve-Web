import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { db } from "@/lib/firebase/firebase-admin";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertCanManageBuilding,
  assertRole,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import { adminRequestRespondSchema } from "@/lib/server/schemas";
import { respondToAdminRequestRecord } from "@/lib/server/services/admin-requests";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

async function getRequestRecord(requestId: string) {
  const requestSnapshot = await db.collection("adminRequests").doc(requestId).get();
  if (!requestSnapshot.exists) {
    throw new ApiError(404, "not_found", "Admin request not found.");
  }

  return requestSnapshot.data() as { buildingId?: string; buildingName?: string; userId?: string; subject?: string };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { requestId } = await params;
    const payload = adminRequestRespondSchema.parse(await request.json());
    const requestRecord = await getRequestRecord(requestId);
    const buildingId = requestRecord.buildingId;

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Admin request is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await respondToAdminRequestRecord(requestId, payload.responseText);
    await writeAuditLog(authContext, {
      action: "admin_request.responded",
      entityType: "admin_request",
      entityId: requestId,
      summary: `Responded to the admin request “${requestRecord.subject ?? "Request"}”.`,
      targetUserId: requestRecord.userId ?? null,
      buildingId,
      buildingName: requestRecord.buildingName ?? null,
      changes: { status: { from: "open", to: "responded" } },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
