import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import { roomUpdateSchema } from "@/lib/server/schemas";
import { deleteRoomRecord, updateRoomRecord } from "@/lib/server/services/rooms";
import { buildAuditChanges, writeAuditLog } from "@/lib/server/services/audit-logs";

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

async function getRoomAuditInfo(roomId: string) {
  const adminDb = getOptionalAdminDb();
  if (!adminDb) {
    throw new Error(
      "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }
  const roomSnapshot = await adminDb.collection("rooms").doc(roomId).get();
  const data = roomSnapshot.data() as {
    buildingId?: string;
    buildingName?: string;
    name?: string;
    floor?: string;
    roomType?: string;
    acStatus?: string;
    tvProjectorStatus?: string;
    capacity?: number;
    status?: string;
    beaconId?: string | null;
    bleBeaconId?: string | null;
  } | undefined;
  return {
    buildingId: data?.buildingId ?? null,
    buildingName: data?.buildingName ?? null,
    roomName: data?.name ?? roomId,
    floor: data?.floor ?? null,
    name: data?.name ?? null,
    roomType: data?.roomType ?? null,
    acStatus: data?.acStatus ?? null,
    tvProjectorStatus: data?.tvProjectorStatus ?? null,
    capacity: data?.capacity ?? null,
    status: data?.status ?? null,
    beaconId: data?.bleBeaconId ?? data?.beaconId ?? null,
  };
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
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { roomId } = await params;
    const payload = roomUpdateSchema.parse(await request.json());
    const buildingId = await getRoomBuildingId(roomId);
    const auditInfo = await getRoomAuditInfo(roomId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Room is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await updateRoomRecord(roomId, payload);
    await writeAuditLog(authContext, {
      action: "room.updated",
      entityType: "room",
      entityId: roomId,
      buildingId,
      buildingName: auditInfo.buildingName,
      summary: `Updated room ${payload.name ?? auditInfo.roomName}`,
      changes: buildAuditChanges(auditInfo, {
        name: payload.name,
        floor: payload.floor,
        roomType: payload.roomType,
        acStatus: payload.acStatus,
        tvProjectorStatus: payload.tvProjectorStatus,
        capacity: payload.capacity,
        status: payload.status,
        beaconId: payload.beaconId ?? payload.bleBeaconId,
      }),
      metadata: { roomName: payload.name ?? auditInfo.roomName, floor: payload.floor ?? auditInfo.floor },
    });

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
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { roomId } = await params;
    const buildingId = await getRoomBuildingId(roomId);
    const auditInfo = await getRoomAuditInfo(roomId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Room is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await deleteRoomRecord(roomId);
    await writeAuditLog(authContext, {
      action: "room.deleted",
      entityType: "room",
      entityId: roomId,
      buildingId,
      buildingName: auditInfo.buildingName,
      summary: `Deleted room ${auditInfo.roomName}`,
      metadata: { roomName: auditInfo.roomName, floor: auditInfo.floor },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
