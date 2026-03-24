import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertRole } from "@/lib/server/route-guards";
import {
  approveManagedUserProfile,
  approveUserProfile,
  deleteUserProfile,
  disableUserProfile,
  enableUserProfile,
  rejectUserProfile,
} from "@/lib/server/services/admin-users";

const managedApprovalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve-user"),
  }),
  z.object({
    action: z.literal("approve-managed"),
    buildingId: z.string().trim().min(1),
    buildingName: z.string().trim().min(1),
    role: z.enum([USER_ROLES.ADMIN, USER_ROLES.UTILITY]),
  }),
  z.object({
    action: z.literal("reject"),
  }),
  z.object({
    action: z.literal("disable"),
  }),
  z.object({
    action: z.literal("enable"),
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
        await approveManagedUserProfile(
          uid,
          payload.role,
          payload.buildingId,
          payload.buildingName
        );
        break;
      case "reject":
        await rejectUserProfile(uid);
        break;
      case "disable":
        await disableUserProfile(uid);
        break;
      case "enable":
        await enableUserProfile(uid);
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
