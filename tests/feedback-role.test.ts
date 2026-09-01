import { describe, expect, it } from "vitest";

import { USER_ROLES } from "../lib/auth/roles";
import {
  FEEDBACK_ROLE_OPTIONS,
  getFeedbackRole,
  matchesFeedbackRole,
} from "../lib/feedback/feedback-role";
import { summarizeFeedbackAnalytics } from "../lib/feedback/feedback-analytics";

const studentFeedback = { role: "Student", rating: 4 };
const facultyFeedback = { role: "Faculty Professor", rating: 5 };
const legacyFacultyFeedback = { userRole: "Faculty" };
const utilityFeedback = { role: "Utility Staff", rating: 3 };

describe("feedback role filtering", () => {
  it("offers only All, Student, and Faculty Professor roles", () => {
    expect(FEEDBACK_ROLE_OPTIONS).toEqual([
      USER_ROLES.STUDENT,
      USER_ROLES.FACULTY,
    ]);
    expect(FEEDBACK_ROLE_OPTIONS).not.toContain(USER_ROLES.UTILITY);
  });

  it("matches Student feedback through the existing role normalization", () => {
    expect(getFeedbackRole(studentFeedback)).toBe(USER_ROLES.STUDENT);
    expect(matchesFeedbackRole(studentFeedback, USER_ROLES.STUDENT)).toBe(true);
    expect(matchesFeedbackRole(studentFeedback, USER_ROLES.FACULTY)).toBe(false);
  });

  it("matches Faculty Professor feedback and legacy Faculty aliases", () => {
    expect(getFeedbackRole(facultyFeedback)).toBe(USER_ROLES.FACULTY);
    expect(getFeedbackRole(legacyFacultyFeedback)).toBe(USER_ROLES.FACULTY);
    expect(matchesFeedbackRole(facultyFeedback, USER_ROLES.FACULTY)).toBe(true);
    expect(matchesFeedbackRole(facultyFeedback, USER_ROLES.STUDENT)).toBe(false);
  });

  it("keeps All inclusive and Utility Staff unavailable", () => {
    expect(
      [studentFeedback, facultyFeedback].filter((item) =>
        matchesFeedbackRole(item, "")
      )
    ).toEqual([studentFeedback, facultyFeedback]);
    expect(matchesFeedbackRole(utilityFeedback, "")).toBe(true);
    expect(matchesFeedbackRole(utilityFeedback, USER_ROLES.STUDENT)).toBe(false);
    expect(matchesFeedbackRole(utilityFeedback, USER_ROLES.FACULTY)).toBe(false);
  });

  it("passes the correctly filtered dataset into existing analytics", () => {
    const feedback = [studentFeedback, facultyFeedback];
    const filteredForFaculty = feedback.filter((item) =>
      matchesFeedbackRole(item, USER_ROLES.FACULTY)
    );

    expect(filteredForFaculty).toEqual([facultyFeedback]);
    expect(
      summarizeFeedbackAnalytics(filteredForFaculty).totalReviews
    ).toBe(1);
  });
});
