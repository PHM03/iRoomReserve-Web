import { doc, getDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { serverClientDb } from "@/lib/server/firebase-client";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { feedbackRespondSchema } from "@/lib/server/schemas";
import { respondToFeedbackRecord } from "@/lib/server/services/feedback";

async function getFeedbackBuildingId(feedbackId: string) {
  const feedbackSnapshot = await getDoc(doc(serverClientDb, "feedback", feedbackId));
  if (!feedbackSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Feedback entry not found.");
  }

  return (feedbackSnapshot.data() as { buildingId?: string }).buildingId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const { feedbackId } = await params;
    const payload = feedbackRespondSchema.parse(await request.json());
    const buildingId = await getFeedbackBuildingId(feedbackId);

    if (!buildingId) {
      throw new ApiError(400, "missing_building", "Feedback is missing a building.");
    }

    assertCanManageBuilding(authContext, buildingId);
    await respondToFeedbackRecord(feedbackId, payload.response);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
