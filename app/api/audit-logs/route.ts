import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { USER_ROLES } from "@/lib/auth/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertRole } from "@/lib/server/route-guards";
import { db } from "@/lib/firebase/firebase-admin";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

const passwordChangeSchema = z.object({
  action: z.literal("account.password_changed"),
});

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertAuthenticated(authContext);
    if (!authContext.verified) {
      throw new ApiError(401, "unauthenticated", "A verified sign-in is required.");
    }
    assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);

    const searchParams = new URL(request.url).searchParams;
    const campus = searchParams.get("campus");
    const performedBy = searchParams.get("performedBy")?.trim();
    const allUsers = searchParams.get("allUsers") === "true";
    if (!performedBy && !allUsers) {
      return NextResponse.json({ logs: [] });
    }

    let logsQuery: FirebaseFirestore.Query = db.collection("auditLogs");
    if (campus === "main" || campus === "digi") {
      logsQuery = logsQuery.where("campus", "==", campus);
    }
    if (performedBy) {
      logsQuery = logsQuery.where("actorUid", "==", performedBy);
    }
    const snapshot = await logsQuery.orderBy("createdAt", "desc").limit(300).get();
    const rawLogs = snapshot.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown> & {
          campus?: string | null;
          createdAt?: { toDate?: () => Date } | null;
          targetUserId?: string | null;
          targetName?: string | null;
          targetEmail?: string | null;
          targetRole?: string | null;
          metadata?: { requester?: string };
        };
        const createdAt = data.createdAt?.toDate?.();
        return {
          id: doc.id,
          ...data,
          createdAt: createdAt instanceof Date ? createdAt.toISOString() : null,
        };
      });
    const targetIds = [...new Set(rawLogs
      .filter((log) => log.targetUserId && !log.targetName)
      .map((log) => String(log.targetUserId)))];
    const targetProfiles = await Promise.all(targetIds.map(async (uid) => {
      const targetSnapshot = await db.collection("users").doc(uid).get();
      const target = targetSnapshot.data() as {
        firstName?: string;
        lastName?: string;
        email?: string;
        role?: string;
      } | undefined;
      return [uid, target] as const;
    }));
    const targetProfilesById = new Map(targetProfiles);
    const logs = rawLogs.map((log) => {
      const target = log.targetUserId
        ? targetProfilesById.get(String(log.targetUserId))
        : undefined;
      const targetName = [target?.firstName, target?.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ");
      const metadata = log.metadata as { requester?: string } | undefined;
      return {
        ...log,
        targetName: log.targetName || targetName || metadata?.requester || null,
        targetEmail: log.targetEmail ?? target?.email ?? null,
        targetRole: log.targetRole ?? target?.role ?? null,
      };
    });

    return NextResponse.json({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertAuthenticated(authContext);
    if (!authContext.verified) {
      throw new ApiError(401, "unauthenticated", "A verified sign-in is required.");
    }
    const payload = passwordChangeSchema.parse(await request.json());

    await writeAuditLog(authContext, {
      action: payload.action,
      entityType: "account",
      entityId: authContext.uid!,
      targetUserId: authContext.uid,
      summary: "Changed account password",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
