import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import { z } from "zod";
import {
  SCHEDULE_ACADEMIC_YEARS,
  SCHEDULE_SEMESTERS,
} from "@/lib/schedules/scheduleContext";

const scheduleContextSchema = z.object({
  academicYear: z.enum(SCHEDULE_ACADEMIC_YEARS),
  semester: z.enum(SCHEDULE_SEMESTERS),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { buildingId } = await params;
    assertCanManageBuilding(authContext, buildingId);

    const payload = scheduleContextSchema.parse(await request.json());
    const adminDb = getOptionalAdminDb();

    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    const buildingRef = db.collection("buildings").doc(buildingId);
    const buildingSnapshot = await buildingRef.get();

    if (!buildingSnapshot.exists) {
      throw new ApiError(404, "not_found", "Building not found.");
    }

    await buildingRef.update({
      activeScheduleAcademicYear: payload.academicYear,
      activeScheduleSemester: payload.semester,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
