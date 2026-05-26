export const SCHEDULE_CONFLICT_MESSAGE =
  'This room already has a schedule that overlaps with your selected time. Please choose a different time or room.';

export interface ScheduleConflictComparable {
  academicYear?: string | null;
  dayOfWeek: number;
  endTime: string;
  id?: string;
  roomId: string;
  semester?: string | null;
  startTime: string;
}

export function timeRangesOverlap(
  startTime: string,
  endTime: string,
  rangeStart: string,
  rangeEnd: string
): boolean {
  return startTime < rangeEnd && endTime > rangeStart;
}

function matchesScheduleContext(
  existingSchedule: ScheduleConflictComparable,
  candidateSchedule: ScheduleConflictComparable
): boolean {
  if (
    existingSchedule.semester &&
    candidateSchedule.semester &&
    existingSchedule.semester !== candidateSchedule.semester
  ) {
    return false;
  }

  if (
    existingSchedule.academicYear &&
    candidateSchedule.academicYear &&
    existingSchedule.academicYear !== candidateSchedule.academicYear
  ) {
    return false;
  }

  return true;
}

export function schedulesConflict(
  existingSchedule: ScheduleConflictComparable,
  candidateSchedule: ScheduleConflictComparable,
  options: { excludeScheduleId?: string | null } = {}
): boolean {
  if (
    options.excludeScheduleId &&
    existingSchedule.id === options.excludeScheduleId
  ) {
    return false;
  }

  if (existingSchedule.roomId !== candidateSchedule.roomId) {
    return false;
  }

  if (existingSchedule.dayOfWeek !== candidateSchedule.dayOfWeek) {
    return false;
  }

  if (!matchesScheduleContext(existingSchedule, candidateSchedule)) {
    return false;
  }

  return timeRangesOverlap(
    existingSchedule.startTime,
    existingSchedule.endTime,
    candidateSchedule.startTime,
    candidateSchedule.endTime
  );
}

export function findScheduleConflicts<T extends ScheduleConflictComparable>(
  schedules: readonly T[],
  candidateSchedule: ScheduleConflictComparable,
  options: { excludeScheduleId?: string | null } = {}
): T[] {
  return schedules.filter((schedule) =>
    schedulesConflict(schedule, candidateSchedule, options)
  );
}
