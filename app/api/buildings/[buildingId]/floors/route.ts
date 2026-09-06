import { NextRequest, NextResponse } from "next/server";

import { floorCreateSchema } from "@/lib/server/schemas";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertCanManageFloors } from "@/lib/server/route-guards";
import { createFloor, listFloors } from "@/lib/server/services/floors";

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

    return NextResponse.json(await createFloor(buildingId, payload.name));
  } catch (error) {
    return handleApiError(error);
  }
}
