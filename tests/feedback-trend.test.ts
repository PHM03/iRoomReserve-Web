import { describe, expect, it } from 'vitest';
import { buildSentimentTrend } from '../lib/feedback/feedback-trend';
import { scopeFeedback } from '../lib/feedback/feedback-scope';
import { summarizeFeedbackSentimentByRoom } from '../lib/feedback/feedback-sentiment';
import type { ScheduleContext } from '../lib/schedules/scheduleContext';

function feedback(input: {
  date: string;
  roomId?: string;
  buildingId?: string;
  compoundScore?: number;
  vaderCompoundScore?: number;
}) {
  return {
    id: input.date,
    roomId: input.roomId ?? 'room-1',
    roomName: 'Room 1',
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
    detectedAspects: {},
    extractedKeywords: [],
    adminResponse: null,
    createdAt: {
      toDate: () => new Date(input.date),
    },
    compoundScore: input.compoundScore,
    vaderCompoundScore: input.vaderCompoundScore,
  } as never;
}

describe('buildSentimentTrend', () => {
  it('creates one bucket per day for the relevant week and preserves empty days', () => {
    const result = buildSentimentTrend(
      [feedback({ date: '2026-08-24T09:00:00', compoundScore: 0.8 })],
      'weekly',
      new Date('2026-08-26T12:00:00'),
    );

    expect(result.buckets).toHaveLength(7);
    expect(result.buckets[1].averageCompoundScore).toBe(0.8);
    expect(result.buckets[0].averageCompoundScore).toBeNull();
    expect(result.buckets[1].feedbackCount).toBe(1);
  });

  it('averages stored VADER scores and ignores feedback without a valid score', () => {
    const result = buildSentimentTrend(
      [
        feedback({ date: '2026-08-24T09:00:00', vaderCompoundScore: 0.4 }),
        feedback({ date: '2026-08-24T10:00:00', compoundScore: Number.NaN }),
      ],
      'weekly',
      new Date('2026-08-26T12:00:00'),
    );

    expect(result.buckets[1].averageCompoundScore).toBe(0.4);
    expect(result.buckets[1].feedbackCount).toBe(1);
  });

  it('tracks insufficient-context responses separately from evaluable rates and averages', () => {
    const result = buildSentimentTrend(
      [
        feedback({ date: '2026-08-24T09:00:00', compoundScore: 0.4019 }) as unknown as Record<string, unknown>,
        feedback({ date: '2026-08-24T10:00:00', compoundScore: -0.296 }) as unknown as Record<string, unknown>,
      ].map((item, index) => ({
        ...item,
        sentimentClassification: 'insufficient_context',
        id: `insufficient-${index}`,
      })) as never,
      'weekly',
      new Date('2026-08-26T12:00:00'),
    );

    expect(result.buckets[1]).toMatchObject({
      totalReviews: 2,
      feedbackCount: 0,
      insufficientContextCount: 2,
      insufficientContextRate: 100,
      positiveRate: 0,
      neutralRate: 0,
      negativeRate: 0,
      averageCompoundScore: null,
    });
  });

  it('uses week buckets for months and month buckets for years', () => {
    const monthly = buildSentimentTrend(
      [feedback({ date: '2026-08-29T09:00:00', compoundScore: -0.2 })],
      'monthly',
      new Date('2026-08-26T12:00:00'),
    );
    const yearly = buildSentimentTrend(
      [feedback({ date: '2026-01-05T09:00:00', compoundScore: 0.6 })],
      'yearly',
      new Date('2026-08-26T12:00:00'),
    );

    expect(monthly.buckets).toHaveLength(5);
    expect(monthly.buckets[4].averageCompoundScore).toBe(-0.2);
    expect(yearly.buckets).toHaveLength(12);
    expect(yearly.buckets[0].averageCompoundScore).toBe(0.6);
  });

  it('builds semester buckets from the selected academic year and semester', () => {
    const context: ScheduleContext = {
      academicYear: 'A.Y. 2026-2027',
      semester: '1st Semester',
    };
    const result = buildSentimentTrend(
      [
        feedback({ date: '2026-08-24T09:00:00', compoundScore: 0.6 }),
        feedback({ date: '2027-01-01T00:00:00', compoundScore: -0.6 }),
      ],
      'semester',
      new Date('2026-08-26T12:00:00'),
      context,
    );

    expect(result.configured).toBe(true);
    expect(result.buckets.length).toBeGreaterThan(5);
    const positiveBucket = result.buckets.find((bucket) => bucket.averageCompoundScore === 0.6);
    expect(positiveBucket?.feedbackCount).toBe(1);
    expect(result.buckets.every((bucket) => bucket.averageCompoundScore !== -0.6)).toBe(true);
  });

  it('uses stored feedback dates to create all-time monthly buckets', () => {
    const result = buildSentimentTrend(
      [
        feedback({ date: '2026-01-05T09:00:00', compoundScore: 0.6 }),
        feedback({ date: '2026-03-05T09:00:00', compoundScore: -0.2 }),
      ],
      'all_time',
      new Date('2026-08-26T12:00:00'),
    );

    expect(result.configured).toBe(true);
    expect(result.buckets).toHaveLength(3);
    expect(result.buckets[0].averageCompoundScore).toBe(0.6);
    expect(result.buckets[1].averageCompoundScore).toBeNull();
    expect(result.buckets[2].averageCompoundScore).toBe(-0.2);
  });

  it('applies building, floor, and room scope before trend and room-summary aggregation', () => {
    const rooms = [
      { id: 'room-101', name: 'Room 101', buildingId: 'building-1', floor: '1' },
      { id: 'room-201', name: 'Room 201', buildingId: 'building-1', floor: '2' },
      { id: 'digi-101', name: 'Digi 101', buildingId: 'building-2', floor: '1' },
    ];
    const items = [
      feedback({ date: '2026-08-24T09:00:00', roomId: 'room-101', compoundScore: 0.2 }),
      feedback({ date: '2026-08-24T10:00:00', roomId: 'room-201', compoundScore: 0.8 }),
      feedback({ date: '2026-08-24T11:00:00', roomId: 'digi-101', buildingId: 'building-2', compoundScore: -1 }),
    ];

    const buildingFeedback = scopeFeedback(items, {
      buildingId: 'building-1',
      rooms,
      scope: 'building',
    });
    const floorFeedback = scopeFeedback(items, {
      buildingId: 'building-1',
      floor: '2',
      rooms,
      scope: 'floor',
    });
    const roomFeedback = scopeFeedback(items, {
      buildingId: 'building-1',
      roomId: 'room-101',
      rooms,
      scope: 'room',
    });
    const now = new Date('2026-08-26T12:00:00');

    const buildingTrend = buildSentimentTrend(buildingFeedback, 'weekly', now);
    const floorTrend = buildSentimentTrend(floorFeedback, 'weekly', now);
    const roomTrend = buildSentimentTrend(roomFeedback, 'weekly', now);

    expect(buildingTrend.buckets[1].feedbackCount).toBe(2);
    expect(floorTrend.buckets[1].feedbackCount).toBe(1);
    expect(floorTrend.buckets[1].averageCompoundScore).toBe(0.8);
    expect(roomTrend.buckets[1].feedbackCount).toBe(1);
    expect(roomTrend.buckets[1].averageCompoundScore).toBe(0.2);

    const roomSummaries = summarizeFeedbackSentimentByRoom(rooms, floorFeedback);
    expect(roomSummaries.find((room) => room.roomId === 'room-201')?.total).toBe(1);
    expect(roomSummaries.find((room) => room.roomId === 'room-101')?.total).toBe(0);
    expect(roomSummaries.find((room) => room.roomId === 'digi-101')?.total).toBe(0);
  });
});
