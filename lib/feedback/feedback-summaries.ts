import {
  summarizeFeedbackAnalytics,
  type FeedbackAnalyticsRecord,
} from "./feedback-analytics";
import {
  summarizeFeedbackSentiment,
  type FeedbackSentimentFields,
} from "./feedback-sentiment";

export interface RoomFeedbackSummary {
  roomId: string;
  reviewCount: number;
  averageRating: number | null;
  averageVaderScore: number | null;
  positiveRate: number;
  negativeRate: number;
  topPositiveAspects: string[];
  topNegativeAspects: string[];
}

export type RoomFeedbackSummaryInput = FeedbackAnalyticsRecord & FeedbackSentimentFields;

export function buildRoomFeedbackSummary(
  roomId: string,
  feedbackItems: RoomFeedbackSummaryInput[],
): RoomFeedbackSummary {
  const analytics = summarizeFeedbackAnalytics(feedbackItems);
  const sentiment = summarizeFeedbackSentiment(feedbackItems);

  return {
    roomId,
    reviewCount: analytics.totalReviews,
    averageRating: analytics.averageRating,
    averageVaderScore: analytics.averageCompound,
    positiveRate: analytics.positiveRate,
    negativeRate: analytics.negativeRate,
    topPositiveAspects: sentiment.mostPraisedAspects
      .slice(0, 3)
      .map((aspect) => aspect.label),
    topNegativeAspects: sentiment.mostMentionedIssues
      .slice(0, 3)
      .map((aspect) => aspect.label),
  };
}

export function buildRoomFeedbackSummaries(
  roomIds: readonly string[],
  feedbackItems: RoomFeedbackSummaryInput[],
): RoomFeedbackSummary[] {
  const uniqueRoomIds = [...new Set(roomIds.map((roomId) => roomId.trim()).filter(Boolean))];

  return uniqueRoomIds.map((roomId) =>
    buildRoomFeedbackSummary(
      roomId,
      feedbackItems.filter((feedback) => feedback.roomId === roomId),
    ),
  );
}
