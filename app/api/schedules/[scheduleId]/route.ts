import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/firebase/firebase-admin";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { scheduleUpdateSchema } from "@/lib/server/schemas";
import {
  assertNoScheduleConflict,
  assertProfessorEmailsAreEligible,
  deleteScheduleRecord,
  updateScheduleRecord,
} from "@/lib/server/services/schedules";
import { inferCampusFromBuilding } from "@/lib/buildings/campuses";
import { validateScheduleTimes } from "@/lib/schedules/scheduleTimeRules";
import {
  assertScheduleAccess,
} from "@/lib/server/schedule-authorization";
import { buildAuditChanges, writeAuditLog } from "@/lib/server/services/audit-logs";

export const runtime = "nodejs";

interface StoredScheduleRecord {
  academicYear?: string;
  buildingId?: string;
  courseCode?: string;
  courseName?: string;
  createdBy?: string;
  dayOfWeek?: number;
  endTime?: string;
  instructorName?: string;
  professorEmail?: string;
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
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    await assertScheduleAccess(authContext, {
      operation: "write",
      requireRoom: false,
    });

    const { scheduleId } = await params;
    const { overrideScheduleIds = [], ...payload } = scheduleUpdateSchema.parse(
      await request.json()
    );
    const existingSchedule = await getScheduleRecord(scheduleId);
    await assertScheduleAccess(authContext, {
      operation: "write",
      roomId: existingSchedule.roomId,
      buildingId: existingSchedule.buildingId,
    });
    const mergedSchedule = {
      ...existingSchedule,
      ...payload,
    };
    const buildingId = mergedSchedule.buildingId;

    await assertScheduleAccess(authContext, {
      operation: "write",
      roomId: mergedSchedule.roomId,
      buildingId,
    });

    const safePayload = { ...payload };
    delete safePayload.createdBy;
    if (safePayload.professorEmail) {
      await assertProfessorEmailsAreEligible([safePayload.professorEmail]);
    }

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
      const conflictSchedule = {
        academicYear: mergedSchedule.academicYear ?? null,
        dayOfWeek: mergedSchedule.dayOfWeek,
        endTime: mergedSchedule.endTime,
        roomId: mergedSchedule.roomId,
        semester: mergedSchedule.semester ?? null,
        startTime: mergedSchedule.startTime,
      };

      if (overrideScheduleIds.length === 0) {
        await assertNoScheduleConflict(conflictSchedule, {
          excludeScheduleId: scheduleId,
        });
      }

      await updateScheduleRecord(scheduleId, safePayload, {
        conflictSchedule,
        overrideScheduleIds,
      });
    } else {
      await updateScheduleRecord(scheduleId, safePayload);
    }

    await writeAuditLog(authContext, {
      action: "schedule.updated",
      entityType: "schedule",
      entityId: scheduleId,
      summary: `Updated the class schedule for ${mergedSchedule.subjectName ?? "a room"}.`,
      buildingId: mergedSchedule.buildingId ?? null,
      changes: buildAuditChanges(
        existingSchedule as Record<string, string | number | boolean | null | undefined>,
        safePayload as Record<string, string | number | boolean | null | undefined>,
      ),
      metadata: { roomName: mergedSchedule.roomName ?? "Room", subjectName: mergedSchedule.subjectName ?? "Class", dayOfWeek: mergedSchedule.dayOfWeek ?? 0, startTime: mergedSchedule.startTime ?? "", endTime: mergedSchedule.endTime ?? "", semester: mergedSchedule.semester ?? "", academicYear: mergedSchedule.academicYear ?? "" },
    });

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
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    await assertScheduleAccess(authContext, {
      operation: "write",
      requireRoom: false,
    });

    const { scheduleId } = await params;
    const existingSchedule = await getScheduleRecord(scheduleId);
    const buildingId = existingSchedule.buildingId;

    await assertScheduleAccess(authContext, {
      operation: "write",
      roomId: existingSchedule.roomId,
      buildingId,
    });
    await deleteScheduleRecord(scheduleId);
    await writeAuditLog(authContext, {
      action: "schedule.deleted",
      entityType: "schedule",
      entityId: scheduleId,
      summary: `Deleted the class schedule for ${existingSchedule.subjectName ?? "a room"}.`,
      buildingId: existingSchedule.buildingId ?? null,
      changes: { schedule: { from: `${existingSchedule.subjectName ?? "Class"} · ${existingSchedule.dayOfWeek ?? ""} · ${existingSchedule.startTime ?? ""}-${existingSchedule.endTime ?? ""}`, to: null } },
      metadata: { roomName: existingSchedule.roomName ?? "Room", subjectName: existingSchedule.subjectName ?? "Class", dayOfWeek: existingSchedule.dayOfWeek ?? 0, startTime: existingSchedule.startTime ?? "", endTime: existingSchedule.endTime ?? "", semester: existingSchedule.semester ?? "", academicYear: existingSchedule.academicYear ?? "" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
