import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertScheduleAccess } from "@/lib/server/schedule-authorization";
import { getProfessorEmailEligibility } from "@/lib/server/services/schedules";

export const runtime = "nodejs";

const requestSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    await assertScheduleAccess(authContext, { operation: "write", requireRoom: false });

    const { emails } = requestSchema.parse(await request.json());
    return NextResponse.json(await getProfessorEmailEligibility(emails));
  } catch (error) {
    return handleApiError(error);
  }
}
