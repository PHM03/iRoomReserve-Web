import { USER_ROLES, type UserRole } from "../auth/roles";
import { ApiError } from "./api-error";

export interface ScheduleAuthorizationContext {
  uid: string | null;
  role: UserRole | null;
  status?: string | null;
  assignedRoomIds?: string[];
  verified: boolean;
}

export interface ScheduleRoomAuthorizationRecord {
  buildingId?: string;
}

export type ScheduleOperation = "read" | "write";

export function isRoomScopedScheduleRole(role: UserRole | null): boolean {
  return role === USER_ROLES.FACULTY || role === USER_ROLES.UTILITY;
}

export function assertScheduleOperation(
  context: ScheduleAuthorizationContext,
  operation: ScheduleOperation
) {
  if (!context.verified || !context.uid) {
    throw new ApiError(401, "unauthenticated", "A verified authentication token is required.");
  }

  if (operation === "read") {
    if (!context.role) {
      throw new ApiError(403, "forbidden", "You do not have permission to access schedules.");
    }
    return;
  }

  if (
    context.role !== USER_ROLES.ADMIN &&
    context.role !== USER_ROLES.SUPER_ADMIN &&
    !isRoomScopedScheduleRole(context.role)
  ) {
    throw new ApiError(403, "forbidden", "You do not have permission to access schedules.");
  }
}

export function assertScheduleRoomAssignment(
  context: ScheduleAuthorizationContext,
  roomId: string,
  room: ScheduleRoomAuthorizationRecord,
  requestedBuildingId?: string | null
) {
  const normalizedRoomId = roomId.trim();
  const actualBuildingId = room.buildingId?.trim() ?? "";
  const normalizedRequestedBuildingId = requestedBuildingId?.trim() ?? "";

  if (
    normalizedRequestedBuildingId &&
    actualBuildingId !== normalizedRequestedBuildingId
  ) {
    throw new ApiError(
      403,
      "room_building_mismatch",
      "The requested room does not belong to the requested building."
    );
  }

  if (!isRoomScopedScheduleRole(context.role)) {
    return;
  }

  if (context.status?.trim().toLowerCase() !== "approved") {
    throw new ApiError(403, "account_not_approved", "Your account is not approved for schedule access.");
  }

  if (!normalizedRoomId || !context.assignedRoomIds?.includes(normalizedRoomId)) {
    throw new ApiError(403, "room_not_assigned", "You are not assigned to this room.");
  }
}
