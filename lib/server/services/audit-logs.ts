import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import type { RequestAuthContext } from "@/lib/server/request-auth";
import { db } from "@/lib/firebase/firebase-admin";
import { normalizeRole } from "@/lib/auth/roles";

export type AuditLogAction =
  | "reservation.created"
  | "reservation.approved"
  | "reservation.rejected"
  | "reservation.cancelled"
  | "reservation.checked_in"
  | "reservation.completed"
  | "reservation.completion_confirmed"
  | "reservation.deleted"
  | "reservation.revision_requested"
  | "reservation.revision_accepted"
  | "reservation.revision_cancelled"
  | "reservation.expired"
  | "reservation.expiration_message_sent"
  | "reservation.document_uploaded"
  | "reservation.document_removed"
  | "reservation.occupancy_monitor_started"
  | "reservation.occupancy_monitor_stopped"
  | "reservation.beacon_disconnected"
  | "room.created"
  | "room.updated"
  | "room.deleted"
  | "room.status_changed"
  | "room.unavailability_added"
  | "room.unavailability_removed"
  | "schedule.created"
  | "schedule.updated"
  | "schedule.deleted"
  | "schedule.cleared"
  | "feedback.submitted"
  | "feedback.responded"
  | "admin_request.responded"
  | "building.floor_created"
  | "building.floor_updated"
  | "building.floor_deleted"
  | "building.created"
  | "building.updated"
  | "account.status_changed"
  | "account.password_changed"
  | "account.profile_updated";

export type AuditLogCategory =
  | "Authentication"
  | "Reservation"
  | "User Management"
  | "Room Management"
  | "Building Management"
  | "Schedule Management"
  | "Feedback"
  | "Room Status"
  | "BLE / Occupancy"
  | "System Configuration";

export type AuditChangeValue = string | number | boolean | null;

export interface AuditLogInput {
  action: AuditLogAction;
  entityType: "reservation" | "room" | "account" | "schedule" | "feedback" | "admin_request" | "building";
  entityId: string;
  summary: string;
  campus?: string | null;
  buildingId?: string | null;
  buildingName?: string | null;
  targetUserId?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
  targetRole?: string | null;
  category?: AuditLogCategory;
  changes?: Record<string, { from: AuditChangeValue; to: AuditChangeValue }>;
  metadata?: Record<string, string | number | boolean | null>;
}

export function buildAuditChanges(
  before: Record<string, AuditChangeValue | undefined>,
  after: Record<string, AuditChangeValue | undefined>,
) {
  const changes: Record<string, { from: AuditChangeValue; to: AuditChangeValue }> = {};
  for (const [field, nextValue] of Object.entries(after)) {
    if (nextValue === undefined) continue;
    const previousValue = before[field] ?? null;
    if (previousValue !== nextValue) {
      changes[field] = { from: previousValue, to: nextValue };
    }
  }
  return changes;
}

function getAuditCategory(input: AuditLogInput): AuditLogCategory {
  if (input.category) return input.category;
  if (input.action.startsWith("reservation.")) return "Reservation";
  if (input.action.startsWith("room.unavailability") || input.action === "room.status_changed") return "Room Status";
  if (input.action.startsWith("room.")) return "Room Management";
  if (input.action.startsWith("schedule.")) return "Schedule Management";
  if (input.action.startsWith("feedback.")) return "Feedback";
  if (input.action.startsWith("admin_request.")) return "User Management";
  if (input.action.startsWith("building.")) return "Building Management";
  if (input.action === "account.password_changed") return "Authentication";
  if (input.action.startsWith("account.")) return "User Management";
  return "System Configuration";
}

export async function writeAuditLog(
  actor: RequestAuthContext,
  input: AuditLogInput,
) {
  if (!actor.uid || !actor.verified) {
    throw new Error("Audit events require a verified authenticated actor.");
  }

  await persistAuditLog(input, {
    uid: actor.uid,
    email: actor.email,
    role: actor.role,
    campus: actor.campus,
  });
}

interface AuditActorDetails {
  uid: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  campus?: string | null;
}

export async function writeSystemAuditLog(
  input: AuditLogInput,
  systemName = "Reservation Automation",
) {
  await persistAuditLog(input, {
    uid: "system:reservation-automation",
    name: systemName,
    email: null,
    role: "System",
    campus: input.campus ?? null,
  });
}

async function persistAuditLog(input: AuditLogInput, actor: AuditActorDetails) {
  const isSystemActor = actor.uid.startsWith("system:");

  const [profileSnapshot, targetSnapshot] = await Promise.all([
    isSystemActor ? Promise.resolve(null) : db.collection("users").doc(actor.uid).get(),
    input.targetUserId && input.targetUserId !== actor.uid
      ? db.collection("users").doc(input.targetUserId).get()
      : Promise.resolve(null),
  ]);
  const profile = profileSnapshot?.data() as
    | { firstName?: string; lastName?: string; role?: string }
    | undefined;
  const targetProfile = targetSnapshot?.data() as
    | { firstName?: string; lastName?: string; email?: string; role?: string }
    | undefined;
  const actorName = actor.name || [profile?.firstName, profile?.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
  const targetName = [targetProfile?.firstName, targetProfile?.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");

  await db.collection("auditLogs").add({
    ...input,
    category: getAuditCategory(input),
    targetType: input.entityType,
    targetId: input.entityId,
    description: input.summary,
    changes: input.changes ?? {},
    result: "success",
    campus: input.campus ?? actor.campus ?? null,
    buildingId: input.buildingId ?? null,
    buildingName: input.buildingName ?? null,
    targetUserId: input.targetUserId ?? null,
    targetName: input.targetName ?? (input.targetUserId === actor.uid
      ? actorName || actor.email || null
      : targetName || null),
    targetEmail: input.targetEmail ?? (input.targetUserId === actor.uid
      ? actor.email
      : targetProfile?.email ?? null),
    targetRole: normalizeRole(
      input.targetRole ?? (input.targetUserId === actor.uid ? profile?.role : targetProfile?.role),
    ),
    metadata: input.metadata ?? {},
    actorUid: actor.uid,
    actorName: actorName || actor.email || "Unknown user",
    actorEmail: actor.email,
    actorRole: normalizeRole(profile?.role ?? actor.role) ?? actor.role ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
