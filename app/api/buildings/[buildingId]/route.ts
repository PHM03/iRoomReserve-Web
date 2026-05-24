import { NextRequest, NextResponse } from "next/server";

import { inferCampusFromBuilding } from "@/lib/buildings/campuses";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";
import { normalizeScheduleContext } from "@/lib/schedules/scheduleContext";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { buildingId } = await params;
    const adminDb = getOptionalAdminDb();

    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    const buildingSnapshot = await adminDb.collection("buildings").doc(buildingId).get();

    if (!buildingSnapshot.exists) {
      throw new ApiError(404, "not_found", "Building not found.");
    }

    const data = buildingSnapshot.data() as {
      name?: string;
      code?: string;
      address?: string;
      floors?: number;
      campus?: string | null;
      assignedAdminUid?: string | null;
      activeScheduleSemester?: string | null;
      activeScheduleAcademicYear?: string | null;
    };
    const scheduleContext = normalizeScheduleContext({
      academicYear: data.activeScheduleAcademicYear,
      semester: data.activeScheduleSemester,
    });

    const building = {
      id: buildingSnapshot.id,
      name: data.name ?? "",
      code: data.code ?? "",
      address: data.address ?? "",
      floors: data.floors ?? 0,
      campus:
        inferCampusFromBuilding({
          id: buildingSnapshot.id,
          code: data.code,
          name: data.name,
          campus: data.campus,
      }) ?? "main",
      assignedAdminUid: data.assignedAdminUid ?? null,
      activeScheduleSemester: scheduleContext.semester,
      activeScheduleAcademicYear: scheduleContext.academicYear,
    };

    return NextResponse.json(building);
  } catch (error) {
    return handleApiError(error);
  }
}
