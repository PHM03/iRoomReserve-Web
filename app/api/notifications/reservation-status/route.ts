import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/firebase/firebase-admin";
import { isStaleReservationRequestNotification } from "@/lib/notifications/staleReservationRequest";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { assertVerifiedAuthentication } from "@/lib/server/route-guards";
import { getRequestAuthContext } from "@/lib/server/request-auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  notificationId: z.string().trim().min(1).max(160),
}).strict();

function getReservationLocalNow() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(
    valueFor("year"),
    valueFor("month") - 1,
    valueFor("day"),
    valueFor("hour"),
    valueFor("minute"),
    valueFor("second")
  );
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    const { notificationId } = requestSchema.parse(await request.json());
    const notificationSnapshot = await db.collection("notifications").doc(notificationId).get();
    const notification = notificationSnapshot.data();

    if (!notificationSnapshot.exists || notification?.recipientUid !== authContext.uid) {
      throw new ApiError(404, "notification_not_found", "That notification could not be found.");
    }

    const reservationId = typeof notification.reservationId === "string"
      ? notification.reservationId.trim()
      : "";
    const reservationSnapshot = reservationId
      ? await db.collection("reservations").doc(reservationId).get()
      : null;
    const reservation = reservationSnapshot?.exists ? reservationSnapshot.data() : null;

    return NextResponse.json({
      shouldDelete: isStaleReservationRequestNotification(
        reservation ?? null,
        authContext.email,
        getReservationLocalNow()
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
