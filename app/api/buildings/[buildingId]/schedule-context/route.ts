import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertCanManageBuilding,
  assertRole,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import { z } from "zod";
import { buildAuditChanges, writeAuditLog } from "@/lib/server/services/audit-logs";
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
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
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

    const building = buildingSnapshot.data() ?? {};
    const changes = buildAuditChanges(
      {
        activeScheduleAcademicYear: typeof building.activeScheduleAcademicYear === "string" ? building.activeScheduleAcademicYear : null,
        activeScheduleSemester: typeof building.activeScheduleSemester === "string" ? building.activeScheduleSemester : null,
      },
      {
        activeScheduleAcademicYear: payload.academicYear,
        activeScheduleSemester: payload.semester,
      },
    );
    if (Object.keys(changes).length > 0) {
      await writeAuditLog(authContext, {
        action: "building.updated",
        entityType: "building",
        entityId: buildingId,
        summary: `Updated the active schedule context for ${String(building.name ?? buildingId)}.`,
        buildingId,
        buildingName: typeof building.name === "string" ? building.name : null,
        campus: typeof building.campus === "string" ? building.campus : authContext.campus,
        changes,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
