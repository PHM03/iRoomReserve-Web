import { describe, expect, it } from 'vitest';

import {
  getRoomDayAvailableIntervals,
  isValidRoomDayInterval,
  type RoomDayScheduleInterval,
} from '../lib/reservations/roomDaySchedule';

describe('room day schedule intervals', () => {
  const operatingHours = { startTime: '07:00', endTime: '11:00' };

  it('keeps pending requests informational and does not subtract them from available periods', () => {
    const intervals: RoomDayScheduleInterval[] = [
      { startTime: '08:00', endTime: '09:00', kind: 'pending' },
    ];

    expect(getRoomDayAvailableIntervals(operatingHours, intervals)).toEqual([
      { startTime: '07:00', endTime: '11:00' },
    ]);
  });

  it('subtracts approved reservations and combines overlapping or adjacent blockers', () => {
    const intervals: RoomDayScheduleInterval[] = [
      { startTime: '08:00', endTime: '09:30', kind: 'approved' },
      { startTime: '09:00', endTime: '10:00', kind: 'class-schedule' },
      { startTime: '10:00', endTime: '10:30', kind: 'manual-unavailability' },
    ];

    expect(getRoomDayAvailableIntervals(operatingHours, intervals)).toEqual([
      { startTime: '07:00', endTime: '08:00' },
      { startTime: '10:30', endTime: '11:00' },
    ]);
  });

  it('clips blocks to operating hours and returns no available period when restricted', () => {
    const intervals: RoomDayScheduleInterval[] = [
      { startTime: '06:00', endTime: '08:00', kind: 'approved' },
      { startTime: '10:00', endTime: '12:00', kind: 'campus-closed' },
    ];

    expect(getRoomDayAvailableIntervals(operatingHours, intervals)).toEqual([
      { startTime: '08:00', endTime: '10:00' },
    ]);
    expect(getRoomDayAvailableIntervals(operatingHours, intervals, true)).toEqual([]);
  });

  it('rejects malformed or reversed source intervals', () => {
    expect(isValidRoomDayInterval('09:00', '10:00')).toBe(true);
    expect(isValidRoomDayInterval('9:00', '10:00')).toBe(false);
    expect(isValidRoomDayInterval('09:60', '10:00')).toBe(false);
    expect(isValidRoomDayInterval('10:00', '09:00')).toBe(false);
  });
});
