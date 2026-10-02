import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { handleApiError } from "@/lib/server/api-error";
import { db } from "@/lib/firebase/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertRole, assertVerifiedAuthentication } from "@/lib/server/route-guards";
import { reservationCampusSchema } from "@/lib/server/schemas";
import { writeAuditLog } from "@/lib/server/services/audit-logs";
import {
  approveManagedUserProfile,
  approveUserProfile,
  assignMainCampusDsasDesignation,
  deleteUserProfile,
  disableUserProfile,
  enableUserProfile,
  rejectUserProfile,
  removeMainCampusDsasDesignation,
  updateManagedUserCampus,
} from "@/lib/server/services/admin-users";

interface BuildingAssignment {
  id: string;
  name: string;
  campus: string | null;
  assignedAdminUid: string | null;
}

async function getBuildingAssignments() {
  const snapshot = await db.collection("buildings").get();
  return new Map(snapshot.docs.map((buildingDoc) => {
    const data = buildingDoc.data();
    return [buildingDoc.id, {
      id: buildingDoc.id,
      name: typeof data.name === "string" ? data.name : buildingDoc.id,
      campus: typeof data.campus === "string" ? data.campus : null,
      assignedAdminUid: typeof data.assignedAdminUid === "string" ? data.assignedAdminUid : null,
    } satisfies BuildingAssignment] as const;
  }));
}

async function auditBuildingAssignmentChanges(
  authContext: Awaited<ReturnType<typeof getRequestAuthContext>>,
  before: Map<string, BuildingAssignment>,
  requestedUserId: string,
) {
  const after = await getBuildingAssignments();
  const buildingIds = new Set([...before.keys(), ...after.keys()]);
  await Promise.all([...buildingIds].flatMap((buildingId) => {
    const previous = before.get(buildingId);
    const next = after.get(buildingId);
    const from = previous?.assignedAdminUid ?? null;
    const to = next?.assignedAdminUid ?? null;
    if (from === to || (!previous && !next)) return [];
    const building = next ?? previous!;
    const affectedUserId = to ?? from ?? requestedUserId;
    return [writeAuditLog(authContext, {
      action: "building.updated",
      entityType: "building",
      entityId: buildingId,
      targetUserId: affectedUserId,
      buildingId,
      buildingName: building.name,
      campus: building.campus,
      summary: to
        ? `Assigned a building administrator to ${building.name}.`
        : `Removed the building administrator assignment from ${building.name}.`,
      changes: { assignedAdminUid: { from, to } },
    })];
  }));
}

const managedApprovalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve-user") }),
  z.object({ action: z.literal("assign-dsas") }),
  z.object({ action: z.literal("remove-dsas") }),
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
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);

    const { uid } = await params;
    const payload = managedApprovalSchema.parse(await request.json());
    const targetSnapshot = await db.collection("users").doc(uid).get();
    const target = targetSnapshot.data() as {
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: string;
      status?: string;
      campus?: string;
      designation?: string;
    } | undefined;
    const targetName = [target?.firstName, target?.lastName].filter(Boolean).join(" ");
    const buildingAssignmentsBefore = ["approve-managed", "update-campus", "reject"].includes(payload.action)
      ? await getBuildingAssignments()
      : null;

    switch (payload.action) {
      case "approve-user":
        await approveUserProfile(uid);
        break;
      case "assign-dsas":
        await assignMainCampusDsasDesignation(uid);
        break;
      case "remove-dsas":
        await removeMainCampusDsasDesignation(uid);
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

    const summary = (() => {
      switch (payload.action) {
        case "approve-user": return "Approved user account";
        case "assign-dsas": return "Assigned DSAS designation";
        case "remove-dsas": return "Removed DSAS designation";
        case "approve-managed": return `Approved ${payload.role} account for ${payload.campus} campus`;
        case "reject": return "Rejected user account";
        case "disable": return "Disabled user account";
        case "enable": return "Enabled user account";
        case "update-campus": return `Changed user campus to ${payload.campus}`;
      }
    })();
    const changes: Record<string, { from: string | boolean | null; to: string | boolean | null }> = {};
    const addChange = (field: string, from: string | boolean | null | undefined, to: string | boolean | null) => {
      if (from !== to) changes[field] = { from: from ?? null, to };
    };
    switch (payload.action) {
      case "approve-user":
        addChange("status", target?.status ?? "pending", "approved");
        break;
      case "assign-dsas":
        addChange("designation", target?.designation ?? "None", "DSAS");
        break;
      case "remove-dsas":
        addChange("designation", target?.designation ?? "DSAS", "None");
        break;
      case "approve-managed":
        addChange("role", target?.role, payload.role);
        addChange("campus", target?.campus, payload.campus);
        addChange("status", target?.status ?? "pending", "approved");
        break;
      case "reject":
        addChange("status", target?.status ?? "pending", "rejected");
        break;
      case "disable":
        addChange("status", target?.status ?? "active", "disabled");
        break;
      case "enable":
        addChange("status", target?.status ?? "disabled", "approved");
        break;
      case "update-campus":
        addChange("campus", target?.campus, payload.campus);
        break;
    }
    await writeAuditLog(authContext, {
      action: "account.status_changed",
      entityType: "account",
      entityId: uid,
      targetUserId: uid,
      targetName,
      targetEmail: target?.email,
      targetRole: target?.role,
      summary,
      campus: "campus" in payload ? payload.campus : null,
      changes,
      metadata: { operation: payload.action },
    });
    if (buildingAssignmentsBefore) {
      await auditBuildingAssignmentChanges(authContext, buildingAssignmentsBefore, uid);
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
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.SUPER_ADMIN]);

    const { uid } = await params;
    const targetSnapshot = await db.collection("users").doc(uid).get();
    const target = targetSnapshot.data() as {
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: string;
      status?: string;
    } | undefined;
    const buildingAssignmentsBefore = await getBuildingAssignments();
    await deleteUserProfile(uid);
    await writeAuditLog(authContext, {
      action: "account.status_changed",
      entityType: "account",
      entityId: uid,
      targetUserId: uid,
      targetName: [target?.firstName, target?.lastName].filter(Boolean).join(" "),
      targetEmail: target?.email,
      targetRole: target?.role,
      summary: "Deleted user account",
      changes: { status: { from: target?.status ?? "active", to: "deleted" } },
      metadata: { operation: "delete" },
    });
    await auditBuildingAssignmentChanges(authContext, buildingAssignmentsBefore, uid);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
