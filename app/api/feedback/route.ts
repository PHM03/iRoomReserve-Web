import { NextRequest, NextResponse } from "next/server";

import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanViewBuildingFeedback,
  assertOwnsResource,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import { feedbackCreateSchema } from "@/lib/server/schemas";
import {
  createFeedbackRecord,
  getFeedbackRecordsByBuilding,
  getFeedbackRecordsByUser,
} from "@/lib/server/services/feedback";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() ?? "";
    const buildingId = searchParams.get("buildingId")?.trim() ?? "";

    if ((userId && buildingId) || (!userId && !buildingId)) {
      throw new ApiError(
        400,
        "invalid_feedback_scope",
        "Provide exactly one of userId or buildingId."
      );
    }

    if (userId) {
      assertOwnsResource(authContext, userId);

      return NextResponse.json({ feedback: await getFeedbackRecordsByUser(userId) });
    }

    assertCanViewBuildingFeedback(authContext, buildingId);

    return NextResponse.json(
      await getFeedbackRecordsByBuilding(buildingId)
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    assertVerifiedAuthentication(authContext);

    const payload = feedbackCreateSchema.parse(await request.json());
    assertOwnsResource(authContext, payload.userId);

    const id = await createFeedbackRecord(payload, authContext.role, authContext.uid!);
    await writeAuditLog(authContext, {
      action: "feedback.submitted",
      entityType: "feedback",
      entityId: id,
      summary: `Submitted feedback for ${payload.roomName}.`,
      targetUserId: authContext.uid,
      buildingId: payload.buildingId,
      buildingName: payload.buildingName,
      metadata: { roomName: payload.roomName, rating: payload.rating },
    });
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
