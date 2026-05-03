import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { db } from "@/lib/configs/firebase-admin";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { scheduleUpdateSchema } from "@/lib/server/schemas";
import {
  deleteScheduleRecord,
  updateScheduleRecord,
} from "@/lib/server/services/schedules";

async function getScheduleBuildingId(scheduleId: string) {
  const scheduleSnapshot = await db.collection("schedules").doc(scheduleId).get();
  if (!scheduleSnapshot.exists) {
    throw new ApiError(404, "not_found", "Schedule not found.");
  }

  return (scheduleSnapshot.data() as { buildingId?: string }).buildingId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { scheduleId } = await params;
    const payload = scheduleUpdateSchema.parse(await request.json());
    const buildingId = await getScheduleBuildingId(scheduleId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Schedule is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await updateScheduleRecord(scheduleId, payload);

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { scheduleId } = await params;
    const buildingId = await getScheduleBuildingId(scheduleId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Schedule is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await deleteScheduleRecord(scheduleId);

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    return handleApiError(error);
  }
}
