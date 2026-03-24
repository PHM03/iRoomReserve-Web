import type { RequestAuthContext } from "@/lib/server/request-auth";
import { USER_ROLES, type UserRole } from "@/lib/domain/roles";
import { ApiError } from "@/lib/server/api-error";

export function assertAuthenticated(context: RequestAuthContext) {
  if (!context.uid) {
    throw new ApiError(401, "unauthenticated", "Authentication is required.");
  }
}

export function assertOwnsResource(
  context: RequestAuthContext,
  resourceOwnerUid: string
) {
  assertAuthenticated(context);

  if (context.uid !== resourceOwnerUid) {
    throw new ApiError(403, "forbidden", "You are not allowed to access this resource.");
  }
}

export function assertRole(
  context: RequestAuthContext,
  allowedRoles: readonly UserRole[]
) {
  assertAuthenticated(context);

  if (!context.role || !allowedRoles.includes(context.role)) {
    throw new ApiError(403, "forbidden", "You do not have permission to perform this action.");
  }
}

export function assertCanManageBuilding(
  context: RequestAuthContext,
  buildingId: string
) {
  assertAuthenticated(context);

  if (context.role === USER_ROLES.SUPER_ADMIN) {
    return;
  }

  if (
    context.role !== USER_ROLES.ADMIN &&
    context.role !== USER_ROLES.UTILITY
  ) {
    throw new ApiError(403, "forbidden", "You do not have permission to manage this building.");
  }

  if (!context.assignedBuildingId || context.assignedBuildingId !== buildingId) {
    throw new ApiError(403, "forbidden", "You can only manage resources for your assigned building.");
  }
}
