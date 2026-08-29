import { USER_ROLES, type UserRole } from "../auth/roles";
import { ApiError } from "./api-error";
import type { RequestAuthContext } from "./request-auth";
import { assertCanManageBuilding } from "./route-guards";

export interface ScheduleAuthorizationContext {
  uid: string | null;
  role: UserRole | null;
  status?: string | null;
  verified: boolean;
}

export interface ScheduleRoomAuthorizationRecord {
  buildingId?: string;
}

export type ScheduleOperation = "read" | "write";

export function isRoomScopedScheduleRole(role: UserRole | null): boolean {
  return role === USER_ROLES.UTILITY;
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

  if (
    (context.role === USER_ROLES.FACULTY || context.role === USER_ROLES.UTILITY) &&
    context.status?.trim().toLowerCase() !== "approved"
  ) {
    throw new ApiError(403, "account_not_approved", "Your account is not approved for schedule access.");
  }

  return;
}

export function assertUtilityScheduleBuildingAccess(
  context: RequestAuthContext,
  buildingId: string
) {
  if (context.role !== USER_ROLES.UTILITY) {
    return;
  }

  assertCanManageBuilding(context, buildingId);
}
