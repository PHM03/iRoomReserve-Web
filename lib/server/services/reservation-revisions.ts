import "server-only";

import { randomUUID } from "node:crypto";

import {
  db,
  deleteField,
  serverTimestamp,
} from "@/lib/firebase/firebase-admin";
import { USER_ROLES } from "@/lib/auth/roles";
import {
  getCurrentApprovalStep,
  isCurrentApproverEmail,
} from "@/lib/reservations/reservation-approval";
import {
  getBuildingAdminApprovalStepIndex,
  getReservationRevisionNotificationId,
  getReservationRevisionScope,
  getRevisionRequestStateError,
  isCurrentRequestedRevision,
  type ReservationRevisionRecord,
  type ReservationRevisionScope,
  type RevisionReservationState,
} from "@/lib/reservations/reservation-revisions";
import type { FirestoreTimestampLike } from "@/lib/types/firestore-types";
import { ApiError } from "@/lib/server/api-error";
import type { RequestAuthContext } from "@/lib/server/request-auth";
import {
  assertCanManageBuilding,
  assertRole,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import {
  assertReservationDatesAvailable,
  type ReservationAvailabilityInput,
} from "@/lib/server/services/reservations";
import { normalizeRoomStatus } from "@/lib/rooms/roomStatus";
import { getResponsibleBuildingAdminIds } from "@/lib/server/services/building-managers";
import { createNotificationAfterMutation } from "@/lib/server/services/push-notifications";

export interface CreateReservationRevisionInput {
  requestedByUid: string;
  requestedByEmail: string;
  proposedRoomId: string;
  proposedRoomName: string;
  proposedBuildingId: string;
  proposedBuildingName: string;
  expectedUpdatedAtMs?: number;
  relatedReservationIds?: string[];
}

export interface RequestReservationRevisionResult {
  reservationId: string;
  revisionId: string;
  requesterUid: string;
  originalRoomId: string;
  originalRoomName: string;
  proposedRoomId: string;
  proposedRoomName: string;
  proposedBuildingId: string;
  recurringGroupId?: string;
}

export interface ReservationRevisionResponseResult {
  reservationId: string;
  revisionId: string;
  proposedRoomId: string;
  recurringGroupId?: string;
}

interface ReservationRevisionReservation extends RevisionReservationState {
  userId: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  userName: string;
  date: string;
  startTime: string;
  endTime: string;
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

function getTimestampMillis(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { toMillis?: () => number; seconds?: number };
  if (typeof candidate.toMillis === "function") {
    return candidate.toMillis();
  }

  return typeof candidate.seconds === "number"
    ? candidate.seconds * 1000
    : null;
}

function assertExpectedReservationVersion(
  reservation: ReservationRevisionReservation,
  expectedUpdatedAtMs?: number
) {
  if (expectedUpdatedAtMs === undefined) {
    return;
  }

  const actualUpdatedAtMs = getTimestampMillis(reservation.updatedAt);
  if (actualUpdatedAtMs === null || actualUpdatedAtMs !== expectedUpdatedAtMs) {
    throw new ApiError(
      409,
      "stale_reservation",
      "This reservation changed while the revision form was open. Refresh and try again."
    );
  }
}

/**
 * Creates the revision record and active markers after the request service
 * has validated authorization and replacement-room availability.
 */
export async function createReservationRevisionRecord(
  reservationId: string,
  input: CreateReservationRevisionInput
) {
  const revisionId = generateReservationRevisionId();
  const revisionRef = getReservationRevisionRef(reservationId, revisionId);
  const reservationIds = Array.from(
    new Set([reservationId, ...(input.relatedReservationIds ?? [])])
  );

  await db.runTransaction(async (transaction) => {
    const reservationSnapshots = [];
    for (const relatedReservationId of reservationIds) {
      reservationSnapshots.push(
        await transaction.get(db.collection("reservations").doc(relatedReservationId))
      );
    }
    const reservationSnapshot = reservationSnapshots[0];

    if (!reservationSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRevisionReservation;
    assertExpectedReservationVersion(
      reservation,
      input.expectedUpdatedAtMs
    );
    const stateError = getRevisionRequestStateError(reservation);

    if (stateError) {
      throw new ApiError(409, "revision_not_allowed", stateError);
    }

    for (const relatedSnapshot of reservationSnapshots) {
      if (!relatedSnapshot.exists) {
        throw new ApiError(409, "stale_reservation", "A recurring reservation occurrence no longer exists.");
      }

      const relatedReservation = {
        id: relatedSnapshot.id,
        ...relatedSnapshot.data(),
      } as ReservationRevisionReservation;
      const relatedStateError = getRevisionRequestStateError(relatedReservation);
      if (relatedStateError) {
        throw new ApiError(409, "revision_not_allowed", relatedStateError);
      }
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
    reservationIds.forEach((relatedReservationId) => {
      transaction.update(db.collection("reservations").doc(relatedReservationId), {
        ...getActiveRevisionMetadata(revisionId, scope),
        updatedAt: serverTimestamp(),
      });
    });
  });

  return revisionId;
}

async function getPendingRevisionOccurrences(
  reservation: ReservationRevisionReservation
) {
  if (!reservation.recurringGroupId) {
    return [reservation];
  }

  const snapshot = await db
    .collection("reservations")
    .where("recurringGroupId", "==", reservation.recurringGroupId)
    .get();
  const occurrences = snapshot.docs
    .map(
      (reservationDoc) =>
        ({
          id: reservationDoc.id,
          ...reservationDoc.data(),
        }) as ReservationRevisionReservation
    )
    .filter(
      (occurrence) =>
        occurrence.userId === reservation.userId &&
        occurrence.status === "pending"
    );

  if (occurrences.length === 0) {
    throw new ApiError(
      409,
      "invalid_status",
      "No pending occurrences remain in this recurring reservation."
    );
  }

  return occurrences;
}

async function getProposedRoom(
  proposedRoomId: string,
  originalBuildingId: string,
  transaction?: FirebaseFirestore.Transaction
) {
  const roomRef = db.collection("rooms").doc(proposedRoomId);
  const roomSnapshot = transaction
    ? await transaction.get(roomRef)
    : await roomRef.get();

  if (!roomSnapshot.exists) {
    throw new ApiError(400, "invalid_room", "The proposed room does not exist.");
  }

  const room = roomSnapshot.data() as {
    buildingId?: unknown;
    buildingName?: unknown;
    name?: unknown;
    status?: unknown;
  };
  const buildingId =
    typeof room.buildingId === "string" ? room.buildingId.trim() : "";
  const roomName = typeof room.name === "string" ? room.name.trim() : "";
  const buildingName =
    typeof room.buildingName === "string" ? room.buildingName.trim() : "";

  if (!buildingId || !roomName || !buildingName) {
    throw new ApiError(
      400,
      "invalid_room",
      "The proposed room is missing required room information."
    );
  }

  if (buildingId !== originalBuildingId) {
    throw new ApiError(
      403,
      "invalid_room",
      "The proposed room must belong to the reservation's building."
    );
  }

  if (
    normalizeRoomStatus(typeof room.status === "string" ? room.status : null) ===
    "Unavailable"
  ) {
    throw new ApiError(
      409,
      "room_unavailable",
      "The proposed room is currently unavailable."
    );
  }

  return {
    buildingId,
    buildingName,
    name: roomName,
    ref: roomRef,
  };
}

function getBuildingAdminStepIndex(reservation: ReservationRevisionReservation) {
  const index = getBuildingAdminApprovalStepIndex(reservation.approvalFlow);

  if (index < 0) {
    throw new ApiError(
      409,
      "invalid_approval_flow",
      "This reservation has no Building Admin approval step."
    );
  }

  return index;
}

async function getRequesterRevisionContext(
  reservationId: string,
  authContext: RequestAuthContext,
  expectedRevisionId?: string
) {
  assertVerifiedAuthentication(authContext);

  const reservationSnapshot = await db
    .collection("reservations")
    .doc(reservationId)
    .get();

  if (!reservationSnapshot.exists) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRevisionReservation;

  if (reservation.userId !== authContext.uid) {
    throw new ApiError(403, "forbidden", "You can only respond to your own reservation.");
  }

  if (reservation.status !== "pending") {
    throw new ApiError(409, "revision_not_allowed", "Only pending reservations can respond to a revision.");
  }

  const activeRevisionId = reservation.activeRevisionId?.trim();
  if (!activeRevisionId || reservation.activeRevisionStatus !== "requested") {
    throw new ApiError(409, "revision_not_allowed", "This reservation has no active revision request.");
  }

  if (expectedRevisionId && activeRevisionId !== expectedRevisionId) {
    throw new ApiError(409, "stale_revision", "This revision request is no longer active.");
  }

  const revisionRef = getReservationRevisionRef(reservationId, activeRevisionId);
  const revisionSnapshot = await revisionRef.get();
  if (!revisionSnapshot.exists) {
    throw new ApiError(409, "stale_revision", "This revision request is no longer available.");
  }

  const revision = {
    revisionId: revisionSnapshot.id,
    ...revisionSnapshot.data(),
  } as ReservationRevisionRecord;
  assertCurrentRequestedRevision(
    reservation,
    revision,
    reservationId,
    activeRevisionId
  );

  return { reservation, revision, revisionRef };
}

async function getRequesterRevisionOccurrences(
  reservation: ReservationRevisionReservation,
  revisionId: string
) {
  if (!reservation.recurringGroupId) {
    return [reservation];
  }

  const snapshot = await db
    .collection("reservations")
    .where("recurringGroupId", "==", reservation.recurringGroupId)
    .get();
  const occurrences = snapshot.docs
    .map(
      (reservationDoc) =>
        ({
          id: reservationDoc.id,
          ...reservationDoc.data(),
        }) as ReservationRevisionReservation
    )
    .filter(
      (occurrence) =>
        occurrence.userId === reservation.userId &&
        occurrence.status === "pending"
    );

  if (occurrences.length === 0) {
    throw new ApiError(
      409,
      "revision_not_allowed",
      "No pending occurrences remain in this recurring reservation."
    );
  }

  occurrences.forEach((occurrence) =>
    assertCurrentRequestedRevision(
      occurrence,
      {
        reservationId: reservation.id,
        revisionId,
        status: "requested",
      },
      reservation.id,
      revisionId
    )
  );

  return occurrences;
}

async function validateRevisionRoomAvailability(
  reservation: ReservationRevisionReservation,
  revision: ReservationRevisionRecord,
  occurrences: ReservationRevisionReservation[],
  transaction?: FirebaseFirestore.Transaction
) {
  const proposedRoom = await getProposedRoom(
    revision.proposedRoomId,
    reservation.buildingId,
    transaction
  );

  if (
    proposedRoom.buildingId !== revision.proposedBuildingId ||
    revision.originalBuildingId !== reservation.buildingId
  ) {
    throw new ApiError(
      409,
      "invalid_revision",
      "The revision room no longer matches the reservation building."
    );
  }

  const occurrenceIds = new Set(occurrences.map((occurrence) => occurrence.id));
  await Promise.all(
    occurrences.map((occurrence) => {
      if (occurrence.buildingId !== reservation.buildingId) {
        throw new ApiError(
          409,
          "invalid_revision",
          "Recurring reservation occurrences must remain in the same building."
        );
      }

      const availabilityInput: ReservationAvailabilityInput = {
        buildingId: reservation.buildingId,
        endTime: occurrence.endTime,
        roomId: proposedRoom.ref.id,
        startTime: occurrence.startTime,
        userId: occurrence.userId,
      };

      return assertReservationDatesAvailable(
        availabilityInput,
        [occurrence.date],
        {
          excludeReservationIds: occurrenceIds,
          transaction,
        }
      );
    })
  );

  return proposedRoom;
}

export async function getRequesterReservationRevision(
  reservationId: string,
  authContext: RequestAuthContext
) {
  const { revision } = await getRequesterRevisionContext(
    reservationId,
    authContext
  );
  return revision;
}

export async function acceptReservationRevision(
  reservationId: string,
  authContext: RequestAuthContext,
  revisionId: string
): Promise<ReservationRevisionResponseResult> {
  const context = await getRequesterRevisionContext(
    reservationId,
    authContext,
    revisionId
  );
  const occurrences = await getRequesterRevisionOccurrences(
    context.reservation,
    context.revision.revisionId
  );
  const proposedRoom = await validateRevisionRoomAvailability(
    context.reservation,
    context.revision,
    occurrences
  );

  await db.runTransaction(async (transaction) => {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await transaction.get(reservationRef);
    const revisionSnapshot = await transaction.get(context.revisionRef);
    const occurrenceQuery = context.reservation.recurringGroupId
      ? db
          .collection("reservations")
          .where("recurringGroupId", "==", context.reservation.recurringGroupId)
      : null;
    const occurrenceSnapshot = occurrenceQuery
      ? await transaction.get(occurrenceQuery)
      : null;

    if (!reservationSnapshot.exists || !revisionSnapshot.exists) {
      throw new ApiError(409, "stale_revision", "This revision request is no longer active.");
    }

    const anchor = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRevisionReservation;
    const revision = {
      revisionId: revisionSnapshot.id,
      ...revisionSnapshot.data(),
    } as ReservationRevisionRecord;
    assertCurrentRequestedRevision(
      anchor,
      revision,
      reservationId,
      revisionId
    );
    if (anchor.userId !== authContext.uid || anchor.status !== "pending") {
      throw new ApiError(409, "stale_revision", "This reservation changed before the revision was accepted.");
    }
    if (anchor.roomId !== revision.originalRoomId) {
      throw new ApiError(409, "stale_revision", "The reservation room changed before the revision was accepted.");
    }

    const currentOccurrences = occurrenceSnapshot
      ? occurrenceSnapshot.docs
          .map(
            (occurrenceDoc) =>
              ({
                id: occurrenceDoc.id,
                ...occurrenceDoc.data(),
              }) as ReservationRevisionReservation
          )
          .filter(
            (occurrence) =>
              occurrence.userId === anchor.userId &&
              occurrence.status === "pending"
          )
      : [anchor];

    if (
      currentOccurrences.length !== occurrences.length ||
      currentOccurrences.some(
        (occurrence) =>
          !occurrences.some((expected) => expected.id === occurrence.id)
      )
    ) {
      throw new ApiError(409, "stale_revision", "The recurring reservation changed before the revision was accepted.");
    }

    currentOccurrences.forEach((occurrence) => {
      assertCurrentRequestedRevision(
        occurrence,
        revision,
        reservationId,
        revisionId
      );
      if (occurrence.buildingId !== anchor.buildingId) {
        throw new ApiError(409, "invalid_revision", "The recurring reservation changed buildings.");
      }
      getBuildingAdminStepIndex(occurrence);
    });

    const firstStep = getCurrentApprovalStep(anchor.approvalFlow, anchor.currentStep);
    if (firstStep?.role !== "building_admin") {
      throw new ApiError(409, "stale_revision", "This reservation is no longer waiting for Building Admin review.");
    }

    // Re-read every availability dependency inside the committing transaction.
    // The preflight check above gives fast feedback; this check closes the
    // validate-then-write window for schedules, unavailability, and conflicts.
    const committedProposedRoom = await validateRevisionRoomAvailability(
      anchor,
      revision,
      currentOccurrences,
      transaction
    );

    currentOccurrences.forEach((occurrence) => {
      transaction.update(db.collection("reservations").doc(occurrence.id), {
        roomId: committedProposedRoom.ref.id,
        roomName: committedProposedRoom.name,
        buildingId: committedProposedRoom.buildingId,
        buildingName: committedProposedRoom.buildingName,
        currentStep: getBuildingAdminStepIndex(occurrence),
        ...getResolvedRevisionMetadata(),
        updatedAt: serverTimestamp(),
      });
    });
    transaction.update(context.revisionRef, {
      status: "accepted",
      respondedByUid: authContext.uid,
      respondedAt: serverTimestamp(),
    });
  });

  const responsibleAdminIds = await getResponsibleBuildingAdminIds(
    context.reservation.approvalFlow
  );
  await Promise.all(
    responsibleAdminIds.map((recipientUid) =>
      createNotificationAfterMutation(
        {
          recipientUid,
          type: "reservation_revision_accepted",
          title: "Revision Accepted — Pending Review",
          message: `${context.reservation.userName} accepted the room revision from ${context.revision.originalRoomName} to ${proposedRoom.name}. The reservation remains pending Building Admin review.`,
          buildingId: context.reservation.buildingId,
          reservationId,
          revisionId,
          originalRoomId: context.revision.originalRoomId,
          proposedRoomId: context.revision.proposedRoomId,
          route: "/dashboard/inbox",
        },
        getReservationRevisionNotificationId(
          revisionId,
          "reservation_revision_accepted",
          recipientUid
        )
      )
    )
  );

  return {
    reservationId,
    revisionId,
    proposedRoomId: proposedRoom.ref.id,
    ...(context.reservation.recurringGroupId
      ? { recurringGroupId: context.reservation.recurringGroupId }
      : {}),
  };
}

/**
 * Validates and atomically creates a Building Admin revision request. The
 * revision state is committed before its requester notification is attempted.
 */
export async function requestReservationRevision(
  reservationId: string,
  authContext: RequestAuthContext,
  proposedRoomId: string,
  expectedUpdatedAtMs?: number
): Promise<RequestReservationRevisionResult> {
  assertVerifiedAuthentication(authContext);
  assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

  if (!authContext.email) {
    throw new ApiError(
      400,
      "missing_email",
      "Authenticated administrator email is required."
    );
  }

  const reservationSnapshot = await db
    .collection("reservations")
    .doc(reservationId)
    .get();

  if (!reservationSnapshot.exists) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRevisionReservation;

  assertCanManageBuilding(authContext, reservation.buildingId);

  const stateError = getRevisionRequestStateError(reservation);
  if (stateError) {
    throw new ApiError(409, "revision_not_allowed", stateError);
  }

  const currentApprovalStep = getCurrentApprovalStep(
    reservation.approvalFlow,
    reservation.currentStep
  );
  if (
    currentApprovalStep?.role !== "building_admin" ||
    !isCurrentApproverEmail(currentApprovalStep, authContext.email)
  ) {
    throw new ApiError(
      403,
      "forbidden",
      "You are not the current Building Admin for this reservation."
    );
  }

  const normalizedProposedRoomId = proposedRoomId.trim();
  if (!normalizedProposedRoomId) {
    throw new ApiError(400, "invalid_room", "A replacement room is required.");
  }

  if (normalizedProposedRoomId === reservation.roomId) {
    throw new ApiError(
      400,
      "invalid_room",
      "The proposed room must be different from the current room."
    );
  }

  const occurrences = await getPendingRevisionOccurrences(reservation);
  const occurrenceIds = new Set(occurrences.map((occurrence) => occurrence.id));

  occurrences.forEach((occurrence) => {
    const occurrenceStateError = getRevisionRequestStateError(occurrence);
    if (occurrenceStateError) {
      throw new ApiError(409, "revision_not_allowed", occurrenceStateError);
    }

    if (occurrence.buildingId !== reservation.buildingId) {
      throw new ApiError(
        409,
        "invalid_reservation",
        "Recurring reservation occurrences must remain in the same building."
      );
    }

    if (occurrence.roomId === normalizedProposedRoomId) {
      throw new ApiError(
        400,
        "invalid_room",
        "The proposed room must be different from every current series room."
      );
    }
  });

  const proposedRoom = await getProposedRoom(
    normalizedProposedRoomId,
    reservation.buildingId
  );
  await Promise.all(
    occurrences.map((occurrence) => {
      const availabilityInput: ReservationAvailabilityInput = {
        buildingId: reservation.buildingId,
        endTime: occurrence.endTime,
        roomId: normalizedProposedRoomId,
        startTime: occurrence.startTime,
        userId: occurrence.userId,
      };

      return assertReservationDatesAvailable(
        availabilityInput,
        [occurrence.date],
        { excludeReservationIds: occurrenceIds }
      );
    })
  );

  const revisionId = await createReservationRevisionRecord(reservationId, {
    expectedUpdatedAtMs,
    relatedReservationIds: Array.from(occurrenceIds),
    proposedBuildingId: proposedRoom.buildingId,
    proposedBuildingName: proposedRoom.buildingName,
    proposedRoomId: normalizedProposedRoomId,
    proposedRoomName: proposedRoom.name,
    requestedByEmail: authContext.email,
    requestedByUid: authContext.uid!,
  });

  await createNotificationAfterMutation(
    {
      recipientUid: reservation.userId,
      type: "reservation_revision_requested",
      title: "Reservation Revision Requested",
      message: `A room revision was requested for your reservation from ${reservation.roomName} to ${proposedRoom.name}. Please review the revision.`,
      buildingId: reservation.buildingId,
      reservationId,
      revisionId,
      originalRoomId: reservation.roomId,
      proposedRoomId: normalizedProposedRoomId,
      route: "/dashboard/reservations",
    },
    getReservationRevisionNotificationId(
      revisionId,
      "reservation_revision_requested",
      reservation.userId
    )
  );

  return {
    reservationId,
    revisionId,
    requesterUid: reservation.userId,
    originalRoomId: reservation.roomId,
    originalRoomName: reservation.roomName,
    proposedRoomId: normalizedProposedRoomId,
    proposedRoomName: proposedRoom.name,
    proposedBuildingId: proposedRoom.buildingId,
    ...(reservation.recurringGroupId
      ? { recurringGroupId: reservation.recurringGroupId }
      : {}),
  };
}
