export type RoomDayScheduleIntervalKind =
  | 'approved'
  | 'pending'
  | 'class-schedule'
  | 'manual-unavailability'
  | 'administrative'
  | 'campus-closed';

export interface RoomDayScheduleInterval {
  endTime: string;
  kind: RoomDayScheduleIntervalKind;
  startTime: string;
}

export function isValidRoomDayInterval(startTime: unknown, endTime: unknown): boolean {
  if (typeof startTime !== 'string' || typeof endTime !== 'string') return false;
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return false;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return startHour < 24 && startMinute < 60 && endHour < 24 && endMinute < 60 && end > start;
}

export function getRoomDayAvailableIntervals(
  operatingHours: { endTime: string; startTime: string },
  intervals: readonly RoomDayScheduleInterval[],
  restricted = false
) {
  if (restricted || !isValidRoomDayInterval(operatingHours.startTime, operatingHours.endTime)) return [];

  const startMinutes = timeToMinutes(operatingHours.startTime);
  const endMinutes = timeToMinutes(operatingHours.endTime);
  const blocked = intervals
    .filter((interval) => interval.kind !== 'pending')
    .map((interval) => ({
      start: Math.max(startMinutes, timeToMinutes(interval.startTime)),
      end: Math.min(endMinutes, timeToMinutes(interval.endTime)),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ end: number; start: number }> = [];

  blocked.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  });

  const available: Array<{ endTime: string; startTime: string }> = [];
  let cursor = startMinutes;
  merged.forEach((interval) => {
    if (interval.start > cursor) {
      available.push({ startTime: minutesToTime(cursor), endTime: minutesToTime(interval.start) });
    }
    cursor = Math.max(cursor, interval.end);
  });
  if (cursor < endMinutes) {
    available.push({ startTime: minutesToTime(cursor), endTime: minutesToTime(endMinutes) });
  }
  return available;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
