import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAssistantBuildingIds } from "@/lib/ai/roomAssistantRealtime";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { assertVerifiedAuthentication } from "@/lib/server/route-guards";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { getSanitizedRoomReservations } from "@/lib/server/services/room-availability-snapshot";

export const runtime = "nodejs";

const requestSchema = z.object({
  buildingIds: z.array(z.string().trim().min(1).max(160)).min(1).max(10),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    const payload = requestSchema.parse(await request.json());
    const allowedBuildingIds = new Set(getAssistantBuildingIds());
    const buildingIds = [...new Set(payload.buildingIds)];

    if (buildingIds.some((buildingId) => !allowedBuildingIds.has(buildingId))) {
      throw new ApiError(403, "building_out_of_scope", "The requested building is outside the supported campus scope.");
    }

    return NextResponse.json({
      reservations: await getSanitizedRoomReservations(buildingIds, authContext.uid!),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
