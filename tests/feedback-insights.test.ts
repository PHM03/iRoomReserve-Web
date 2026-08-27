import { describe, expect, it } from 'vitest';
import {
  buildFeedbackInsights,
  SENTIMENT_INSIGHT_THRESHOLD,
} from '../lib/feedback/feedback-insights';
import {
  compareFeedbackPeriods,
  scopeFeedbackToBuilding,
} from '../lib/feedback/feedback-period';
import { scopeFeedback } from '../lib/feedback/feedback-scope';

function feedback(input: {
  roomId?: string;
  roomName?: string;
  buildingId?: string;
  createdAt?: string;
  compoundScore?: number;
  detectedAspects?: Record<string, 'positive' | 'negative' | 'neutral'>;
}) {
  return {
    id: `${input.roomId ?? 'room-1'}-${input.compoundScore ?? 'none'}`,
    roomId: input.roomId ?? 'room-1',
    roomName: input.roomName ?? 'Room 1',
    buildingId: input.buildingId ?? 'building-1',
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
    createdAt: input.createdAt
      ? { toDate: () => new Date(input.createdAt as string) }
      : undefined,
  } as never;
}

function buildBuildingWideInsights(
  items: ReturnType<typeof feedback>[],
  period: 'weekly' | 'monthly' | 'yearly',
  now: Date,
) {
  const buildingFeedback = scopeFeedbackToBuilding(items, 'building-1');
  const comparison = compareFeedbackPeriods(buildingFeedback, period, now);

  return buildFeedbackInsights(
    comparison.currentItems,
    comparison.previousItems,
    comparison.comparable,
  );
}

function buildingWidePeriodFeedback(currentDates: string[], previousDates: string[]) {
  return [
    feedback({
      roomId: 'room-best',
      roomName: 'Room Best',
      createdAt: currentDates[0],
      compoundScore: 0.8,
      detectedAspects: { comfort: 'positive' },
    }),
    feedback({
      roomId: 'room-best',
      roomName: 'Room Best',
      createdAt: currentDates[1],
      compoundScore: 0.7,
      detectedAspects: { comfort: 'positive' },
    }),
    feedback({
      roomId: 'room-worst',
      roomName: 'Room Worst',
      createdAt: currentDates[0],
      compoundScore: -0.8,
      detectedAspects: { cleanliness: 'negative' },
    }),
    feedback({
      roomId: 'room-worst',
      roomName: 'Room Worst',
      createdAt: currentDates[1],
      compoundScore: -0.7,
      detectedAspects: { cleanliness: 'negative' },
    }),
    feedback({
      roomId: 'room-best',
      roomName: 'Room Best',
      createdAt: previousDates[0],
      compoundScore: -0.2,
    }),
    feedback({
      roomId: 'room-worst',
      roomName: 'Room Worst',
      createdAt: previousDates[1],
      compoundScore: -0.2,
    }),
  ];
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

  it.each([
    {
      period: 'weekly' as const,
      currentDates: ['2026-08-24T09:00:00', '2026-08-25T09:00:00'],
      previousDates: ['2026-08-17T09:00:00', '2026-08-18T09:00:00'],
    },
    {
      period: 'monthly' as const,
      currentDates: ['2026-08-04T09:00:00', '2026-08-05T09:00:00'],
      previousDates: ['2026-07-04T09:00:00', '2026-07-05T09:00:00'],
    },
    {
      period: 'yearly' as const,
      currentDates: ['2026-02-04T09:00:00', '2026-02-05T09:00:00'],
      previousDates: ['2025-02-04T09:00:00', '2025-02-05T09:00:00'],
    },
  ])('builds $period insights from all feedback in the selected building', ({
    period,
    currentDates,
    previousDates,
  }) => {
    const result = buildBuildingWideInsights(
      buildingWidePeriodFeedback(currentDates, previousDates),
      period,
      new Date('2026-08-26T12:00:00'),
    );

    expect(result.sentimentDirection).toBe('improving');
    expect(result.roomNeedingAttention?.roomName).toBe('Room Worst');
    expect(result.bestRoom?.roomName).toBe('Room Best');
    expect(result.topConcern).toEqual({ label: 'Cleanliness', count: 2 });
    expect(result.mostPraised).toEqual({ label: 'Comfort', count: 2 });
  });

  it('does not depend on the graph floor or room selection', () => {
    const items = buildingWidePeriodFeedback(
      ['2026-08-24T09:00:00', '2026-08-25T09:00:00'],
      ['2026-08-17T09:00:00', '2026-08-18T09:00:00'],
    );
    const rooms = [
      { id: 'room-best', buildingId: 'building-1', floor: '1' },
      { id: 'room-worst', buildingId: 'building-1', floor: '2' },
    ];
    const floorGraphFeedback = scopeFeedback(items, {
      buildingId: 'building-1',
      floor: '2',
      rooms,
      scope: 'floor',
    });
    const graphFeedback = scopeFeedback(items, {
      buildingId: 'building-1',
      floor: '2',
      roomId: 'room-worst',
      rooms,
      scope: 'room',
    });

    expect(floorGraphFeedback).toHaveLength(3);
    expect(graphFeedback).toHaveLength(3);

    const result = buildBuildingWideInsights(
      items,
      'weekly',
      new Date('2026-08-26T12:00:00'),
    );

    expect(result.bestRoom?.roomName).toBe('Room Best');
    expect(result.roomNeedingAttention?.roomName).toBe('Room Worst');
    expect(result.topConcern?.label).toBe('Cleanliness');
    expect(result.mostPraised?.label).toBe('Comfort');
  });

  it('keeps Main Campus and Digi Campus feedback isolated by selected building', () => {
    const result = buildBuildingWideInsights([
      ...buildingWidePeriodFeedback(
        ['2026-08-24T09:00:00', '2026-08-25T09:00:00'],
        ['2026-08-17T09:00:00', '2026-08-18T09:00:00'],
      ),
      feedback({
        buildingId: 'building-2',
        roomId: 'digi-room',
        roomName: 'Digi Room',
        createdAt: '2026-08-24T09:00:00',
        compoundScore: -1,
        detectedAspects: { technology: 'negative' },
      }),
    ], 'weekly', new Date('2026-08-26T12:00:00'));

    expect(result.topConcern?.label).toBe('Cleanliness');
    expect(result.topConcern?.label).not.toBe('Technology');
  });

  it('keeps All Time without a previous-period trend', () => {
    const result = buildFeedbackInsights(
      buildingWidePeriodFeedback(
        ['2026-08-24T09:00:00', '2026-08-25T09:00:00'],
        ['2026-08-17T09:00:00', '2026-08-18T09:00:00'],
      ),
      [],
      false,
    );

    expect(result.sentimentDirection).toBe('not_enough_data');
  });

  it('builds a semester comparison from the same semester in the previous academic year', () => {
    const comparison = compareFeedbackPeriods(
      buildingWidePeriodFeedback(
        ['2026-08-24T09:00:00', '2026-08-25T09:00:00'],
        ['2025-08-24T09:00:00', '2025-08-25T09:00:00'],
      ),
      'semester',
      new Date('2026-08-26T12:00:00'),
      { academicYear: 'A.Y. 2026-2027', semester: '1st Semester' },
    );

    expect(comparison.configured).toBe(true);
    expect(comparison.comparable).toBe(true);
    expect(comparison.currentItems).toHaveLength(4);
    expect(comparison.previousItems).toHaveLength(2);

    const result = buildFeedbackInsights(
      comparison.currentItems,
      comparison.previousItems,
      comparison.comparable,
    );

    expect(result.sentimentDirection).toBe('improving');
    expect(result.roomNeedingAttention?.roomName).toBe('Room Worst');
    expect(result.bestRoom?.roomName).toBe('Room Best');
    expect(result.topConcern?.label).toBe('Cleanliness');
    expect(result.mostPraised?.label).toBe('Comfort');
  });
});
