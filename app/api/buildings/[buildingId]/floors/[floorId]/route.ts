import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertCanManageFloors } from "@/lib/server/route-guards";
import { floorUpdateSchema } from "@/lib/server/schemas";
import { deleteFloor, updateFloor } from "@/lib/server/services/floors";
import { db } from "@/lib/firebase/firebase-admin";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    const { buildingId, floorId } = await params;
    assertCanManageFloors(authContext, buildingId);
    const payload = floorUpdateSchema.parse(await request.json());
    const before = (await db.collection("buildings").doc(buildingId).collection("floors").doc(floorId).get()).data();
    const floor = await updateFloor(buildingId, floorId, payload.name);
    const building = (await db.collection("buildings").doc(buildingId).get()).data() ?? {};
    await writeAuditLog(authContext, {
      action: "building.floor_updated",
      entityType: "building",
      entityId: floorId,
      summary: `Renamed floor ${String(before?.name ?? floorId)} to ${floor.name}.`,
      buildingId,
      buildingName: typeof building.name === "string" ? building.name : null,
      campus: typeof building.campus === "string" ? building.campus : null,
      changes: { floor: { from: typeof before?.name === "string" ? before.name : null, to: floor.name } },
    });
    return NextResponse.json(floor);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string; floorId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    const { buildingId, floorId } = await params;
    assertCanManageFloors(authContext, buildingId);
    const before = (await db.collection("buildings").doc(buildingId).collection("floors").doc(floorId).get()).data();
    await deleteFloor(buildingId, floorId);
    const building = (await db.collection("buildings").doc(buildingId).get()).data() ?? {};
    await writeAuditLog(authContext, {
      action: "building.floor_deleted",
      entityType: "building",
      entityId: floorId,
      summary: `Removed floor ${String(before?.name ?? floorId)} from ${String(building.name ?? "building")}.`,
      buildingId,
      buildingName: typeof building.name === "string" ? building.name : null,
      campus: typeof building.campus === "string" ? building.campus : null,
      changes: { floor: { from: typeof before?.name === "string" ? before.name : null, to: null } },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
