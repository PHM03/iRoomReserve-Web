import { describe, expect, it } from 'vitest';
import {
  compareFeedbackPeriods,
  filterFeedbackByPeriod,
  scopeFeedbackToBuilding,
} from '../lib/feedback/feedback-period';
import { summarizeFeedbackSentimentByGender } from '../lib/feedback/feedback-sentiment';

function feedback(input: {
  buildingId?: string;
  date: string;
  gender?: string;
  compoundScore?: number;
}) {
  return {
    buildingId: input.buildingId ?? 'building-1',
    createdAt: { toDate: () => new Date(input.date) },
    compoundScore: input.compoundScore,
    gender: input.gender,
  };
}

describe('feedback analytics periods', () => {
  const now = new Date('2026-08-26T12:00:00');

  it('preserves all feedback for All Time', () => {
    const result = filterFeedbackByPeriod(
      [feedback({ date: '2024-01-01T00:00:00' }), feedback({ date: '2026-08-26T00:00:00' })],
      'all_time',
      now,
    );

    expect(result.configured).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('filters Weekly to the current Sunday-through-Saturday week', () => {
    const result = filterFeedbackByPeriod(
      [
        feedback({ date: '2026-08-23T00:00:00' }),
        feedback({ date: '2026-08-29T23:59:59' }),
        feedback({ date: '2026-08-30T00:00:00' }),
      ],
      'weekly',
      now,
    );

    expect(result.items).toHaveLength(2);
  });

  it('filters Monthly and Yearly to the current calendar periods', () => {
    const items = [
      feedback({ date: '2026-08-01T00:00:00' }),
      feedback({ date: '2026-07-31T23:59:59' }),
      feedback({ date: '2025-12-31T23:59:59' }),
    ];

    expect(filterFeedbackByPeriod(items, 'monthly', now).items).toHaveLength(1);
    expect(filterFeedbackByPeriod(items, 'yearly', now).items).toHaveLength(2);
  });

  it('does not fabricate semester dates when the project has no date range', () => {
    const result = filterFeedbackByPeriod(
      [feedback({ date: '2026-08-26T00:00:00' })],
      'semester',
      now,
    );

    expect(result.configured).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.message).toContain('Semester date ranges');
  });

  it('returns an empty result for an empty period', () => {
    const result = filterFeedbackByPeriod(
      [feedback({ date: '2025-08-26T00:00:00' })],
      'monthly',
      now,
    );

    expect(result.configured).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('returns the current and previous equivalent periods for comparison', () => {
    const result = compareFeedbackPeriods(
      [
        feedback({ date: '2026-08-24T00:00:00' }),
        feedback({ date: '2026-08-17T00:00:00' }),
        feedback({ date: '2026-08-10T00:00:00' }),
      ],
      'weekly',
      now,
    );

    expect(result.configured).toBe(true);
    expect(result.comparable).toBe(true);
    expect(result.currentItems).toHaveLength(1);
    expect(result.previousItems).toHaveLength(1);
  });

  it('keeps feedback scoped to the selected building', () => {
    const result = scopeFeedbackToBuilding(
      [
        feedback({ buildingId: 'building-1', date: '2026-08-26T00:00:00' }),
        feedback({ buildingId: 'building-2', date: '2026-08-26T00:00:00' }),
      ],
      'building-1',
    );

    expect(result).toHaveLength(1);
    expect(result[0].buildingId).toBe('building-1');
  });

  it('applies the selected period before gender sentiment summarization', () => {
    const result = filterFeedbackByPeriod(
      [
        feedback({ date: '2026-08-26T00:00:00', gender: 'female', compoundScore: 0.8 }),
        feedback({ date: '2025-08-26T00:00:00', gender: 'female', compoundScore: -0.8 }),
      ],
      'yearly',
      now,
    );
    const genderSummary = summarizeFeedbackSentimentByGender(result.items, 1);

    expect(genderSummary).toHaveLength(1);
    expect(genderSummary[0].summary?.averageCompoundScore).toBe(0.8);
  });
});
