import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertOwnsResource } from "@/lib/server/route-guards";
import { adminRequestCreateSchema } from "@/lib/server/schemas";
import { createAdminRequestRecord } from "@/lib/server/services/admin-requests";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const payload = adminRequestCreateSchema.parse(await request.json());
    assertOwnsResource(authContext, payload.userId);

    const id = await createAdminRequestRecord(payload);
    return NextResponse.json({
      id
    });
  } catch (error) {
    return handleApiError(error);
  }
}
