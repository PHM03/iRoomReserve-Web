import { NextRequest, NextResponse } from "next/server";

import { handleApiError, ApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { scheduleInputSchema } from "@/lib/server/schemas";
import {
  assertNoScheduleConflict,
  assertProfessorEmailsAreEligible,
  createScheduleRecord,
} from "@/lib/server/services/schedules";
import { inferCampusFromBuilding } from "@/lib/buildings/campuses";
import { validateScheduleTimes } from "@/lib/schedules/scheduleTimeRules";
import {
  doesScheduleMatchContext,
  normalizeScheduleContext,
} from "@/lib/schedules/scheduleContext";
import {
  assertScheduleAccess,
} from "@/lib/server/schedule-authorization";

export const runtime = "nodejs";

interface ScheduleRecord {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  courseName: string;
  courseCode: string;
  section: string;
  instructorName: string;
  professorEmail: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: string;
  academicYear: string;
  createdBy: string;
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const requestedBuildingId = searchParams.get("buildingId");
    const normalizedRoomId = roomId?.trim() ?? "";
    const room = await assertScheduleAccess(authContext, {
      operation: "read",
      roomId,
      buildingId: requestedBuildingId,
    });
    const adminDb = getOptionalAdminDb();

    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    if (!room) {
      return NextResponse.json([]);
    }

    const buildingId = room.buildingId ?? "";
    const buildingSnapshot = buildingId
      ? await adminDb.collection("buildings").doc(buildingId).get()
      : null;
    const activeScheduleContext = normalizeScheduleContext({
      academicYear: buildingSnapshot?.data()?.activeScheduleAcademicYear,
      semester: buildingSnapshot?.data()?.activeScheduleSemester,
    });

    const snapshot = await adminDb
      .collection("schedules")
      .where("roomId", "==", normalizedRoomId)
      .get();

    const schedules: ScheduleRecord[] = snapshot.docs
      .map((scheduleDoc) => {
        const data = scheduleDoc.data() as {
          roomId?: string;
          roomName?: string;
          buildingId?: string;
          subjectName?: string;
          courseName?: string;
          courseCode?: string;
          section?: string;
          instructorName?: string;
          professorEmail?: string;
          dayOfWeek?: number;
          startTime?: string;
          endTime?: string;
          semester?: string;
          academicYear?: string;
          createdBy?: string;
        };

        return {
          id: scheduleDoc.id,
          roomId: data.roomId ?? "",
          roomName: data.roomName ?? "",
          buildingId: data.buildingId ?? "",
          subjectName: data.subjectName ?? "",
          courseName: data.courseName ?? "",
          courseCode: data.courseCode ?? "",
          section: data.section ?? "",
          instructorName: data.instructorName ?? "",
          professorEmail: data.professorEmail ?? "",
          dayOfWeek: data.dayOfWeek ?? 0,
          startTime: data.startTime ?? "",
          endTime: data.endTime ?? "",
          semester: data.semester ?? "",
          academicYear: data.academicYear ?? "",
          createdBy: data.createdBy ?? "",
        };
      })
      .filter((schedule) => doesScheduleMatchContext(schedule, activeScheduleContext))
      .sort(
        (left, right) =>
          left.dayOfWeek - right.dayOfWeek ||
          left.startTime.localeCompare(right.startTime) ||
          left.roomName.localeCompare(right.roomName)
      );

    return NextResponse.json(schedules);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    const { overrideScheduleIds = [], ...payload } = scheduleInputSchema.parse(
      await request.json()
    );
    await assertScheduleAccess(authContext, {
      operation: "write",
      roomId: payload.roomId,
      buildingId: payload.buildingId,
    });
    await assertProfessorEmailsAreEligible([payload.professorEmail]);

    const safePayload = { ...payload, createdBy: authContext.uid! };

    // Server-side campus time range validation
    const campus = inferCampusFromBuilding({ id: payload.buildingId });
    const timeError = validateScheduleTimes(payload.startTime, payload.endTime, campus);
    if (timeError) {
      throw new ApiError(400, "invalid_time_range", timeError);
    }

    if (overrideScheduleIds.length === 0) {
      await assertNoScheduleConflict(payload);
    }

    const id = await createScheduleRecord(safePayload, overrideScheduleIds);
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const buildingId = searchParams.get("buildingId");
    const semester = searchParams.get("semester");
    const academicYear = searchParams.get("academicYear");

    if (!roomId || !buildingId || !semester || !academicYear) {
      throw new ApiError(
        400,
        "invalid_clear_request",
        "Room, building, semester, and academic year are required."
      );
    }

    await assertScheduleAccess(authContext, {
      operation: "write",
      roomId,
      buildingId,
    });

    const adminDb = getOptionalAdminDb();
    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    const snapshot = await adminDb
      .collection("schedules")
      .where("roomId", "==", roomId.trim())
      .get();
    const schedulesToDelete = snapshot.docs.filter((scheduleDoc) => {
      const data = scheduleDoc.data() as {
        buildingId?: string;
        semester?: string;
        academicYear?: string;
      };

      return (
        data.buildingId === buildingId &&
        data.semester === semester &&
        data.academicYear === academicYear
      );
    });

    for (let index = 0; index < schedulesToDelete.length; index += 500) {
      const batch = adminDb.batch();
      schedulesToDelete.slice(index, index + 500).forEach((scheduleDoc) => {
        batch.delete(scheduleDoc.ref);
      });
      await batch.commit();
    }

    return NextResponse.json({ deletedCount: schedulesToDelete.length });
  } catch (error) {
    return handleApiError(error);
  }
}
