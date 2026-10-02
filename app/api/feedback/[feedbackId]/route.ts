import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { db } from "@/lib/firebase/firebase-admin";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertCanManageBuilding,
  assertRole,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import { feedbackRespondSchema } from "@/lib/server/schemas";
import { respondToFeedbackRecord } from "@/lib/server/services/feedback";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

export const runtime = "nodejs";

async function getFeedbackRecord(feedbackId: string) {
  const feedbackSnapshot = await db.collection("feedback").doc(feedbackId).get();
  if (!feedbackSnapshot.exists) {
    throw new ApiError(404, "not_found", "Feedback entry not found.");
  }

  return feedbackSnapshot.data() as { buildingId?: string; buildingName?: string; roomId?: string; roomName?: string; userId?: string };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { feedbackId } = await params;
    const payload = feedbackRespondSchema.parse(await request.json());
    const feedback = await getFeedbackRecord(feedbackId);
    const buildingId = feedback.buildingId;

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Feedback is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await respondToFeedbackRecord(feedbackId, payload.response);
    await writeAuditLog(authContext, {
      action: "feedback.responded",
      entityType: "feedback",
      entityId: feedbackId,
      summary: `Responded to feedback for ${feedback.roomName ?? "a room"}.`,
      targetUserId: feedback.userId ?? null,
      buildingId,
      buildingName: feedback.buildingName ?? null,
      metadata: { roomName: feedback.roomName ?? "Room" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
