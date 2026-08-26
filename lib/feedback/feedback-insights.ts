import type { Feedback } from './feedback';
import { summarizeFeedbackSentiment, summarizeFeedbackSentimentByRoom } from './feedback-sentiment';

/** A 0.10 VADER change is large enough to describe as a meaningful trend. */
export const SENTIMENT_INSIGHT_THRESHOLD = 0.1;

/** Two scored reviews is the minimum evidence used for room comparisons. */
export const MINIMUM_ROOM_INSIGHT_SAMPLES = 2;

export type SentimentInsightDirection = 'improving' | 'declining' | 'stable' | 'not_enough_data';

export interface RoomInsight {
  roomId: string;
  roomName: string;
  averageCompoundScore: number;
  feedbackCount: number;
}

export interface FeedbackInsights {
  sentimentDirection: SentimentInsightDirection;
  currentAverageCompoundScore: number | null;
  previousAverageCompoundScore: number | null;
  bestRoom: RoomInsight | null;
  roomNeedingAttention: RoomInsight | null;
  topConcern: { label: string; count: number } | null;
  mostPraised: { label: string; count: number } | null;
}

function getScoredFeedback(feedbackItems: Feedback[]) {
  return feedbackItems.filter((feedback) => {
    const score = feedback.vaderCompoundScore ?? feedback.compoundScore;
    return typeof score === 'number' && Number.isFinite(score);
  });
}

function getAverageCompoundScore(feedbackItems: Feedback[]) {
  const scoredFeedback = getScoredFeedback(feedbackItems);
  if (scoredFeedback.length === 0) {
    return null;
  }

  return summarizeFeedbackSentiment(scoredFeedback).averageCompoundScore;
}

function getSentimentDirection(
  currentFeedback: Feedback[],
  previousFeedback: Feedback[],
  comparable: boolean,
) {
  const currentScored = getScoredFeedback(currentFeedback);
  const previousScored = getScoredFeedback(previousFeedback);
  if (!comparable || currentScored.length < 2 || previousScored.length < 2) {
    return {
      direction: 'not_enough_data' as const,
      currentAverage: getAverageCompoundScore(currentFeedback),
      previousAverage: getAverageCompoundScore(previousFeedback),
    };
  }

  const currentAverage = getAverageCompoundScore(currentFeedback) ?? 0;
  const previousAverage = getAverageCompoundScore(previousFeedback) ?? 0;
  const difference = currentAverage - previousAverage;

  return {
    direction: difference >= SENTIMENT_INSIGHT_THRESHOLD
      ? 'improving' as const
      : difference <= -SENTIMENT_INSIGHT_THRESHOLD
        ? 'declining' as const
        : 'stable' as const,
    currentAverage,
    previousAverage,
  };
}

function getRoomInsights(feedbackItems: Feedback[]) {
  const feedbackByRoom = new Map<string, Feedback[]>();
  feedbackItems.forEach((feedback) => {
    if (!feedback.roomId) {
      return;
    }
    const roomFeedback = feedbackByRoom.get(feedback.roomId) ?? [];
    roomFeedback.push(feedback);
    feedbackByRoom.set(feedback.roomId, roomFeedback);
  });

  const roomSummaries = summarizeFeedbackSentimentByRoom(
    [...feedbackByRoom].map(([id, roomFeedback]) => ({
      id,
      name: roomFeedback[0]?.roomName || id,
    })),
    feedbackItems,
  );
  const eligibleRooms = roomSummaries
    .map((room) => {
      const roomFeedback = feedbackByRoom.get(room.roomId) ?? [];
      const scoredFeedback = getScoredFeedback(roomFeedback);
      return room.summary && scoredFeedback.length >= MINIMUM_ROOM_INSIGHT_SAMPLES
        ? {
            roomId: room.roomId,
            roomName: room.roomName,
            averageCompoundScore: room.summary.averageCompoundScore,
            feedbackCount: room.total,
          }
        : null;
    })
    .filter((room): room is RoomInsight => room !== null);

  if (eligibleRooms.length < 2) {
    return { bestRoom: null, roomNeedingAttention: null };
  }

  return {
    bestRoom: [...eligibleRooms].sort(
      (left, right) => right.averageCompoundScore - left.averageCompoundScore,
    )[0],
    roomNeedingAttention: [...eligibleRooms].sort(
      (left, right) => left.averageCompoundScore - right.averageCompoundScore,
    )[0],
  };
}

export function buildFeedbackInsights(
  currentFeedback: Feedback[],
  previousFeedback: Feedback[],
  comparable: boolean,
): FeedbackInsights {
  const currentSummary = summarizeFeedbackSentiment(currentFeedback);
  const sentiment = getSentimentDirection(currentFeedback, previousFeedback, comparable);
  const roomInsights = getRoomInsights(currentFeedback);

  return {
    sentimentDirection: sentiment.direction,
    currentAverageCompoundScore: sentiment.currentAverage,
    previousAverageCompoundScore: sentiment.previousAverage,
    ...roomInsights,
    topConcern: currentSummary.mostMentionedIssues[0]
      ? {
          label: currentSummary.mostMentionedIssues[0].label,
          count: currentSummary.mostMentionedIssues[0].count,
        }
      : null,
    mostPraised: currentSummary.mostPraisedAspects[0]
      ? {
          label: currentSummary.mostPraisedAspects[0].label,
          count: currentSummary.mostPraisedAspects[0].count,
        }
      : null,
  };
}
