import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";
import { getFeedbackRoomSummaries } from "@/lib/server/services/feedback";

const roomSummaryRequestSchema = z.object({
  roomIds: z.array(z.string().trim().min(1)).max(30),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const payload = roomSummaryRequestSchema.parse(await request.json());
    const summaries = await getFeedbackRoomSummaries(payload.roomIds);

    return NextResponse.json({ summaries });
  } catch (error) {
    return handleApiError(error);
  }
}
