import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { handleApiError, ApiError } from "@/lib/server/api-error";
import { db } from "@/lib/firebase/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertCanManageBuilding } from "@/lib/server/route-guards";
import { roomCheckInMethodSchema } from "@/lib/server/schemas";
import {
  approveReservationRecord,
  cancelReservationRecord,
  checkInReservationRecord,
  confirmFinishedReservationRecord,
  completeReservationRecord,
  deleteReservationRecord,
  disconnectReservationBeaconRecord,
  rejectReservationRecord,
  sendReservationPresenceHeartbeatRecord,
  startReservationPresenceMonitorRecord,
  stopReservationPresenceMonitorRecord,
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
    action: z.literal("start-monitor"),
    userId: z.string().trim().min(1),
    beaconId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("presence-heartbeat"),
    userId: z.string().trim().min(1),
    appState: z.enum(["foreground", "background"]),
    beaconId: z.string().trim().min(1).optional(),
    bluetoothOn: z.boolean(),
    checkedAt: z.string().trim().min(1).optional(),
    inRange: z.boolean(),
    rssi: z.number().nullable().optional(),
  }),
  z.object({
    action: z.literal("stop-monitor"),
    userId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("complete"),
    userId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("confirm-finish"),
    userId: z.string().trim().min(1).optional(),
  }),
  z.object({
    action: z.literal("delete"),
    userId: z.string().trim().min(1),
  }),
]);

function getTodayDateKeyInReservationTimeZone(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

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
      case "start-monitor":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await startReservationPresenceMonitorRecord(
          reservationId,
          payload.userId,
          payload.beaconId
        );
        break;
      case "presence-heartbeat": {
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        const result = await sendReservationPresenceHeartbeatRecord(reservationId, {
          appState: payload.appState,
          beaconId: payload.beaconId,
          bluetoothOn: payload.bluetoothOn,
          checkedAt: payload.checkedAt,
          inRange: payload.inRange,
          rssi: payload.rssi,
          userId: payload.userId,
        });
        return NextResponse.json(result);
      }
      case "stop-monitor":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await stopReservationPresenceMonitorRecord(reservationId, payload.userId);
        break;
      case "complete":
        if (authContext.uid !== payload.userId) {
          throw new ApiError(403, "forbidden", "Authenticated user does not match the reservation owner.");
        }
        await completeReservationRecord(reservationId, payload.userId);
        break;
      case "confirm-finish": {
        const reservationSnapshot = await db
          .collection("reservations")
          .doc(reservationId)
          .get();

        if (!reservationSnapshot.exists) {
          throw new ApiError(404, "not_found", "Reservation not found.");
        }

        const reservation = reservationSnapshot.data() as {
          buildingId?: string;
        };

        if (!reservation.buildingId) {
          throw new ApiError(400, "invalid_reservation", "Reservation building is missing.");
        }

        assertCanManageBuilding(authContext, reservation.buildingId);
        await confirmFinishedReservationRecord(reservationId, authContext.uid!);
        break;
      }
      case "delete":
        const reservationSnapshot = await db
          .collection("reservations")
          .doc(reservationId)
          .get();

        if (!reservationSnapshot.exists) {
          throw new ApiError(404, "not_found", "Reservation not found.");
        }

        const reservation = reservationSnapshot.data() as {
          buildingId?: string;
          date?: string;
          status?: string;
          userId?: string;
        };

        if (!reservation.userId) {
          throw new ApiError(400, "invalid_reservation", "Reservation owner is missing.");
        }

        if (authContext.uid === reservation.userId) {
          await deleteReservationRecord(reservationId, reservation.userId);
          break;
        }

        const todayDateKey = getTodayDateKeyInReservationTimeZone();
        const isExpiredPendingReservation =
          reservation.status === "pending" &&
          typeof reservation.date === "string" &&
          reservation.date < todayDateKey;

        if (!reservation.buildingId || !isExpiredPendingReservation) {
          throw new ApiError(403, "forbidden", "You cannot delete this reservation.");
        }

        assertCanManageBuilding(authContext, reservation.buildingId);
        await deleteReservationRecord(reservationId, reservation.userId);
        break;
      default:
        throw new ApiError(400, "invalid_action", "Unsupported reservation action.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
