import { describe, expect, it } from 'vitest';
import { getNextScheduleSelection } from '../lib/reservations/dayScheduleSelection';

import {
  findScheduleConflicts,
  isScheduleInActiveContext,
  scheduleConflictsWithReservationSlot,
  schedulesConflict,
  timeRangesOverlap,
} from '../lib/schedules/scheduleConflicts';
import { getScheduleProgramSection } from '../lib/schedules/scheduleLabels';

const baseSchedule = {
  academicYear: 'A.Y. 2025-2026',
  buildingId: 'gd1',
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

describe('reservation availability against class schedules', () => {
  const activeContext = {
    academicYear: 'A.Y. 2025-2026' as const,
    buildingId: 'gd1',
    semester: '1st Semester' as const,
  };

  const reservation = {
    buildingId: 'gd1',
    dayOfWeek: 1,
    endTime: '10:00',
    roomId: 'room-301',
    startTime: '09:00',
  };

  it('keeps a reservation selectable when there is no class schedule', () => {
    expect(
      [baseSchedule].filter((schedule) =>
        scheduleConflictsWithReservationSlot(schedule, {
          ...reservation,
          startTime: '11:00',
          endTime: '12:00',
        })
      )
    ).toEqual([]);
  });

  it.each([
    ['exact overlap', '08:00', '10:00'],
    ['partial overlap at the start', '07:30', '09:00'],
    ['partial overlap at the end', '09:30', '10:30'],
    ['reservation contains class', '07:00', '11:00'],
  ])('%s is blocked', (_label, startTime, endTime) => {
    expect(
      scheduleConflictsWithReservationSlot(baseSchedule, {
        ...reservation,
        startTime,
        endTime,
      })
    ).toBe(true);
  });

  it('allows an adjacent reservation', () => {
    expect(
      scheduleConflictsWithReservationSlot(baseSchedule, {
        ...reservation,
        startTime: '10:00',
        endTime: '11:00',
      })
    ).toBe(false);
  });

  it('allows a different room or building', () => {
    expect(
      scheduleConflictsWithReservationSlot(baseSchedule, {
        ...reservation,
        roomId: 'room-302',
      })
    ).toBe(false);
    expect(
      scheduleConflictsWithReservationSlot(baseSchedule, {
        ...reservation,
        buildingId: 'gd2',
      })
    ).toBe(false);
  });

  it('requires the active academic context and matching day', () => {
    expect(isScheduleInActiveContext(baseSchedule, activeContext)).toBe(true);
    expect(
      isScheduleInActiveContext(
        { ...baseSchedule, semester: '2nd Semester' },
        activeContext
      )
    ).toBe(false);
    expect(
      isScheduleInActiveContext(
        { ...baseSchedule, academicYear: 'A.Y. 2026-2027' },
        activeContext
      )
    ).toBe(false);
    expect(
      scheduleConflictsWithReservationSlot(baseSchedule, {
        ...reservation,
        dayOfWeek: 2,
      })
    ).toBe(false);
  });

  it('shows Program + Section compactly while retaining full course details', () => {
    const schedule = {
      ...baseSchedule,
      courseCode: 'IT 101',
      courseName: 'Web Systems and Technologies',
      section: '3A',
      subjectName: 'Web Systems',
    };

    expect(getScheduleProgramSection({ ...schedule, section: 'BSIT 3A' })).toBe('BSIT 3A');
    expect(schedule.courseName).toBe('Web Systems and Technologies');
  });

  it('treats a class-scheduled slot as blocked by the selection helper', () => {
    const classSlot = {
      endTime: '10:00',
      startTime: '09:00',
      status: 'class-scheduled' as const,
    };

    expect(getNextScheduleSelection([classSlot], null, classSlot)).toEqual({
      selection: null,
    });
  });
});
