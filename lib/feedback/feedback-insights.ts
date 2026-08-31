import type { Feedback } from './feedback';
import { summarizeFeedbackSentiment, summarizeFeedbackSentimentByRoom } from './feedback-sentiment';
import {
  buildFeedbackLocationAnalytics,
  compareCategoryPerformance,
  buildFeedbackDemographicAnalytics,
  MINIMUM_FEEDBACK_SAMPLE_SIZE,
  summarizeFeedbackAnalytics,
} from './feedback-analytics';

/** A 0.10 VADER change is large enough to describe as a meaningful trend. */
export const SENTIMENT_INSIGHT_THRESHOLD = 0.1;

/** Legacy export retained for callers; it follows the canonical five-review rule. */
export const MINIMUM_ROOM_INSIGHT_SAMPLES = MINIMUM_FEEDBACK_SAMPLE_SIZE;

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
  actionableInsights: string[];
  currentPositiveRate: number;
  previousPositiveRate: number | null;
  currentNegativeRate: number;
  previousNegativeRate: number | null;
  positiveRateChangePoints: number | null;
  negativeRateChangePoints: number | null;
}

interface InsightRoom {
  id: string;
  name: string;
  buildingId: string;
  buildingName?: string;
  floor: string;
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

function getReviewVolumeInsight(
  currentReviewCount: number,
  previousReviewCount: number,
  comparable: boolean,
) {
  if (
    !comparable ||
    currentReviewCount < MINIMUM_FEEDBACK_SAMPLE_SIZE ||
    previousReviewCount < MINIMUM_FEEDBACK_SAMPLE_SIZE ||
    previousReviewCount === 0
  ) {
    return null;
  }

  const percentageChange = Number(
    (((currentReviewCount - previousReviewCount) / previousReviewCount) * 100).toFixed(1),
  );
  if (Math.abs(percentageChange) < 0.1) {
    return null;
  }

  return `Review volume ${percentageChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentageChange).toFixed(1)}% compared with the previous period.`;
}

function getCategoryChangeInsight(category: {
  label: string;
  direction: 'improving' | 'worsening' | 'stable' | 'insufficient';
  averageChange: number | null;
  lowRatingRateChangePoints: number | null;
}) {
  if (category.direction === 'worsening') {
    if (category.lowRatingRateChangePoints !== null && category.lowRatingRateChangePoints >= 5) {
      return `${category.label} low-rating rate increased by ${category.lowRatingRateChangePoints.toFixed(1)} percentage points compared with the previous period.`;
    }
    if (category.averageChange !== null && category.averageChange <= -0.1) {
      return `${category.label} average rating decreased by ${Math.abs(category.averageChange).toFixed(2)} points compared with the previous period.`;
    }
  }

  if (category.direction === 'improving') {
    if (category.lowRatingRateChangePoints !== null && category.lowRatingRateChangePoints <= -5) {
      return `${category.label} low-rating rate decreased by ${Math.abs(category.lowRatingRateChangePoints).toFixed(1)} percentage points compared with the previous period.`;
    }
    if (category.averageChange !== null && category.averageChange >= 0.1) {
      return `${category.label} average rating increased by ${category.averageChange.toFixed(2)} points compared with the previous period.`;
    }
  }

  return null;
}

function getDemographicComparisonLabel(label: string) {
  return label.endsWith('s') ? label : `${label} users`;
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
  rooms: InsightRoom[] = [],
): FeedbackInsights {
  const currentSummary = summarizeFeedbackSentiment(currentFeedback);
  const sentiment = getSentimentDirection(currentFeedback, previousFeedback, comparable);
  const roomInsights = getRoomInsights(currentFeedback);
  const currentMetrics = summarizeFeedbackAnalytics(currentFeedback);
  const previousMetrics = summarizeFeedbackAnalytics(previousFeedback);
  const positiveRateChangePoints = comparable && previousMetrics.totalReviews > 0
    ? Number((currentMetrics.positiveRate - previousMetrics.positiveRate).toFixed(1))
    : null;
  const negativeRateChangePoints = comparable && previousMetrics.totalReviews > 0
    ? Number((currentMetrics.negativeRate - previousMetrics.negativeRate).toFixed(1))
    : null;
  const actionableInsights: string[] = [];

  if (currentMetrics.totalReviews === 0) {
    actionableInsights.push('No feedback available for the selected filters.');
  } else if (!comparable || previousMetrics.totalReviews < MINIMUM_FEEDBACK_SAMPLE_SIZE) {
    actionableInsights.push('Not enough previous-period data for comparison.');
  } else if (positiveRateChangePoints !== null && Math.abs(positiveRateChangePoints) >= 0.1) {
    actionableInsights.push(
      `Positive review rate ${positiveRateChangePoints > 0 ? 'increased' : 'decreased'} by ${Math.abs(positiveRateChangePoints).toFixed(1)} percentage points compared with the previous period.`,
    );
  } else {
    actionableInsights.push('Overall sentiment remained stable compared with the previous period.');
  }

  if (negativeRateChangePoints !== null && Math.abs(negativeRateChangePoints) >= 0.1) {
    actionableInsights.push(
      `Negative feedback ${negativeRateChangePoints > 0 ? 'increased' : 'decreased'} by ${Math.abs(negativeRateChangePoints).toFixed(1)} percentage points compared with the previous period.`,
    );
  }

  const reviewVolumeInsight = getReviewVolumeInsight(
    currentMetrics.totalReviews,
    previousMetrics.totalReviews,
    comparable,
  );
  if (reviewVolumeInsight) {
    actionableInsights.push(reviewVolumeInsight);
  }

  const reliableRoomAnalytics = buildFeedbackLocationAnalytics(
    currentFeedback,
    previousFeedback,
    rooms.length > 0
      ? rooms
      : [...new Map(currentFeedback.filter((item) => item.roomId).map((item) => [item.roomId, {
          id: item.roomId,
          name: item.roomName,
          buildingId: item.buildingId,
          buildingName: item.buildingName,
          floor: '',
        }])).values()],
    comparable,
  ).rooms.filter((room) => room.reliable);
  const highestNegativeRoom = [...reliableRoomAnalytics].sort((left, right) => right.negativeRate - left.negativeRate)[0];
  if (highestNegativeRoom) {
    actionableInsights.push(
      `${highestNegativeRoom.name} has the highest negative feedback rate among rooms with sufficient reviews.`,
    );
  }

  const locationAnalytics = buildFeedbackLocationAnalytics(
    currentFeedback,
    previousFeedback,
    rooms,
    comparable,
  );
  const previousLocationAnalytics = buildFeedbackLocationAnalytics(
    previousFeedback,
    [],
    rooms,
    false,
  );
  const reliableFloors = locationAnalytics.floors.filter((floor) => floor.reliable);
  const floorNeedingAttention = [...reliableFloors]
    .sort((left, right) => right.negativeRate - left.negativeRate)[0];
  if (floorNeedingAttention) {
    const previousFloor = previousLocationAnalytics.floors.find((floor) => floor.id === floorNeedingAttention.id);
    const canCompareFloor = comparable && previousFloor?.totalReviews !== undefined && previousFloor.totalReviews >= MINIMUM_FEEDBACK_SAMPLE_SIZE;
    if (!comparable || canCompareFloor) {
      const previousNegativeRate = previousFloor?.negativeRate ?? floorNeedingAttention.negativeRate;
      const negativeChange = Number((floorNeedingAttention.negativeRate - previousNegativeRate).toFixed(1));
      actionableInsights.push(
        comparable && canCompareFloor && Math.abs(negativeChange) >= 0.1
          ? `Negative-review rate on ${floorNeedingAttention.name} ${negativeChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(negativeChange).toFixed(1)} percentage points compared with the previous period.`
          : `${floorNeedingAttention.name} has the highest negative-review rate at ${floorNeedingAttention.negativeRate.toFixed(1)}%.`,
      );
    }
  }

  const categoryPerformance = Object.values(
    compareCategoryPerformance(currentFeedback, previousFeedback, comparable),
  );
  const reliableCategories = categoryPerformance.filter((category) => category.reliable);
  const lowestCategory = [...reliableCategories]
    .filter((category) => category.averageRating !== null)
    .sort((left, right) => (left.averageRating ?? 0) - (right.averageRating ?? 0))[0];
  const highestComplaintCategory = [...reliableCategories]
    .sort((left, right) => right.lowRatingRate - left.lowRatingRate)[0];
  const worseningCategory = reliableCategories.find((category) => category.direction === 'worsening');
  const improvingCategory = reliableCategories.find((category) => category.direction === 'improving');
  if (lowestCategory) {
    actionableInsights.push(`${lowestCategory.label} has the lowest average category rating during the selected period.`);
  }
  if (highestComplaintCategory && highestComplaintCategory.category !== lowestCategory?.category) {
    actionableInsights.push(`${highestComplaintCategory.label} has the highest proportion of low ratings.`);
  }
  if (worseningCategory) {
    const categoryInsight = getCategoryChangeInsight(worseningCategory);
    if (categoryInsight) actionableInsights.push(categoryInsight);
  }
  if (improvingCategory) {
    const categoryInsight = getCategoryChangeInsight(improvingCategory);
    if (categoryInsight) actionableInsights.push(categoryInsight);
  }

  const reliableDemographicGroups = buildFeedbackDemographicAnalytics(currentFeedback)
    .filter((group) => group.reliable);
  const demographicPairs = reliableDemographicGroups.flatMap((left, index) =>
    reliableDemographicGroups.slice(index + 1).filter((right) =>
      left.group.startsWith('gender:') === right.group.startsWith('gender:'),
    ).map((right) => ({ left, right })),
  );
  const strongestDemographicPair = demographicPairs
    .map(({ left, right }) => ({
      higher: left.positiveRate >= right.positiveRate ? left : right,
      lower: left.positiveRate >= right.positiveRate ? right : left,
      difference: Math.abs(left.positiveRate - right.positiveRate),
    }))
    .sort((left, right) => right.difference - left.difference)[0];
  if (strongestDemographicPair && strongestDemographicPair.difference >= 5) {
    actionableInsights.push(
      `${getDemographicComparisonLabel(strongestDemographicPair.higher.label)} had a ${strongestDemographicPair.difference.toFixed(1)} percentage-point higher positive sentiment rate than ${getDemographicComparisonLabel(strongestDemographicPair.lower.label).toLowerCase()}.`,
    );
  }

  const recurringConcern = Object.entries(currentMetrics.aspectMentions)
    .filter(([, aspect]) => (aspect?.negativeCount ?? 0) > 0)
    .sort(([, left], [, right]) => (right?.negativeCount ?? 0) - (left?.negativeCount ?? 0))[0];
  if (recurringConcern && (recurringConcern[1]?.negativeCount ?? 0) >= MINIMUM_FEEDBACK_SAMPLE_SIZE) {
    const concernLabel = recurringConcern[0].replace(/_/g, ' ');
    actionableInsights.push(
      `${concernLabel.charAt(0).toUpperCase() + concernLabel.slice(1)} continues to be among the most frequently mentioned negative aspects.`,
    );
  }

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
    actionableInsights,
    currentPositiveRate: currentMetrics.positiveRate,
    previousPositiveRate: comparable && previousMetrics.totalReviews > 0 ? previousMetrics.positiveRate : null,
    currentNegativeRate: currentMetrics.negativeRate,
    previousNegativeRate: comparable && previousMetrics.totalReviews > 0 ? previousMetrics.negativeRate : null,
    positiveRateChangePoints,
    negativeRateChangePoints,
  };
}
