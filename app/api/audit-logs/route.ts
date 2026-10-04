import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";

import { USER_ROLES } from "@/lib/auth/roles";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated, assertRole } from "@/lib/server/route-guards";
import { db } from "@/lib/firebase/firebase-admin";
import { writeAuditLog, writeSystemAuditLog } from "@/lib/server/services/audit-logs";

export const runtime = "nodejs";

const failedLoginSchema = z.object({
  action: z.literal("account.login_failed"),
  email: z.string().trim().email().max(254),
});

const failedLoginWindows = new Map<string, { count: number; startedAt: number }>();
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGIN_MAX_PER_IP = 10;

const auditEventSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("account.password_changed") }),
  z.object({ action: z.literal("account.login_succeeded") }),
  z.object({ action: z.literal("account.logout") }),
  z.object({
    action: z.literal("audit.exported"),
    filters: z.record(z.string(), z.string()).optional(),
    rowCount: z.number().int().nonnegative().max(300),
  }),
  z.object({
    action: z.literal("security.access_denied"),
    path: z.string().trim().max(200).regex(/^\/(admin|superadmin)(\/[a-z0-9-]+)*$/i),
  }),
]);

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
    const reservationId = searchParams.get("reservationId")?.trim();
    const action = searchParams.get("action")?.trim();
    if (!performedBy && !allUsers && !reservationId) {
      return NextResponse.json({ logs: [] });
    }

    let logsQuery: FirebaseFirestore.Query = db.collection("auditLogs");
    if (campus === "main" || campus === "digi") {
      logsQuery = logsQuery.where("campus", "==", campus);
    }
    if (performedBy) {
      logsQuery = logsQuery.where("actorUid", "==", performedBy);
    }
    const snapshots = reservationId
      ? await Promise.all([
          logsQuery.where("reservationId", "==", reservationId).orderBy("createdAt", "desc").limit(300).get(),
          logsQuery.where("entityId", "==", reservationId).where("entityType", "==", "reservation").orderBy("createdAt", "desc").limit(300).get(),
        ])
      : [await logsQuery.orderBy("createdAt", "desc").limit(300).get()];
    const snapshotDocs = [...new Map(snapshots.flatMap((snapshot) => snapshot.docs).map((doc) => [doc.id, doc])).values()]
      .sort((left, right) => {
        const leftCreatedAt = left.get("createdAt") as { toMillis?: () => number } | null;
        const rightCreatedAt = right.get("createdAt") as { toMillis?: () => number } | null;
        const leftTime = leftCreatedAt?.toMillis?.() ?? 0;
        const rightTime = rightCreatedAt?.toMillis?.() ?? 0;
        return rightTime - leftTime;
      })
      .slice(0, 300);
    const rawLogs = snapshotDocs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown> & {
          campus?: string | null;
          createdAt?: { toDate?: () => Date } | null;
          targetUserId?: string | null;
          targetName?: string | null;
          targetEmail?: string | null;
          targetRole?: string | null;
          action?: string;
          actorUid?: string | null;
          actorName?: string | null;
          actorEmail?: string | null;
          metadata?: Record<string, unknown>;
        };
        const createdAt = data.createdAt?.toDate?.();
        return {
          id: doc.id,
          ...data,
          createdAt: createdAt instanceof Date ? createdAt.toISOString() : null,
        };
      })
      .filter((log) => !action || log.action === action);
    const profileIds = [...new Set(rawLogs.flatMap((log) => [log.actorUid, log.targetUserId])
      .filter((uid): uid is string => typeof uid === "string" && !uid.startsWith("system:")))];
    const profiles = await Promise.all(profileIds.map(async (uid) => {
      const targetSnapshot = await db.collection("users").doc(uid).get();
      const target = targetSnapshot.data() as {
        firstName?: string;
        lastName?: string;
        email?: string;
        role?: string;
      } | undefined;
      return [uid, target] as const;
    }));
    const profilesById = new Map(profiles);
    const logs = rawLogs.map((log) => {
      const actor = log.actorUid ? profilesById.get(String(log.actorUid)) : undefined;
      const target = log.targetUserId ? profilesById.get(String(log.targetUserId)) : undefined;
      const actorName = [actor?.firstName, actor?.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ");
      const targetName = [target?.firstName, target?.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ");
      return {
        ...log,
        actorName: log.actorName || actorName || (String(log.actorUid ?? "").startsWith("system:") ? log.actorUid : `User ${String(log.actorUid ?? "").slice(0, 8)}`),
        actorEmail: log.actorEmail ?? actor?.email ?? null,
        targetName: log.targetName || targetName || null,
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
    const body: unknown = await request.json();
    const failedLogin = failedLoginSchema.safeParse(body);
    if (failedLogin.success) {
      const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const source = forwardedFor || request.headers.get("x-real-ip") || "unknown";
      const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 20);
      const now = Date.now();
      for (const [key, value] of failedLoginWindows) {
        if (now - value.startedAt >= FAILED_LOGIN_WINDOW_MS) failedLoginWindows.delete(key);
      }
      const window = failedLoginWindows.get(sourceHash);
      if (window && now - window.startedAt < FAILED_LOGIN_WINDOW_MS && window.count >= FAILED_LOGIN_MAX_PER_IP) {
        throw new ApiError(429, "rate_limited", "Too many sign-in attempts. Try again later.");
      }
      if (window && now - window.startedAt < FAILED_LOGIN_WINDOW_MS) window.count += 1;
      else failedLoginWindows.set(sourceHash, { count: 1, startedAt: now });

      const emailHash = createHash("sha256").update(failedLogin.data.email.toLowerCase()).digest("hex");
      await writeSystemAuditLog({
        action: "account.login_failed",
        entityType: "account",
        entityId: `failed-login:${emailHash.slice(0, 20)}:${now}`,
        outcome: "failure",
        summary: "Failed sign-in attempt",
        metadata: { emailHash, sourceHash },
      }, "Authentication service");
      return NextResponse.json({ ok: true });
    }

    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertAuthenticated(authContext);
    if (!authContext.verified) {
      throw new ApiError(401, "unauthenticated", "A verified sign-in is required.");
    }
    const payload = auditEventSchema.parse(body);

    if (payload.action === "audit.exported") {
      assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);
    }

    await writeAuditLog(authContext, {
      action: payload.action,
      entityType: payload.action === "audit.exported" ? "audit_export" : "account",
      entityId: payload.action === "audit.exported" ? `export:${authContext.uid}:${Date.now()}` : authContext.uid!,
      targetUserId: payload.action === "audit.exported" ? null : authContext.uid,
      outcome: payload.action === "security.access_denied" ? "failure" : "success",
      summary: payload.action === "audit.exported"
        ? "Exported audit logs to CSV"
        : payload.action === "security.access_denied"
          ? `Denied access to ${payload.path}`
          : payload.action === "account.login_succeeded"
            ? "Signed in successfully"
            : payload.action === "account.logout"
              ? "Signed out"
              : "Changed account password",
      metadata: payload.action === "audit.exported"
        ? { rowCount: payload.rowCount, filters: JSON.stringify(payload.filters ?? {}) }
        : payload.action === "security.access_denied"
          ? { attemptedPath: payload.path }
          : {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
