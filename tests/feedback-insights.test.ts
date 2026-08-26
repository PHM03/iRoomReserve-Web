import { describe, expect, it } from 'vitest';
import {
  buildFeedbackInsights,
  SENTIMENT_INSIGHT_THRESHOLD,
} from '../lib/feedback/feedback-insights';

function feedback(input: {
  roomId?: string;
  roomName?: string;
  compoundScore?: number;
  detectedAspects?: Record<string, 'positive' | 'negative' | 'neutral'>;
}) {
  return {
    id: `${input.roomId ?? 'room-1'}-${input.compoundScore ?? 'none'}`,
    roomId: input.roomId ?? 'room-1',
    roomName: input.roomName ?? 'Room 1',
    buildingId: 'building-1',
    buildingName: 'Building 1',
    reservationId: 'reservation-1',
    userId: 'user-1',
    userName: 'User 1',
    text: '',
    message: '',
    rating: 0,
    overallRating: 0,
    categoryRatings: {},
    feedbackText: '',
    detectedAspects: input.detectedAspects ?? {},
    extractedKeywords: [],
    adminResponse: null,
    compoundScore: input.compoundScore,
    vaderCompoundScore: input.compoundScore,
  } as never;
}

const twoPositiveReviews = [
  feedback({ compoundScore: 0.8 }),
  feedback({ compoundScore: 0.7 }),
];
const twoNegativeReviews = [
  feedback({ compoundScore: -0.8 }),
  feedback({ compoundScore: -0.7 }),
];

describe('buildFeedbackInsights', () => {
  it('identifies improving, declining, and stable sentiment', () => {
    expect(buildFeedbackInsights(twoPositiveReviews, twoNegativeReviews, true).sentimentDirection)
      .toBe('improving');
    expect(buildFeedbackInsights(twoNegativeReviews, twoPositiveReviews, true).sentimentDirection)
      .toBe('declining');
    expect(buildFeedbackInsights(
      [feedback({ compoundScore: 0.2 }), feedback({ compoundScore: 0.3 })],
      [feedback({ compoundScore: 0.2 }), feedback({ compoundScore: 0.3 })],
      true,
    ).sentimentDirection).toBe('stable');
    expect(SENTIMENT_INSIGHT_THRESHOLD).toBe(0.1);
  });

  it('reports insufficient comparison data without fabricating a trend', () => {
    const result = buildFeedbackInsights(twoPositiveReviews, [], true);

    expect(result.sentimentDirection).toBe('not_enough_data');
  });

  it('identifies best and attention rooms without considering no-feedback rooms', () => {
    const result = buildFeedbackInsights([
      feedback({ roomId: 'room-best', roomName: 'Room Best', compoundScore: 0.8 }),
      feedback({ roomId: 'room-best', roomName: 'Room Best', compoundScore: 0.7 }),
      feedback({ roomId: 'room-worst', roomName: 'Room Worst', compoundScore: -0.8 }),
      feedback({ roomId: 'room-worst', roomName: 'Room Worst', compoundScore: -0.7 }),
    ], [], false);

    expect(result.bestRoom?.roomName).toBe('Room Best');
    expect(result.roomNeedingAttention?.roomName).toBe('Room Worst');
  });

  it('identifies the most common negative and positive aspects', () => {
    const result = buildFeedbackInsights([
      feedback({ compoundScore: 0.4, detectedAspects: { cleanliness: 'negative', comfort: 'positive' } }),
      feedback({ compoundScore: 0.4, detectedAspects: { cleanliness: 'negative' } }),
      feedback({ compoundScore: 0.4, detectedAspects: { comfort: 'positive' } }),
    ], [], false);

    expect(result.topConcern).toEqual({ label: 'Cleanliness', count: 2 });
    expect(result.mostPraised).toEqual({ label: 'Comfort', count: 2 });
  });

  it('returns no room or aspect conclusion when the current data is insufficient', () => {
    const result = buildFeedbackInsights(
      [feedback({ roomId: 'room-only', roomName: 'Room Only', compoundScore: 0.5 })],
      [],
      false,
    );

    expect(result.bestRoom).toBeNull();
    expect(result.roomNeedingAttention).toBeNull();
    expect(result.topConcern).toBeNull();
    expect(result.mostPraised).toBeNull();
  });
});
