import { describe, expect, it } from 'vitest';
import {
  compareFeedbackPeriods,
  filterFeedbackByPeriod,
  scopeFeedbackToBuilding,
} from '../lib/feedback/feedback-period';
import { summarizeFeedbackSentimentByGender } from '../lib/feedback/feedback-sentiment';
import { scopeFeedback } from '../lib/feedback/feedback-scope';
import type { ScheduleContext } from '../lib/schedules/scheduleContext';

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

  it.each([
    {
      semester: '1st Semester' as const,
      included: '2026-08-26T00:00:00',
      excluded: '2027-01-01T00:00:00',
    },
    {
      semester: '2nd Semester' as const,
      included: '2027-01-01T00:00:00',
      excluded: '2027-06-01T00:00:00',
    },
    {
      semester: 'Summer Classes' as const,
      included: '2027-06-01T00:00:00',
      excluded: '2027-08-01T00:00:00',
    },
  ])('filters $semester using the selected academic year', ({ semester, included, excluded }) => {
    const context: ScheduleContext = {
      academicYear: 'A.Y. 2026-2027',
      semester,
    };
    const result = filterFeedbackByPeriod(
      [feedback({ date: included }), feedback({ date: excluded })],
      'semester',
      now,
      context,
    );

    expect(result.configured).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].createdAt.toDate()).toEqual(new Date(included));
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

  it('compares the selected semester with the same semester in the previous academic year', () => {
    const context: ScheduleContext = {
      academicYear: 'A.Y. 2026-2027',
      semester: '1st Semester',
    };
    const result = compareFeedbackPeriods(
      [
        feedback({ date: '2026-08-26T00:00:00' }),
        feedback({ date: '2025-08-26T00:00:00' }),
        feedback({ date: '2027-01-01T00:00:00' }),
      ],
      'semester',
      now,
      context,
    );

    expect(result.configured).toBe(true);
    expect(result.comparable).toBe(true);
    expect(result.currentItems).toHaveLength(1);
    expect(result.previousItems).toHaveLength(1);
  });

  it('keeps the earliest configured academic year non-comparable without a prior year', () => {
    const result = compareFeedbackPeriods(
      [feedback({ date: '2025-08-26T00:00:00' })],
      'semester',
      now,
      { academicYear: 'A.Y. 2025-2026', semester: '1st Semester' },
    );

    expect(result.configured).toBe(true);
    expect(result.comparable).toBe(false);
    expect(result.currentItems).toHaveLength(1);
    expect(result.previousItems).toEqual([]);
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

  it('keeps Main Campus and Digi Campus building feedback isolated', () => {
    const items = [
      feedback({ buildingId: 'gd3', date: '2026-08-26T00:00:00' }),
      feedback({ buildingId: 'sdca-digital-campus', date: '2026-08-26T00:00:00' }),
    ];

    expect(scopeFeedbackToBuilding(items, 'gd3').map((item) => item.buildingId)).toEqual(['gd3']);
    expect(scopeFeedbackToBuilding(items, 'sdca-digital-campus').map((item) => item.buildingId))
      .toEqual(['sdca-digital-campus']);
  });

  it('scopes feedback by floor and room without crossing buildings', () => {
    const rooms = [
      { id: 'room-101', buildingId: 'building-1', floor: '1' },
      { id: 'room-201', buildingId: 'building-1', floor: '2' },
      { id: 'room-999', buildingId: 'building-2', floor: '1' },
    ];
    const items = [
      { buildingId: 'building-1', roomId: 'room-101' },
      { buildingId: 'building-1', roomId: 'room-201' },
      { buildingId: 'building-2', roomId: 'room-999' },
    ];

    expect(scopeFeedback(items, {
      buildingId: 'building-1',
      rooms,
      scope: 'building',
    })).toHaveLength(2);
    expect(scopeFeedback(items, {
      buildingId: 'building-1',
      floor: '2',
      rooms,
      scope: 'floor',
    })).toEqual([{ buildingId: 'building-1', roomId: 'room-201' }]);
    expect(scopeFeedback(items, {
      buildingId: 'building-1',
      floor: '3',
      rooms,
      scope: 'floor',
    })).toEqual([]);
    expect(scopeFeedback(items, {
      buildingId: 'building-1',
      roomId: 'room-999',
      rooms,
      scope: 'room',
    })).toEqual([]);
    expect(scopeFeedback(items, {
      buildingId: 'building-1',
      roomId: 'room-101',
      rooms,
      scope: 'room',
    })).toEqual([{ buildingId: 'building-1', roomId: 'room-101' }]);
  });

  it('combines a room scope with the selected reporting period', () => {
    const roomScoped = scopeFeedback([
      {
        buildingId: 'building-1',
        roomId: 'room-101',
        createdAt: { toDate: () => new Date('2026-08-24T09:00:00') },
      },
      {
        buildingId: 'building-1',
        roomId: 'room-101',
        createdAt: { toDate: () => new Date('2026-07-24T09:00:00') },
      },
    ], {
      buildingId: 'building-1',
      roomId: 'room-101',
      rooms: [{ id: 'room-101', buildingId: 'building-1', floor: '1' }],
      scope: 'room',
    });

    expect(filterFeedbackByPeriod(roomScoped, 'weekly', now).items).toHaveLength(1);
  });

  it('combines semester filtering with building, floor, and room scope', () => {
    const rooms = [
      { id: 'room-101', buildingId: 'building-1', floor: '1' },
      { id: 'room-201', buildingId: 'building-1', floor: '2' },
      { id: 'digi-101', buildingId: 'building-2', floor: '1' },
    ];
    const items = [
      { buildingId: 'building-1', roomId: 'room-101', createdAt: { toDate: () => new Date('2026-08-26') } },
      { buildingId: 'building-1', roomId: 'room-201', createdAt: { toDate: () => new Date('2026-08-26') } },
      { buildingId: 'building-1', roomId: 'room-201', createdAt: { toDate: () => new Date('2027-01-02') } },
      { buildingId: 'building-2', roomId: 'digi-101', createdAt: { toDate: () => new Date('2026-08-26') } },
    ];
    const context: ScheduleContext = {
      academicYear: 'A.Y. 2026-2027',
      semester: '1st Semester',
    };

    const building = scopeFeedback(items, {
      buildingId: 'building-1',
      rooms,
      scope: 'building',
    });
    const floor = scopeFeedback(items, {
      buildingId: 'building-1',
      floor: '2',
      rooms,
      scope: 'floor',
    });
    const room = scopeFeedback(items, {
      buildingId: 'building-1',
      roomId: 'room-201',
      rooms,
      scope: 'room',
    });

    expect(filterFeedbackByPeriod(building, 'semester', now, context).items).toHaveLength(2);
    expect(filterFeedbackByPeriod(floor, 'semester', now, context).items).toHaveLength(1);
    expect(filterFeedbackByPeriod(room, 'semester', now, context).items).toHaveLength(1);
  });

  it('filters semester feedback before gender summarization', () => {
    const context: ScheduleContext = {
      academicYear: 'A.Y. 2026-2027',
      semester: '2nd Semester',
    };
    const semesterFeedback = filterFeedbackByPeriod(
      [
        feedback({ date: '2027-01-02T00:00:00', gender: 'female', compoundScore: 0.8 }),
        feedback({ date: '2026-08-26T00:00:00', gender: 'female', compoundScore: -0.8 }),
      ],
      'semester',
      now,
      context,
    );
    const genderSummary = summarizeFeedbackSentimentByGender(semesterFeedback.items, 1);

    expect(genderSummary).toHaveLength(1);
    expect(genderSummary[0].summary?.averageCompoundScore).toBe(0.8);
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
