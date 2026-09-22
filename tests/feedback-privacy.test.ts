import { describe, expect, it } from "vitest";

import { feedbackCreateSchema } from "../lib/server/schemas";
import {
  getFeedbackDisplayName,
  getFeedbackReviewerGroupId,
  shouldShowFeedbackSubmitterName,
} from "../lib/feedback/feedback-privacy";

const validFeedback = {
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

describe("feedback privacy", () => {
  it("defaults new feedback to anonymous", () => {
    expect(feedbackCreateSchema.parse(validFeedback).showSubmitterName).toBe(false);
    expect(shouldShowFeedbackSubmitterName(undefined)).toBe(false);
  });

  it("only displays a name after explicit opt-in", () => {
    expect(getFeedbackDisplayName({ id: "feedback-1", userId: "user-1", userName: "Alex User" })).toBe("Anonymous");
    expect(getFeedbackDisplayName({ id: "feedback-2", showSubmitterName: true, userId: "user-1", userName: "Alex User" })).toBe("Alex User");
  });

  it("does not group anonymous feedback by a stable reviewer identifier", () => {
    expect(getFeedbackReviewerGroupId({ id: "feedback-1", userId: "user-1", userName: "Alex User" })).toBe("feedback-1");
    expect(getFeedbackReviewerGroupId({ id: "feedback-2", userId: "user-1", userName: "Alex User" })).toBe("feedback-2");
    expect(getFeedbackReviewerGroupId({ id: "feedback-3", showSubmitterName: true, userId: "user-1", userName: "Alex User" })).toBe("user-1");
  });
});
