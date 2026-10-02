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
import { roomStatusUpdateSchema } from "@/lib/server/schemas";
import { updateRoomStatusRecord } from "@/lib/server/services/rooms";
import { buildAuditChanges, writeAuditLog } from "@/lib/server/services/audit-logs";

async function getRoomBuildingId(roomId: string) {
  const roomSnapshot = await db.collection("rooms").doc(roomId).get();
  if (!roomSnapshot.exists) {
    throw new ApiError(404, "not_found", "Room not found.");
  }

  return { buildingId: (roomSnapshot.data() as { buildingId?: string }).buildingId, data: roomSnapshot.data() ?? {} };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { roomId } = await params;
    const payload = roomStatusUpdateSchema.parse(await request.json());
    const { buildingId, data: room } = await getRoomBuildingId(roomId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Room is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await updateRoomStatusRecord(roomId, payload);
    await writeAuditLog(authContext, {
      action: "room.status_changed",
      entityType: "room",
      entityId: roomId,
      summary: `Changed ${String(room.name ?? "room")} status to ${payload.status}.`,
      buildingId,
      buildingName: typeof room.buildingName === "string" ? room.buildingName : null,
      campus: typeof room.campus === "string" ? room.campus : null,
      changes: buildAuditChanges({ status: typeof room.status === "string" ? room.status : null }, { status: payload.status }),
      metadata: { roomName: typeof room.name === "string" ? room.name : "Room" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
