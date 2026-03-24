import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertOwnsResource } from "@/lib/server/route-guards";
import { createReservationSchema } from "@/lib/server/schemas";
import {
  createRecurringReservationRecord,
  createReservationRecord,
} from "@/lib/server/services/reservations";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const payload = createReservationSchema.parse(await request.json());

    assertOwnsResource(authContext, payload.reservation.userId);

    if (payload.type === "single") {
      const id = await createReservationRecord(payload.reservation);
      return NextResponse.json({ id });
    }

    const ids = await createRecurringReservationRecord(
      payload.reservation,
      payload.selectedDays,
      payload.startDate,
      payload.endDate
    );
    return NextResponse.json({ ids });
  } catch (error) {
    return handleApiError(error);
  }
}
