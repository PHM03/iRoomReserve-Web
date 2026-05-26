import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { db } from "@/lib/firebase/firebase-admin";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { scheduleUpdateSchema } from "@/lib/server/schemas";
import {
  assertNoScheduleConflict,
  deleteScheduleRecord,
  updateScheduleRecord,
} from "@/lib/server/services/schedules";
import { inferCampusFromBuilding } from "@/lib/buildings/campuses";
import { validateScheduleTimes } from "@/lib/schedules/scheduleTimeRules";

interface StoredScheduleRecord {
  academicYear?: string;
  buildingId?: string;
  courseCode?: string;
  courseName?: string;
  createdBy?: string;
  dayOfWeek?: number;
  endTime?: string;
  instructorName?: string;
  roomId?: string;
  roomName?: string;
  section?: string;
  semester?: string;
  startTime?: string;
  subjectName?: string;
}

async function getScheduleRecord(scheduleId: string) {
  const scheduleSnapshot = await db.collection("schedules").doc(scheduleId).get();
  if (!scheduleSnapshot.exists) {
    throw new ApiError(404, "not_found", "Schedule not found.");
  }

  return scheduleSnapshot.data() as StoredScheduleRecord;
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
    const existingSchedule = await getScheduleRecord(scheduleId);
    const mergedSchedule = {
      ...existingSchedule,
      ...payload,
    };
    const buildingId = mergedSchedule.buildingId;

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Schedule is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);

    // Server-side campus time range validation (only when times are being updated)
    const campus = inferCampusFromBuilding({ id: buildingId });
    const startTime = mergedSchedule.startTime ?? '';
    const endTime = mergedSchedule.endTime ?? '';
    if (startTime && endTime) {
      const timeError = validateScheduleTimes(startTime, endTime, campus);
      if (timeError) {
        throw new ApiError(400, "invalid_time_range", timeError);
      }
    }

    if (
      mergedSchedule.roomId &&
      typeof mergedSchedule.dayOfWeek === "number" &&
      mergedSchedule.startTime &&
      mergedSchedule.endTime
    ) {
      await assertNoScheduleConflict(
        {
          academicYear: mergedSchedule.academicYear ?? null,
          dayOfWeek: mergedSchedule.dayOfWeek,
          endTime: mergedSchedule.endTime,
          roomId: mergedSchedule.roomId,
          semester: mergedSchedule.semester ?? null,
          startTime: mergedSchedule.startTime,
        },
        { excludeScheduleId: scheduleId }
      );
    }

    await updateScheduleRecord(scheduleId, payload);

    return NextResponse.json({ ok: true });
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
    const buildingId = (await getScheduleRecord(scheduleId)).buildingId;

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Schedule is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await deleteScheduleRecord(scheduleId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
