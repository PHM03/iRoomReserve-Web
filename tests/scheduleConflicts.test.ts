import { describe, expect, it } from 'vitest';

import {
  findScheduleConflicts,
  schedulesConflict,
  timeRangesOverlap,
} from '../lib/schedules/scheduleConflicts';

const baseSchedule = {
  academicYear: 'A.Y. 2025-2026',
  dayOfWeek: 1,
  endTime: '10:00',
  id: 'schedule-1',
  roomId: 'room-301',
  semester: '1st Semester',
  startTime: '08:00',
};

describe('schedule conflict rules', () => {
  it('detects overlapping schedules in the same room and day', () => {
    expect(
      schedulesConflict(baseSchedule, {
        academicYear: 'A.Y. 2025-2026',
        dayOfWeek: 1,
        endTime: '12:00',
        roomId: 'room-301',
        semester: '1st Semester',
        startTime: '09:00',
      })
    ).toBe(true);
  });

  it('does not flag back-to-back schedules as overlapping', () => {
    expect(
      schedulesConflict(baseSchedule, {
        academicYear: 'A.Y. 2025-2026',
        dayOfWeek: 1,
        endTime: '12:00',
        roomId: 'room-301',
        semester: '1st Semester',
        startTime: '10:00',
      })
    ).toBe(false);
  });

  it('ignores schedules from a different room, day, or schedule context', () => {
    expect(
      findScheduleConflicts(
        [
          baseSchedule,
          { ...baseSchedule, id: 'schedule-2', roomId: 'room-302' },
          { ...baseSchedule, id: 'schedule-3', dayOfWeek: 2 },
          { ...baseSchedule, id: 'schedule-4', semester: '2nd Semester' },
          { ...baseSchedule, id: 'schedule-5', academicYear: 'A.Y. 2026-2027' },
        ],
        {
          academicYear: 'A.Y. 2025-2026',
          dayOfWeek: 1,
          endTime: '11:00',
          roomId: 'room-301',
          semester: '1st Semester',
          startTime: '09:00',
        }
      ).map((schedule) => schedule.id)
    ).toEqual(['schedule-1']);
  });

  it('excludes the schedule currently being edited', () => {
    expect(
      findScheduleConflicts(
        [baseSchedule, { ...baseSchedule, id: 'schedule-2', startTime: '11:00', endTime: '12:00' }],
        {
          academicYear: 'A.Y. 2025-2026',
          dayOfWeek: 1,
          endTime: '10:00',
          roomId: 'room-301',
          semester: '1st Semester',
          startTime: '08:00',
        },
        { excludeScheduleId: 'schedule-1' }
      )
    ).toEqual([]);
  });

  it('treats missing context on the candidate as compatible with loaded schedules', () => {
    expect(
      findScheduleConflicts(
        [baseSchedule],
        {
          dayOfWeek: 1,
          endTime: '11:00',
          roomId: 'room-301',
          startTime: '09:00',
        }
      ).length
    ).toBe(1);
  });

  it('uses the shared time-range overlap rule', () => {
    expect(timeRangesOverlap('08:00', '10:00', '09:00', '11:00')).toBe(true);
    expect(timeRangesOverlap('08:00', '10:00', '10:00', '11:00')).toBe(false);
  });
});
