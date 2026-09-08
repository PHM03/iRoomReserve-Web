import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertCanManageFloors } from "@/lib/server/route-guards";
import { floorUpdateSchema } from "@/lib/server/schemas";
import { deleteFloor, updateFloor } from "@/lib/server/services/floors";

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

    return NextResponse.json(await updateFloor(buildingId, floorId, payload.name));
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
    await deleteFloor(buildingId, floorId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
