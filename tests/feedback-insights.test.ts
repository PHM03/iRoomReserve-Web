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
  categoryRatings?: Record<string, number>;
  role?: string;
  gender?: string;
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
    categoryRatings: input.categoryRatings ?? {},
    role: input.role,
    gender: input.gender,
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
    ...Array.from({ length: 5 }, (_, index) => feedback({
      roomId: 'room-best',
      roomName: 'Room Best',
      createdAt: currentDates[index % currentDates.length],
      compoundScore: index % 2 === 0 ? 0.8 : 0.7,
      detectedAspects: { comfort: 'positive' },
    })),
    ...Array.from({ length: 5 }, (_, index) => feedback({
      roomId: 'room-worst',
      roomName: 'Room Worst',
      createdAt: currentDates[index % currentDates.length],
      compoundScore: index % 2 === 0 ? -0.8 : -0.7,
      detectedAspects: { cleanliness: 'negative' },
    })),
    ...Array.from({ length: 5 }, (_, index) => feedback({
      roomId: 'room-best',
      roomName: 'Room Best',
      createdAt: previousDates[index % previousDates.length],
      compoundScore: -0.2,
    })),
    ...Array.from({ length: 5 }, (_, index) => feedback({
      roomId: 'room-worst',
      roomName: 'Room Worst',
      createdAt: previousDates[index % previousDates.length],
      compoundScore: -0.2,
    })),
  ];
}

const twoPositiveReviews = [
  ...Array.from({ length: 5 }, (_, index) => feedback({ compoundScore: index % 2 === 0 ? 0.8 : 0.7 })),
];
const twoNegativeReviews = [
  ...Array.from({ length: 5 }, (_, index) => feedback({ compoundScore: index % 2 === 0 ? -0.8 : -0.7 })),
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

  it('reports review-volume percentage changes only with reliable comparable periods', () => {
    const result = buildFeedbackInsights(
      Array.from({ length: 11 }, () => feedback({ compoundScore: 0.2 })),
      Array.from({ length: 10 }, () => feedback({ compoundScore: 0.2 })),
      true,
    );

    expect(result.actionableInsights).toContain(
      'Review volume increased by 10.0% compared with the previous period.',
    );
  });

  it('omits review-volume percentages for a zero baseline without non-finite output', () => {
    const result = buildFeedbackInsights(
      Array.from({ length: 5 }, () => feedback({ compoundScore: 0.2 })),
      [],
      true,
    );
    const insights = result.actionableInsights.join(' ');

    expect(insights).not.toContain('Review volume');
    expect(insights).not.toContain('NaN');
    expect(insights).not.toContain('Infinity');
  });

  it('identifies best and attention rooms without considering no-feedback rooms', () => {
    const result = buildFeedbackInsights([
      ...Array.from({ length: 5 }, (_, index) => feedback({
        roomId: 'room-best', roomName: 'Room Best', compoundScore: index % 2 === 0 ? 0.8 : 0.7,
      })),
      ...Array.from({ length: 5 }, (_, index) => feedback({
        roomId: 'room-worst', roomName: 'Room Worst', compoundScore: index % 2 === 0 ? -0.8 : -0.7,
      })),
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

  it('does not rank rooms with fewer than five reviews', () => {
    const result = buildFeedbackInsights([
      ...Array.from({ length: 4 }, () => feedback({
        roomId: 'room-small', roomName: 'Room Small', compoundScore: -0.9,
      })),
      ...Array.from({ length: 5 }, () => feedback({
        roomId: 'room-large', roomName: 'Room Large', compoundScore: 0.9,
      })),
    ], [], false);

    expect(result.bestRoom).toBeNull();
    expect(result.roomNeedingAttention).toBeNull();
  });

  it('adds a reliable floor action only when the floor has at least five reviews', () => {
    const rooms = [
      { id: 'room-floor-1', name: 'Room Floor 1', buildingId: 'building-1', floor: '1' },
      { id: 'room-floor-2', name: 'Room Floor 2', buildingId: 'building-1', floor: '2' },
    ];
    const result = buildFeedbackInsights([
      ...Array.from({ length: 5 }, () => feedback({ roomId: 'room-floor-1', compoundScore: 0.8 })),
      ...Array.from({ length: 5 }, () => feedback({ roomId: 'room-floor-2', compoundScore: -0.8 })),
    ], [], false, rooms);

    expect(result.actionableInsights).toContain('2 has the highest negative-review rate at 100.0%.');

    const comparableResult = buildFeedbackInsights(
      Array.from({ length: 5 }, () => feedback({ roomId: 'room-floor-2', compoundScore: -0.8 })),
      Array.from({ length: 5 }, () => feedback({ roomId: 'room-floor-2', compoundScore: 0.8 })),
      true,
      rooms,
    );
    expect(comparableResult.actionableInsights).toContain(
      'Negative-review rate on 2 increased by 100.0 percentage points compared with the previous period.',
    );

    const insufficientFloor = buildFeedbackInsights([
      ...Array.from({ length: 5 }, () => feedback({ roomId: 'room-floor-1', compoundScore: 0.8 })),
      ...Array.from({ length: 4 }, () => feedback({ roomId: 'room-floor-2', compoundScore: -0.8 })),
    ], [], false, rooms);
    expect(insufficientFloor.actionableInsights).not.toContain('2 has the highest negative-review rate at 100.0%.');
  });

  it('reports improving categories in percentage-point terms only with comparable data', () => {
    const current = Array.from({ length: 5 }, () => feedback({
      categoryRatings: { cleanliness: 4 },
      compoundScore: 0.8,
    }));
    const previous = Array.from({ length: 5 }, () => feedback({
      categoryRatings: { cleanliness: 2 },
      compoundScore: 0.2,
    }));
    const result = buildFeedbackInsights(current, previous, true);

    expect(result.actionableInsights).toContain(
      'Cleanliness low-rating rate decreased by 100.0 percentage points compared with the previous period.',
    );
    expect(result.actionableInsights.join(' ')).not.toContain('NaN');
    expect(result.actionableInsights.join(' ')).not.toContain('Infinity');
  });

  it('describes worsening and improving categories using the low-rating rate when that is the changed measure', () => {
    const worsening = buildFeedbackInsights(
      [2, 4, 4, 4, 4].map((rating) => feedback({ categoryRatings: { cleanliness: rating } })),
      [3, 3, 3, 4, 5].map((rating) => feedback({ categoryRatings: { cleanliness: rating } })),
      true,
    );
    const improving = buildFeedbackInsights(
      [3, 3, 3, 4, 5].map((rating) => feedback({ categoryRatings: { cleanliness: rating } })),
      [2, 4, 4, 4, 4].map((rating) => feedback({ categoryRatings: { cleanliness: rating } })),
      true,
    );

    expect(worsening.actionableInsights).toContain(
      'Cleanliness low-rating rate increased by 20.0 percentage points compared with the previous period.',
    );
    expect(improving.actionableInsights).toContain(
      'Cleanliness low-rating rate decreased by 20.0 percentage points compared with the previous period.',
    );
  });

  it('reports the strongest reliable role or gender comparison and suppresses small groups', () => {
    const result = buildFeedbackInsights([
      ...Array.from({ length: 5 }, () => feedback({ role: 'Student', gender: 'female', compoundScore: 0.8 })),
      ...Array.from({ length: 5 }, () => feedback({ role: 'Faculty Professor', gender: 'male', compoundScore: -0.8 })),
    ], [], false);
    expect(result.actionableInsights).toContain(
      'Students had a 100.0 percentage-point higher positive sentiment rate than faculty users.',
    );

    const insufficient = buildFeedbackInsights([
      ...Array.from({ length: 5 }, () => feedback({ role: 'Student', compoundScore: 0.8 })),
      ...Array.from({ length: 4 }, () => feedback({ role: 'Faculty Professor', compoundScore: -0.8 })),
    ], [], false);
    expect(insufficient.actionableInsights.some((insight) => insight.includes('Faculty'))).toBe(false);
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
    expect(result.topConcern).toEqual({ label: 'Cleanliness', count: 5 });
    expect(result.mostPraised).toEqual({ label: 'Comfort', count: 5 });
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

    expect(floorGraphFeedback).toHaveLength(10);
    expect(graphFeedback).toHaveLength(10);

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
    expect(comparison.currentItems).toHaveLength(10);
    expect(comparison.previousItems).toHaveLength(10);

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
