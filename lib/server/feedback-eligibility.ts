import { USER_ROLES, normalizeRole } from "../auth/roles";
import { ApiError } from "./api-error";
import type { FeedbackCreateInput } from "./services/feedback";

export interface FeedbackReservationSnapshot {
  userId?: unknown;
  status?: unknown;
  roomId?: unknown;
  roomName?: unknown;
  buildingId?: unknown;
  buildingName?: unknown;
}

export function assertFeedbackSubmissionEligibility(
  data: FeedbackCreateInput,
  submitterRole: string | null,
  reservation: FeedbackReservationSnapshot | null,
  duplicateExists: boolean,
) {
  const normalizedRole = normalizeRole(submitterRole);

  if (
    normalizedRole !== USER_ROLES.STUDENT &&
    normalizedRole !== USER_ROLES.FACULTY
  ) {
    throw new ApiError(
      403,
      "feedback_not_allowed",
      "Only students and faculty professors can submit feedback.",
    );
  }

  if (!reservation) {
    throw new ApiError(404, "reservation_not_found", "Reservation not found.");
  }

  if (reservation.userId !== data.userId) {
    throw new ApiError(
      403,
      "reservation_not_owned",
      "You can only submit feedback for your own reservation.",
    );
  }

  if (reservation.status !== "completed") {
    throw new ApiError(
      400,
      "reservation_not_completed",
      "Feedback can only be submitted for completed reservations.",
    );
  }

  const reservationMatchesPayload =
    reservation.roomId === data.roomId &&
    reservation.roomName === data.roomName &&
    reservation.buildingId === data.buildingId &&
    reservation.buildingName === data.buildingName;

  if (!reservationMatchesPayload) {
    throw new ApiError(
      400,
      "reservation_mismatch",
      "The feedback room and building do not match the reservation.",
    );
  }

  if (duplicateExists) {
    throw new ApiError(
      409,
      "duplicate_feedback",
      "Feedback has already been submitted for this reservation.",
    );
  }
}
