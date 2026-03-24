import { doc, getDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { serverClientDb } from "@/lib/server/firebase-client";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { adminRequestRespondSchema } from "@/lib/server/schemas";
import { respondToAdminRequestRecord } from "@/lib/server/services/admin-requests";

async function getRequestBuildingId(requestId: string) {
  const requestSnapshot = await getDoc(
    doc(serverClientDb, "adminRequests", requestId)
  );
  if (!requestSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Admin request not found.");
  }

  return (requestSnapshot.data() as { buildingId?: string }).buildingId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { requestId } = await params;
    const payload = adminRequestRespondSchema.parse(await request.json());
    const buildingId = await getRequestBuildingId(requestId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Admin request is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await respondToAdminRequestRecord(requestId, payload.responseText);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
