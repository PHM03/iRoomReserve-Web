import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertRole } from "@/lib/server/route-guards";
import { migrateUserRoles } from "@/lib/server/services/admin-tools";

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);
    assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);

    const result = await migrateUserRoles();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
