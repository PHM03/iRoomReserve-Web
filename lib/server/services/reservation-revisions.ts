import "server-only";

import { randomUUID } from "node:crypto";

import {
  db,
  deleteField,
  serverTimestamp,
} from "@/lib/firebase/firebase-admin";
import {
  getReservationRevisionScope,
  getRevisionRequestStateError,
  isCurrentRequestedRevision,
  type ReservationRevisionRecord,
  type ReservationRevisionScope,
  type RevisionReservationState,
} from "@/lib/reservations/reservation-revisions";
import type { FirestoreTimestampLike } from "@/lib/types/firestore-types";
import { ApiError } from "@/lib/server/api-error";

export interface CreateReservationRevisionInput {
  requestedByUid: string;
  requestedByEmail: string;
  proposedRoomId: string;
  proposedRoomName: string;
  proposedBuildingId: string;
  proposedBuildingName: string;
}

interface ReservationRevisionReservation extends RevisionReservationState {
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  updatedAt?: FirestoreTimestampLike;
}

export const RESERVATION_REVISIONS_COLLECTION = "revisions";

export function generateReservationRevisionId() {
  return randomUUID();
}

export function getReservationRevisionCollectionRef(reservationId: string) {
  return db
    .collection("reservations")
    .doc(reservationId)
    .collection(RESERVATION_REVISIONS_COLLECTION);
}

export function getReservationRevisionRef(
  reservationId: string,
  revisionId: string
) {
  return getReservationRevisionCollectionRef(reservationId).doc(revisionId);
}

export function getActiveRevisionMetadata(
  revisionId: string,
  scope: ReservationRevisionScope
) {
  return {
    activeRevisionId: revisionId,
    activeRevisionStatus: "requested" as const,
    revisionScope: scope,
  };
}

export function getResolvedRevisionMetadata() {
  return {
    activeRevisionId: deleteField(),
    activeRevisionStatus: deleteField(),
    revisionScope: deleteField(),
  };
}

export function assertCurrentRequestedRevision(
  reservation: Pick<
    ReservationRevisionReservation,
    "activeRevisionId" | "activeRevisionStatus"
  >,
  revision: Pick<ReservationRevisionRecord, "reservationId" | "revisionId" | "status">,
  reservationId: string,
  revisionId: string
) {
  if (!isCurrentRequestedRevision(reservation, revision, reservationId, revisionId)) {
    throw new ApiError(
      409,
      "stale_revision",
      "This revision request is no longer active."
    );
  }
}

/**
 * Creates only the revision data and active marker. Authorization and
 * replacement-room validation remain the responsibility of the calling
 * service in the later Request Revision phase.
 */
export async function createReservationRevisionRecord(
  reservationId: string,
  input: CreateReservationRevisionInput
) {
  const revisionId = generateReservationRevisionId();
  const reservationRef = db.collection("reservations").doc(reservationId);
  const revisionRef = getReservationRevisionRef(reservationId, revisionId);

  await db.runTransaction(async (transaction) => {
    const reservationSnapshot = await transaction.get(reservationRef);

    if (!reservationSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRevisionReservation;
    const stateError = getRevisionRequestStateError(reservation);

    if (stateError) {
      throw new ApiError(409, "revision_not_allowed", stateError);
    }

    const scope = getReservationRevisionScope(reservation);
    const revisionRecord = {
      revisionId,
      reservationId,
      ...(reservation.recurringGroupId
        ? { recurringGroupId: reservation.recurringGroupId }
        : {}),
      scope,
      status: "requested" as const,
      requestedByUid: input.requestedByUid,
      requestedByEmail: input.requestedByEmail,
      requestedAt: serverTimestamp(),
      originalRoomId: reservation.roomId,
      originalRoomName: reservation.roomName,
      originalBuildingId: reservation.buildingId,
      originalBuildingName: reservation.buildingName,
      proposedRoomId: input.proposedRoomId,
      proposedRoomName: input.proposedRoomName,
      proposedBuildingId: input.proposedBuildingId,
      proposedBuildingName: input.proposedBuildingName,
      ...(reservation.updatedAt
        ? { baseReservationUpdatedAt: reservation.updatedAt }
        : {}),
    };

    transaction.create(revisionRef, revisionRecord);
    transaction.update(reservationRef, {
      ...getActiveRevisionMetadata(revisionId, scope),
      updatedAt: serverTimestamp(),
    });
  });

  return revisionId;
}
