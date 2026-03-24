import { doc, getDoc } from "firebase/firestore";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { handleApiError, ApiError } from "@/lib/server/api-error";
import { serverClientDb } from "@/lib/server/firebase-client";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
} from "@/lib/server/route-guards";
import { roomCheckInMethodSchema } from "@/lib/server/schemas";
import {
  approveReservationRecord,
  cancelReservationRecord,
  checkInReservationRecord,
  completeReservationRecord,
  deleteReservationRecord,
  rejectReservationRecord,
} from "@/lib/server/services/reservations";

const reservationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
  }),
  z.object({
    action: z.literal("reject"),
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
    action: z.literal("complete"),
    userId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("delete"),
    userId: z.string().trim().min(1),
  }),
]);

async function getReservationBuildingId(reservationId: string) {
  const reservationSnapshot = await getDoc(
    doc(serverClientDb, "reservations", reservationId)
  );
  if (!reservationSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  return (reservationSnapshot.data() as { buildingId?: string }).buildingId;
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
        assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);
        const buildingId = await getReservationBuildingId(reservationId);
        if (!buildingId) {
          throw new ApiError(400, "missing_building", "Reservation is missing a building.");
        }
        assertCanManageBuilding(authContext, buildingId);
        await approveReservationRecord(reservationId);
        break;
      }
      case "reject": {
        assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);
        const buildingId = await getReservationBuildingId(reservationId);
        if (!buildingId) {
          throw new ApiError(400, "missing_building", "Reservation is missing a building.");
        }
        assertCanManageBuilding(authContext, buildingId);
        await rejectReservationRecord(reservationId);
        break;
      }
      case "cancel":
        await cancelReservationRecord(reservationId, payload.userId);
        break;
      case "check-in":
        await checkInReservationRecord(
          reservationId,
          payload.userId,
          payload.method
        );
        break;
      case "complete":
        await completeReservationRecord(reservationId, payload.userId);
        break;
      case "delete":
        await deleteReservationRecord(reservationId, payload.userId);
        break;
      default:
        throw new ApiError(400, "invalid_action", "Unsupported reservation action.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
