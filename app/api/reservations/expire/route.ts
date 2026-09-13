import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";
import { expireOpenReservationsForUser } from "@/lib/server/services/reservations";

export const runtime = "nodejs";

/** Marks the signed-in user's unfinished reservations as expired once ended. */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    return NextResponse.json(
      await expireOpenReservationsForUser(authContext.uid!)
    );
  } catch (error) {
    return handleApiError(error);
  }
}
