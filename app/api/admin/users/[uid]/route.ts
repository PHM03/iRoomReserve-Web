import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertRole } from "@/lib/server/route-guards";
import { reservationCampusSchema } from "@/lib/server/schemas";
import {
  approveManagedUserProfile,
  approveUserProfile,
  deleteUserProfile,
  disableUserProfile,
  enableUserProfile,
  rejectUserProfile,
  updateManagedUserCampus,
} from "@/lib/server/services/admin-users";

const managedApprovalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve-user") }),
  z.object({
    action: z.literal("approve-managed"),
    campus: reservationCampusSchema,
    role: z.enum([USER_ROLES.ADMIN, USER_ROLES.UTILITY]),
  }),
  z.object({
    action: z.literal("reject"),
    rejectionReason: z.string().trim().min(1).max(500),
  }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({
    action: z.literal("update-campus"),
    campus: reservationCampusSchema,
  }),
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);

    const { uid } = await params;
    const payload = managedApprovalSchema.parse(await request.json());

    switch (payload.action) {
      case "approve-user":
        await approveUserProfile(uid);
        break;
      case "approve-managed":
        await approveManagedUserProfile(uid, payload.role, payload.campus);
        break;
      case "reject":
        await rejectUserProfile(uid, payload.rejectionReason);
        break;
      case "disable":
        await disableUserProfile(uid);
        break;
      case "enable":
        await enableUserProfile(uid);
        break;
      case "update-campus":
        await updateManagedUserCampus(uid, payload.campus);
        break;
      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);

    const { uid } = await params;
    await deleteUserProfile(uid);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
