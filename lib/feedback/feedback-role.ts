import { normalizeRole, USER_ROLES } from "../auth/roles";

export const FEEDBACK_ROLE_OPTIONS = [
  USER_ROLES.STUDENT,
  USER_ROLES.FACULTY,
] as const;

interface FeedbackRoleFields {
  role?: unknown;
  userRole?: unknown;
}

export function getFeedbackRole(feedback: FeedbackRoleFields) {
  const role = feedback.role ?? feedback.userRole;
  return normalizeRole(typeof role === "string" ? role : null);
}

export function matchesFeedbackRole(
  feedback: FeedbackRoleFields,
  selectedRole: string,
) {
  if (!selectedRole) {
    return true;
  }

  const normalizedSelectedRole = normalizeRole(selectedRole);
  return (
    normalizedSelectedRole !== null &&
    getFeedbackRole(feedback) === normalizedSelectedRole
  );
}
