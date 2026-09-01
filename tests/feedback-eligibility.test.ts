import { describe, expect, it } from "vitest";

import { USER_ROLES } from "../lib/auth/roles";
import { assertFeedbackSubmissionEligibility } from "../lib/server/feedback-eligibility";
import { ApiError } from "../lib/server/api-error";
import { summarizeFeedbackAnalytics } from "../lib/feedback/feedback-analytics";

const feedbackInput = {
  roomId: "room-1",
  roomName: "Room 101",
  buildingId: "building-1",
  buildingName: "Main Building",
  reservationId: "reservation-1",
  userId: "user-1",
  userName: "Alex User",
  message: "The room was ready.",
  rating: 5,
  categoryRatings: {
    cleanliness: 5,
    comfort: 5,
    air_conditioning: 5,
    equipment_projector: 5,
    internet_connectivity: 5,
  },
};

const completedReservation = {
  userId: "user-1",
  status: "completed",
  roomId: "room-1",
  roomName: "Room 101",
  buildingId: "building-1",
  buildingName: "Main Building",
};

function expectRejected(
  role: string | null,
  reservation: typeof completedReservation | null = completedReservation,
  duplicateExists = false,
) {
  try {
    assertFeedbackSubmissionEligibility(
      feedbackInput,
      role,
      reservation,
      duplicateExists,
    );
    throw new Error("Expected feedback submission to be rejected.");
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }

    return error;
  }
}

describe("feedback submission eligibility", () => {
  it.each([USER_ROLES.STUDENT, USER_ROLES.FACULTY])(
    "%s with a completed owned reservation is allowed",
    (role) => {
      expect(() =>
        assertFeedbackSubmissionEligibility(
          feedbackInput,
          role,
          completedReservation,
          false,
        )
      ).not.toThrow();
    },
  );

  it.each(["pending", "approved", "rejected", "cancelled"])(
    "%s reservations are rejected",
    (status) => {
      expect(expectRejected(USER_ROLES.FACULTY, {
        ...completedReservation,
        status,
      })).toMatchObject({ code: "reservation_not_completed", status: 400 });
    },
  );

  it("rejects another user's reservation", () => {
    expect(expectRejected(USER_ROLES.FACULTY, {
      ...completedReservation,
      userId: "another-user",
    })).toMatchObject({ code: "reservation_not_owned", status: 403 });
  });

  it("rejects room and building mismatches", () => {
    expect(expectRejected(USER_ROLES.FACULTY, {
      ...completedReservation,
      roomId: "room-2",
    })).toMatchObject({ code: "reservation_mismatch", status: 400 });

    expect(expectRejected(USER_ROLES.FACULTY, {
      ...completedReservation,
      buildingName: "Other Building",
    })).toMatchObject({ code: "reservation_mismatch", status: 400 });
  });

  it("rejects duplicate feedback for a reservation", () => {
    expect(expectRejected(USER_ROLES.FACULTY, completedReservation, true)).toMatchObject({
      code: "duplicate_feedback",
      status: 409,
    });
  });

  it("keeps Utility Staff ineligible", () => {
    expect(expectRejected(USER_ROLES.UTILITY)).toMatchObject({
      code: "feedback_not_allowed",
      status: 403,
    });
  });

  it("includes Faculty feedback in the existing analytics", () => {
    const metrics = summarizeFeedbackAnalytics([
      {
        ...feedbackInput,
        id: "feedback-1",
        role: USER_ROLES.FACULTY,
        overallRating: feedbackInput.rating,
        compoundScore: 0.8,
        detectedAspects: {},
      },
    ]);

    expect(metrics.totalReviews).toBe(1);
    expect(metrics.averageRating).toBe(5);
    expect(metrics.positiveCount).toBe(1);
  });
});
