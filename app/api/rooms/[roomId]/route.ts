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
import { roomUpdateSchema } from "@/lib/server/schemas";
import { deleteRoomRecord, updateRoomRecord } from "@/lib/server/services/rooms";

async function getRoomBuildingId(roomId: string) {
  const roomSnapshot = await getDoc(doc(serverClientDb, "rooms", roomId));
  if (!roomSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Room not found.");
  }

  return (roomSnapshot.data() as { buildingId?: string }).buildingId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { roomId } = await params;
    const payload = roomUpdateSchema.parse(await request.json());
    const buildingId = await getRoomBuildingId(roomId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Room is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await updateRoomRecord(roomId, payload);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { roomId } = await params;
    const buildingId = await getRoomBuildingId(roomId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Room is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await deleteRoomRecord(roomId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
