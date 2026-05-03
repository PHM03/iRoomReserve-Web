import { NextRequest, NextResponse } from "next/server";

import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";
import { getAverageFeedbackSentiment } from "@/lib/server/services/feedback";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId")?.trim() ?? "";

    if (!roomId) {
      throw new ApiError(400, "missing_room_id", "A room id is required.");
    }

    const average = await getAverageFeedbackSentiment(roomId);

    return NextResponse.json({
      average
    });
  } catch (error) {
    return handleApiError(error);
  }
}
