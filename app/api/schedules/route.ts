import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { handleApiError, ApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { scheduleInputSchema } from "@/lib/server/schemas";
import { createScheduleRecord } from "@/lib/server/services/schedules";
import { inferCampusFromBuilding } from "@/lib/buildings/campuses";
import { validateScheduleTimes } from "@/lib/schedules/scheduleTimeRules";
import {
  doesScheduleMatchContext,
  normalizeScheduleContext,
} from "@/lib/schedules/scheduleContext";

interface ScheduleRecord {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  instructorName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: string;
  academicYear: string;
  createdBy: string;
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const adminDb = getOptionalAdminDb();

    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    if (!roomId) {
      return NextResponse.json([]);
    }

    const roomSnapshot = await adminDb.collection("rooms").doc(roomId).get();
    if (!roomSnapshot.exists) {
      return NextResponse.json([]);
    }

    const roomData = roomSnapshot.data() as { buildingId?: string };
    const buildingId = roomData.buildingId ?? "";
    const buildingSnapshot = buildingId
      ? await adminDb.collection("buildings").doc(buildingId).get()
      : null;
    const activeScheduleContext = normalizeScheduleContext({
      academicYear: buildingSnapshot?.data()?.activeScheduleAcademicYear,
      semester: buildingSnapshot?.data()?.activeScheduleSemester,
    });

    const snapshot = await adminDb
      .collection("schedules")
      .where("roomId", "==", roomId)
      .get();

    const schedules: ScheduleRecord[] = snapshot.docs
      .map((scheduleDoc) => {
        const data = scheduleDoc.data() as {
          roomId?: string;
          roomName?: string;
          buildingId?: string;
          subjectName?: string;
          instructorName?: string;
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
          instructorName: data.instructorName ?? "",
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
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const payload = scheduleInputSchema.parse(await request.json());
    assertCanManageBuilding(authContext, payload.buildingId);

    // Server-side campus time range validation
    const campus = inferCampusFromBuilding({ id: payload.buildingId });
    const timeError = validateScheduleTimes(payload.startTime, payload.endTime, campus);
    if (timeError) {
      throw new ApiError(400, "invalid_time_range", timeError);
    }

    const id = await createScheduleRecord(payload);
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
