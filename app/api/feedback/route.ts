import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertOwnsResource } from "@/lib/server/route-guards";
import { feedbackCreateSchema } from "@/lib/server/schemas";
import { createFeedbackRecord } from "@/lib/server/services/feedback";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const payload = feedbackCreateSchema.parse(await request.json());
    assertOwnsResource(authContext, payload.userId);

    const id = await createFeedbackRecord(payload);
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
