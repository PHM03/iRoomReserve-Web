import { NextRequest, NextResponse } from "next/server";

import { floorCreateSchema } from "@/lib/server/schemas";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertCanManageFloors } from "@/lib/server/route-guards";
import { createFloor, listFloors } from "@/lib/server/services/floors";
import { db } from "@/lib/firebase/firebase-admin";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    const { buildingId } = await params;
    assertCanManageFloors(authContext, buildingId);

    return NextResponse.json(await listFloors(buildingId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    const { buildingId } = await params;
    assertCanManageFloors(authContext, buildingId);
    const payload = floorCreateSchema.parse(await request.json());

    const floor = await createFloor(buildingId, payload.name);
    const buildingSnapshot = await db.collection("buildings").doc(buildingId).get();
    const building = buildingSnapshot.data() ?? {};
    await writeAuditLog(authContext, {
      action: "building.floor_created",
      entityType: "building",
      entityId: floor.id,
      summary: `Added floor ${floor.name} to ${String(building.name ?? "building")}.`,
      buildingId,
      buildingName: typeof building.name === "string" ? building.name : null,
      campus: typeof building.campus === "string" ? building.campus : null,
      changes: { floor: { from: null, to: floor.name } },
    });
    return NextResponse.json(floor);
  } catch (error) {
    return handleApiError(error);
  }
}
