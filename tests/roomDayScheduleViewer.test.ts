import { describe, expect, it } from 'vitest';
import { sanitizeRoomDayScheduleForViewer } from '../lib/reservations/roomDayScheduleViewer';

describe('room daily schedule viewer projection', () => {
  it('excludes pending reservations and private schedule fields', () => {
    const source = {
      buildingId: 'gd1',
      buildingName: 'GD1 Main Campus',
      campus: 'main' as const,
      date: '2026-11-18',
      intervals: [
        { startTime: '09:00', endTime: '10:00', kind: 'approved' as const },
        { startTime: '10:00', endTime: '11:00', kind: 'pending' as const },
        { startTime: '11:00', endTime: '12:00', kind: 'class-schedule' as const },
        { startTime: '13:00', endTime: '14:00', kind: 'manual-unavailability' as const },
      ],
      roomId: 'gd1-room-205',
      roomName: 'Room 205',
      userId: 'requesting-user-123',
      userName: 'Private Owner Name',
      reservations: [{ email: 'private@example.edu', purpose: 'private purpose' }],
    };

    const result = sanitizeRoomDayScheduleForViewer(source);

    expect(result.intervals).toEqual([
      { startTime: '09:00', endTime: '10:00', status: 'Reserved' },
      { startTime: '11:00', endTime: '12:00', status: 'Class Schedule' },
      {
        startTime: '13:00',
        endTime: '14:00',
        status: 'Unavailable',
        reason: 'Manual room restriction',
      },
    ]);
    expect(Object.keys(result).sort()).toEqual([
      'buildingId', 'buildingName', 'campus', 'date', 'intervals', 'roomId', 'roomName',
    ]);
    expect(JSON.stringify(result)).not.toContain('pending');
    expect(JSON.stringify(result)).not.toContain('Private Owner Name');
    expect(JSON.stringify(result)).not.toContain('private@example.edu');
    expect(JSON.stringify(result)).not.toContain('private purpose');
  });

  it('uses known restriction reasons and a generic unavailable label for an unknown reason', () => {
    const result = sanitizeRoomDayScheduleForViewer({
      buildingId: 'sdca-digital-campus',
      buildingName: 'Digital Campus',
      campus: 'digi',
      date: '2026-11-18',
      intervals: [
        { startTime: '08:00', endTime: '18:00', kind: 'administrative' },
        { startTime: '08:00', endTime: '18:00', kind: 'campus-closed' },
        { startTime: '14:00', endTime: '15:00', kind: 'unclassified' as never },
      ],
      roomId: 'digital-room-1',
      roomName: 'Room 1',
    });

    expect(result.intervals).toEqual([
      {
        startTime: '08:00',
        endTime: '18:00',
        status: 'Unavailable',
        reason: 'Room administratively unavailable',
      },
      {
        startTime: '08:00',
        endTime: '18:00',
        status: 'Unavailable',
        reason: 'Campus closed to reservations',
      },
      { startTime: '14:00', endTime: '15:00', status: 'Unavailable' },
    ]);
  });
});
