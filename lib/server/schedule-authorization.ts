import "server-only";

import { db } from "@/lib/firebase/firebase-admin";
import { ApiError } from "@/lib/server/api-error";
import type { RequestAuthContext } from "@/lib/server/request-auth";
import { assertCanManageBuilding } from "@/lib/server/route-guards";
import {
  assertScheduleOperation,
  assertScheduleRoomAssignment,
  isRoomScopedScheduleRole,
  type ScheduleOperation,
} from "@/lib/server/schedule-authorization-policy";

export { isRoomScopedScheduleRole };

interface ScheduleAccessOptions {
  operation: ScheduleOperation;
  roomId?: string | null;
  buildingId?: string | null;
  requireRoom?: boolean;
}

export async function assertScheduleAccess(
  context: RequestAuthContext,
  options: ScheduleAccessOptions
) {
  assertScheduleOperation(context, options.operation);

  const normalizedRoomId = options.roomId?.trim() ?? "";
  const mustHaveRoom =
    options.requireRoom ??
    (options.operation === "write" || isRoomScopedScheduleRole(context.role));
  if (!normalizedRoomId) {
    if (mustHaveRoom) {
      throw new ApiError(400, "room_required", "A room is required for schedule access.");
    }
    return null;
  }

  if (options.operation === "write" && !options.buildingId?.trim()) {
    throw new ApiError(400, "missing_building", "Schedule is missing a building.");
  }

  const roomSnapshot = await db.collection("rooms").doc(normalizedRoomId).get();
  if (!roomSnapshot.exists) {
    throw new ApiError(404, "room_not_found", "Room not found.");
  }

  const room = roomSnapshot.data() as { buildingId?: string };
  assertScheduleRoomAssignment(
    context,
    normalizedRoomId,
    room,
    options.buildingId
  );

  if (
    options.operation === "write" &&
    options.buildingId &&
    !isRoomScopedScheduleRole(context.role)
  ) {
    assertCanManageBuilding(context, options.buildingId.trim());
  }

  return room;
}
