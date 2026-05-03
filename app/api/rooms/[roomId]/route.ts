import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { roomUpdateSchema } from "@/lib/server/schemas";
import { deleteRoomRecord, updateRoomRecord } from "@/lib/server/services/rooms";

async function getRoomBuildingId(roomId: string) {
  const adminDb = getOptionalAdminDb();
  if (!adminDb) {
    throw new Error(
      "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  const roomSnapshot = await adminDb.collection("rooms").doc(roomId).get();
  if (!roomSnapshot.exists) {
    throw new ApiError(404, "not_found", "Room not found.");
  }

  return (roomSnapshot.data() as { buildingId?: string }).buildingId;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { roomId } = await params;
    const adminDb = getOptionalAdminDb();

    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    const roomSnapshot = await adminDb.collection("rooms").doc(roomId).get();

    if (!roomSnapshot.exists) {
      throw new ApiError(404, "not_found", "Room not found.");
    }

    const data = roomSnapshot.data() as {
      beaconId?: string | null;
      bleBeaconId?: string | null;
      name?: string;
      floor?: string;
      roomType?: string;
      acStatus?: string;
      tvProjectorStatus?: string;
      capacity?: number;
      status?: string;
      buildingId?: string;
      buildingName?: string;
      reservedBy?: string | null;
      activeReservationId?: string | null;
    };

    const room = {
      id: roomSnapshot.id,
      beaconId:
        typeof data.bleBeaconId === "string" && data.bleBeaconId.trim().length > 0
          ? data.bleBeaconId.trim()
          : typeof data.beaconId === "string" && data.beaconId.trim().length > 0
            ? data.beaconId.trim()
            : null,
      name: data.name ?? "",
      floor: data.floor ?? "",
      roomType: data.roomType ?? "",
      acStatus: data.acStatus ?? "",
      tvProjectorStatus: data.tvProjectorStatus ?? "",
      capacity: data.capacity ?? 0,
      status: data.status ?? "Available",
      buildingId: data.buildingId ?? "",
      buildingName: data.buildingName ?? "",
      reservedBy: data.reservedBy ?? null,
      activeReservationId: data.activeReservationId ?? null,
    };

    return NextResponse.json(room);
  } catch (error) {
    return handleApiError(error);
  }
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

    return NextResponse.json({
      ok: true
    });
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

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    return handleApiError(error);
  }
}
