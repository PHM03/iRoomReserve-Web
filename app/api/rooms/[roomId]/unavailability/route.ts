import { NextRequest, NextResponse } from "next/server";

import { handleApiError, ApiError } from "@/lib/server/api-error";
import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertCanManageBuilding, assertVerifiedAuthentication } from "@/lib/server/route-guards";
import { manualRoomUnavailabilitySchema } from "@/lib/server/schemas";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

async function getManagedRoom(request: NextRequest, roomId: string) {
  const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
  assertVerifiedAuthentication(authContext);
  const room = await db.collection("rooms").doc(roomId).get();
  if (!room.exists) throw new ApiError(404, "not_found", "Room not found.");
  const buildingId = typeof room.data()?.buildingId === "string" ? room.data()!.buildingId : "";
  if (!buildingId) throw new ApiError(400, "invalid_room", "This room has no building assignment.");
  assertCanManageBuilding(authContext, buildingId);
  return { authContext, buildingId, room };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const payload = manualRoomUnavailabilitySchema.parse(await request.json());
    const { authContext, buildingId, room } = await getManagedRoom(request, roomId);
    const id = `${roomId}_${payload.date}_${payload.startTime}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    await db.collection("roomUnavailability").doc(id).set({
      ...payload,
      roomId,
      buildingId,
      createdBy: authContext.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const roomData = room.data() ?? {};
    await writeAuditLog(authContext, {
      action: "room.unavailability_added",
      entityType: "room",
      entityId: roomId,
      summary: `Marked ${String(roomData.name ?? "room")} unavailable on ${payload.date}.`,
      buildingId,
      buildingName: typeof roomData.buildingName === "string" ? roomData.buildingName : null,
      campus: typeof roomData.campus === "string" ? roomData.campus : null,
      metadata: { roomName: typeof roomData.name === "string" ? roomData.name : "Room", date: payload.date, startTime: payload.startTime, endTime: payload.endTime },
    });
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const payload = manualRoomUnavailabilitySchema.parse(await request.json());
    const { authContext, buildingId, room } = await getManagedRoom(request, roomId);
    const id = `${roomId}_${payload.date}_${payload.startTime}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    await db.collection("roomUnavailability").doc(id).delete();
    const roomData = room.data() ?? {};
    await writeAuditLog(authContext, {
      action: "room.unavailability_removed",
      entityType: "room",
      entityId: roomId,
      summary: `Restored availability for ${String(roomData.name ?? "room")} on ${payload.date}.`,
      buildingId,
      buildingName: typeof roomData.buildingName === "string" ? roomData.buildingName : null,
      campus: typeof roomData.campus === "string" ? roomData.campus : null,
      metadata: { roomName: typeof roomData.name === "string" ? roomData.name : "Room", date: payload.date, startTime: payload.startTime, endTime: payload.endTime },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
