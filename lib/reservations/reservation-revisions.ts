import type { FirestoreTimestampLike } from "../types/firestore-types";
import {
  getCurrentApprovalStep,
  type ReservationApprovalStep,
} from "./reservation-approval";

export const RESERVATION_REVISION_STATUSES = [
  "requested",
  "accepted",
  "cancelled",
] as const;

export type ReservationRevisionStatus =
  (typeof RESERVATION_REVISION_STATUSES)[number];

export const RESERVATION_REVISION_SCOPES = ["single", "series"] as const;

export type ReservationRevisionScope =
  (typeof RESERVATION_REVISION_SCOPES)[number];

export interface ReservationRevisionMarker {
  activeRevisionId?: string;
  activeRevisionStatus?: "requested";
  revisionScope?: ReservationRevisionScope;
}

export interface ReservationRevisionRecord {
  revisionId: string;
  reservationId: string;
  recurringGroupId?: string;
  scope: ReservationRevisionScope;
  status: ReservationRevisionStatus;
  requestedByUid: string;
  requestedByEmail: string;
  requestedAt: FirestoreTimestampLike;
  originalRoomId: string;
  originalRoomName: string;
  originalBuildingId: string;
  originalBuildingName: string;
  proposedRoomId: string;
  proposedRoomName: string;
  proposedBuildingId: string;
  proposedBuildingName: string;
  respondedByUid?: string;
  respondedAt?: FirestoreTimestampLike;
  baseReservationUpdatedAt?: FirestoreTimestampLike;
}

export interface RevisionReservationState extends ReservationRevisionMarker {
  id: string;
  status: string;
  recurringGroupId?: string;
  approvalFlow?: ReservationApprovalStep[];
  currentStep?: number;
}

export function getReservationRevisionScope(
  reservation: Pick<RevisionReservationState, "recurringGroupId" | "revisionScope">
): ReservationRevisionScope {
  if (
    reservation.revisionScope === "single" ||
    reservation.revisionScope === "series"
  ) {
    return reservation.revisionScope;
  }

  return reservation.recurringGroupId ? "series" : "single";
}

export function hasActiveReservationRevision(
  reservation: Pick<ReservationRevisionMarker, "activeRevisionId" | "activeRevisionStatus">
) {
  return (
    typeof reservation.activeRevisionId === "string" &&
    reservation.activeRevisionId.trim().length > 0 &&
    reservation.activeRevisionStatus === "requested"
  );
}

export function isCurrentRequestedRevision(
  reservation: Pick<ReservationRevisionMarker, "activeRevisionId" | "activeRevisionStatus">,
  revision: Pick<ReservationRevisionRecord, "reservationId" | "revisionId" | "status">,
  reservationId: string,
  revisionId: string
) {
  return (
    revision.reservationId === reservationId &&
    revision.revisionId === revisionId &&
    revision.status === "requested" &&
    hasActiveReservationRevision(reservation) &&
    reservation.activeRevisionId === revisionId
  );
}

export function getRevisionRequestStateError(
  reservation: RevisionReservationState
) {
  if (reservation.status !== "pending") {
    return "Only pending reservations can request a revision.";
  }

  const hasRevisionId =
    typeof reservation.activeRevisionId === "string" &&
    reservation.activeRevisionId.trim().length > 0;

  if (hasRevisionId || reservation.activeRevisionStatus === "requested") {
    return "This reservation already has an active revision request.";
  }

  const currentApprovalStep = getCurrentApprovalStep(
    reservation.approvalFlow,
    reservation.currentStep
  );

  if (currentApprovalStep?.role !== "building_admin") {
    return "A revision can only be requested while Building Admin approval is pending.";
  }

  return null;
}
