import { describe, expect, it } from 'vitest';
import {
  buildFeedbackDemographicAnalytics,
  buildFeedbackLocationAnalytics,
  compareCategoryPerformance,
  filterFeedbackLocationAnalytics,
  MINIMUM_FEEDBACK_SAMPLE_SIZE,
  summarizeFeedbackAnalytics,
} from '../lib/feedback/feedback-analytics';
import { buildSentimentTrend } from '../lib/feedback/feedback-trend';

function feedback(input: Record<string, unknown> = {}) {
  return {
    id: String(input.id ?? 'review'),
    reservationId: 'reservation-1',
    userId: 'user-1',
    userName: 'User 1',
    buildingId: 'building-1',
    buildingName: 'Main Campus',
    roomId: 'room-101',
    roomName: 'Room 101',
    rating: 4,
    compoundScore: 0.8,
    categoryRatings: {
      cleanliness: 4,
      comfort: 4,
      air_conditioning: 4,
      equipment_projector: 4,
      internet_connectivity: 4,
    },
    detectedAspects: {},
    text: '',
    message: '',
    overallRating: 4,
    feedbackText: '',
    extractedKeywords: [],
    adminResponse: null,
    createdAt: { toDate: () => new Date('2026-08-24T09:00:00') },
    ...input,
  };
}

describe('feedback analytics refinement', () => {
  it('calculates broad five-class sentiment rates and safe rating averages', () => {
    const metrics = summarizeFeedbackAnalytics([
      feedback({ compoundScore: 0.8 }),
      feedback({ compoundScore: 0.2 }),
      feedback({ compoundScore: 0 }),
      feedback({ compoundScore: -0.2 }),
      feedback({ compoundScore: -0.8 }),
    ]);

    expect(metrics.totalReviews).toBe(5);
    expect(metrics.positiveRate).toBe(40);
    expect(metrics.neutralRate).toBe(20);
    expect(metrics.negativeRate).toBe(40);
    expect(metrics.averageRating).toBe(4);
    expect(Number.isFinite(metrics.negativeRate)).toBe(true);
  });

  it('builds positive and negative time-bucket rates from feedback submission dates', () => {
    const result = buildSentimentTrend([
      feedback({ compoundScore: 0.8, createdAt: { toDate: () => new Date('2026-08-24T09:00:00') } }),
      feedback({ compoundScore: -0.8, createdAt: { toDate: () => new Date('2026-08-25T09:00:00') } }),
    ] as never, 'weekly', new Date('2026-08-26T12:00:00'));

    expect(result.buckets[1].positiveRate).toBe(100);
    expect(result.buckets[1].negativeRate).toBe(0);
    expect(result.buckets[2].positiveRate).toBe(0);
    expect(result.buckets[2].negativeRate).toBe(100);
    expect(result.buckets[1].averageRating).toBe(4);
  });

  it('derives floors through roomId and excludes small locations from reliable rankings', () => {
    const items = Array.from({ length: MINIMUM_FEEDBACK_SAMPLE_SIZE }, (_, index) => feedback({
      id: `review-${index}`,
      roomId: 'room-201',
      roomName: 'Room 201',
      compoundScore: -0.8,
      rating: 1,
    }));
    const analytics = buildFeedbackLocationAnalytics(items, [], [
      { id: 'room-101', name: 'Room 101', buildingId: 'building-1', floor: '1' },
      { id: 'room-201', name: 'Room 201', buildingId: 'building-1', floor: '2' },
    ]);

    expect(analytics.floors[0].floor).toBe('2');
    expect(analytics.rooms[0].name).toBe('Room 201');
    expect(analytics.rooms[0].reliable).toBe(true);
    expect(analytics.rooms[0].negativeRate).toBe(100);
  });

  it('retains zero-review buildings, floors, and rooms without marking them reliable', () => {
    const rooms = [
      { id: 'room-101', name: 'Room 101', buildingId: 'building-1', floor: '1' },
      { id: 'room-201', name: 'Room 201', buildingId: 'building-1', floor: '2' },
      { id: 'room-301', name: 'Room 301', buildingId: 'building-2', floor: '1' },
    ];
    const analytics = buildFeedbackLocationAnalytics([
      feedback({ roomId: 'room-101' }),
    ], [], rooms);

    expect(analytics.rooms.find((room) => room.id === 'room-201')).toMatchObject({
      totalReviews: 0,
      reliable: false,
    });
    expect(analytics.floors.find((floor) => floor.id === 'building-1::2')).toMatchObject({
      totalReviews: 0,
      reliable: false,
    });
    expect(analytics.buildings.find((building) => building.id === 'building-2')).toMatchObject({
      totalReviews: 0,
      reliable: false,
    });
  });

  it('limits location rows to the active floor or room scope while retaining in-scope zero rows', () => {
    const rooms = [
      { id: 'room-101', name: 'Room 101', buildingId: 'building-1', floor: '1' },
      { id: 'room-201', name: 'Room 201', buildingId: 'building-1', floor: '2' },
    ];
    const analytics = buildFeedbackLocationAnalytics([
      feedback({ roomId: 'room-101' }),
    ], [], rooms);

    const floorAnalytics = filterFeedbackLocationAnalytics(
      analytics,
      'floor',
      'building-1',
      '2',
      '',
    );
    expect(floorAnalytics.rooms.map((room) => room.id)).toEqual(['room-201']);
    expect(floorAnalytics.rooms[0].totalReviews).toBe(0);

    const roomAnalytics = filterFeedbackLocationAnalytics(
      analytics,
      'room',
      'building-1',
      '',
      'room-201',
    );
    expect(roomAnalytics.rooms.map((room) => room.id)).toEqual(['room-201']);
    expect(roomAnalytics.floors.map((floor) => floor.id)).toEqual(['building-1::2']);
  });

  it('calculates category low-rating rates and percentage-point changes without divide-by-zero', () => {
    const current = Array.from({ length: 5 }, () => feedback({
      categoryRatings: { cleanliness: 2 },
    }));
    const previous = Array.from({ length: 5 }, () => feedback({
      categoryRatings: { cleanliness: 4 },
    }));
    const categories = compareCategoryPerformance(current, previous, true);

    expect(categories.cleanliness?.lowRatingRate).toBe(100);
    expect(categories.cleanliness?.lowRatingRateChangePoints).toBe(100);
    expect(categories.cleanliness?.direction).toBe('worsening');

    const noPrevious = compareCategoryPerformance(current, [], true);
    expect(noPrevious.cleanliness?.lowRatingRateChangePoints).toBeNull();
  });

  it('suppresses demographic groups below the minimum sample size', () => {
    const groups = buildFeedbackDemographicAnalytics([
      ...Array.from({ length: 5 }, () => feedback({ role: 'Student', gender: 'female' })),
      ...Array.from({ length: 2 }, () => feedback({ role: 'Faculty Professor', gender: 'male' })),
    ]);

    expect(groups.find((group) => group.group === 'Student')?.reliable).toBe(true);
    expect(groups.find((group) => group.group === 'Faculty Professor')?.reliable).toBe(false);
    expect(groups.find((group) => group.group === 'gender:female')?.reliable).toBe(true);
  });
});
