import { describe, expect, it } from 'vitest';
import { buildSentimentTrend } from '../lib/feedback/feedback-trend';

function feedback(input: {
  date: string;
  compoundScore?: number;
  vaderCompoundScore?: number;
}) {
  return {
    id: input.date,
    roomId: 'room-1',
    roomName: 'Room 1',
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

  it('does not invent semester dates when no date range is configured', () => {
    const result = buildSentimentTrend([], 'semester', new Date('2026-08-26T12:00:00'));

    expect(result.configured).toBe(false);
    expect(result.buckets).toEqual([]);
    expect(result.message).toContain('Semester date ranges');
  });
});
