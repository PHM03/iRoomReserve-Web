export interface FeedbackPrivacyFields {
  id: string;
  showSubmitterName?: unknown;
  userId?: string;
  userName?: string;
}

export function shouldShowFeedbackSubmitterName(value: unknown) {
  return value === true;
}

export function getFeedbackDisplayName(feedback: FeedbackPrivacyFields) {
  return shouldShowFeedbackSubmitterName(feedback.showSubmitterName)
    ? feedback.userName?.trim() || "Named user"
    : "Anonymous";
}

/** Anonymous entries intentionally use their feedback id only as an internal key. */
export function getFeedbackReviewerGroupId(feedback: FeedbackPrivacyFields) {
  return shouldShowFeedbackSubmitterName(feedback.showSubmitterName)
    ? feedback.userId?.trim() || feedback.id
    : feedback.id;
}
