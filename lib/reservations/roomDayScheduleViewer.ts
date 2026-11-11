import type { ReservationCampus } from '@/lib/buildings/campuses';
import type { RoomDayScheduleInterval } from '@/lib/reservations/roomDaySchedule';

export type RoomDayScheduleViewerStatus = 'Reserved' | 'Class Schedule' | 'Unavailable';

export interface RoomDayScheduleViewerInterval {
  endTime: string;
  reason?: string;
  startTime: string;
  status: RoomDayScheduleViewerStatus;
}

export interface RoomDayScheduleViewerResult {
  buildingId: string;
  buildingName: string;
  campus: ReservationCampus;
  date: string;
  intervals: RoomDayScheduleViewerInterval[];
  roomId: string;
  roomName: string;
}

interface RoomDayScheduleViewerInput {
  buildingId: string;
  buildingName: string;
  campus: ReservationCampus;
  date: string;
  intervals: RoomDayScheduleInterval[];
  roomId: string;
  roomName: string;
}

/** Keeps the public schedule limited to occupied/restricted times and safe room context. */
export function sanitizeRoomDayScheduleForViewer(
  schedule: RoomDayScheduleViewerInput
): RoomDayScheduleViewerResult {
  const intervals = schedule.intervals.flatMap((interval): RoomDayScheduleViewerInterval[] => {
    if (interval.kind === 'pending') return [];
    if (interval.kind === 'approved') {
      return [{ startTime: interval.startTime, endTime: interval.endTime, status: 'Reserved' }];
    }
    if (interval.kind === 'class-schedule') {
      return [{ startTime: interval.startTime, endTime: interval.endTime, status: 'Class Schedule' }];
    }
    if (interval.kind === 'manual-unavailability') {
      return [{
        startTime: interval.startTime,
        endTime: interval.endTime,
        status: 'Unavailable',
        reason: 'Manual room restriction',
      }];
    }
    if (interval.kind === 'administrative') {
      return [{
        startTime: interval.startTime,
        endTime: interval.endTime,
        status: 'Unavailable',
        reason: 'Room administratively unavailable',
      }];
    }
    if (interval.kind === 'campus-closed') {
      return [{
        startTime: interval.startTime,
        endTime: interval.endTime,
        status: 'Unavailable',
        reason: 'Campus closed to reservations',
      }];
    }
    return [{ startTime: interval.startTime, endTime: interval.endTime, status: 'Unavailable' }];
  });

  return {
    buildingId: schedule.buildingId,
    buildingName: schedule.buildingName,
    campus: schedule.campus,
    date: schedule.date,
    intervals,
    roomId: schedule.roomId,
    roomName: schedule.roomName,
  };
}
