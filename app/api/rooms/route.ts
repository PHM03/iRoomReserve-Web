import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { roomInputSchema } from "@/lib/server/schemas";
import { createRoomRecord } from "@/lib/server/services/rooms";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const payload = roomInputSchema.parse(await request.json());
    assertCanManageBuilding(authContext, payload.buildingId);

    const id = await createRoomRecord(payload);
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
