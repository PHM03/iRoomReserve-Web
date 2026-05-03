import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { handleApiError, ApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";
import { roomCheckInMethodSchema } from "@/lib/server/schemas";
import {
  approveReservationRecord,
  cancelReservationRecord,
  checkInReservationRecord,
  completeReservationRecord,
  deleteReservationRecord,
  disconnectReservationBeaconRecord,
  rejectReservationRecord,
} from "@/lib/server/services/reservations";

export const runtime = "nodejs";

const reservationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    userEmail: z.email(),
  }),
  z.object({
    action: z.literal("reject"),
    userEmail: z.email(),
    reason: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("cancel"),
    userId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("check-in"),
    userId: z.string().trim().min(1),
    method: roomCheckInMethodSchema.optional(),
  }),
  z.object({
    action: z.literal("disconnect-beacon"),
    userId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("complete"),
    userId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("delete"),
    userId: z.string().trim().min(1),
  }),
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  try {
    const { reservationId } = await params;
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const payload = reservationActionSchema.parse(await request.json());

    switch (payload.action) {
      case "approve": {
        if (!authContext.email) {
          throw new ApiError(400, "missing_email", "Authenticated user email is required.");
        }
        if (authContext.email !== payload.userEmail.trim().toLowerCase()) {
          throw new ApiError(403, "forbidden", "Approver email does not match the authenticated user.");
        }
        await approveReservationRecord(reservationId, authContext.email);
        break;
      }
      case "reject": {
        if (!authContext.email) {
          throw new ApiError(400, "missing_email", "Authenticated user email is required.");
        }
        if (authContext.email !== payload.userEmail.trim().toLowerCase()) {
          throw new ApiError(403, "forbidden", "Approver email does not match the authenticated user.");
        }
        await rejectReservationRecord(
          reservationId,
          authContext.email,
          payload.reason
        );
        break;
      }
      case "cancel":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await cancelReservationRecord(reservationId, payload.userId);
        break;
      case "check-in":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await checkInReservationRecord(
          reservationId,
          payload.userId,
          payload.method
        );
        break;
      case "disconnect-beacon":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await disconnectReservationBeaconRecord(reservationId, payload.userId);
        break;
      case "complete":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await completeReservationRecord(reservationId, payload.userId);
        break;
      case "delete":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await deleteReservationRecord(reservationId, payload.userId);
        break;
      default:
        throw new ApiError(400, "invalid_action", "Unsupported reservation action.");
    }

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    return handleApiError(error);
  }
}
