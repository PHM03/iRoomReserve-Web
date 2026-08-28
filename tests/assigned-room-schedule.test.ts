import { describe, expect, it } from 'vitest';

import {
  ASSIGNED_ROOM_EMPTY_STATE,
  getAssignedRoomDisplayLabel,
  getAssignedRoomOptions,
} from '../lib/schedules/assignedRoomSchedule';

function room(input: Partial<Parameters<typeof getAssignedRoomDisplayLabel>[0]>) {
  return {
    id: input.id ?? 'room-id',
    name: input.name ?? 'Room',
    floor: input.floor ?? '5',
    roomType: 'Classroom',
    acStatus: 'Working',
    tvProjectorStatus: 'Working',
    capacity: 30,
    status: 'Available' as const,
    buildingId: input.buildingId ?? 'gd3',
    buildingName: input.buildingName ?? 'Main Campus',
    reservedBy: null,
  };
}

describe('assigned-room schedule UI data', () => {
  it('keeps only assigned rooms and sorts multiple campuses deterministically', () => {
    const rooms = [
      room({ id: 'SDCA-201', name: '201', buildingId: 'sdca-digital-campus', buildingName: 'Digi Campus' }),
      room({ id: 'GD3-501', name: '501', buildingId: 'gd3', buildingName: 'Main Campus' }),
      room({ id: 'GD3-999', name: '999', buildingId: 'gd3', buildingName: 'Main Campus' }),
    ];

    expect(getAssignedRoomOptions(rooms, ['GD3-501', 'SDCA-201']).map((item) => item.id)).toEqual([
      'SDCA-201',
      'GD3-501',
    ]);
  });

  it('does not create a fallback room list for empty assignments', () => {
    expect(getAssignedRoomOptions([room({ id: 'GD3-501' })], [])).toEqual([]);
    expect(ASSIGNED_ROOM_EMPTY_STATE).toBe(
      'No rooms have been assigned to your account yet.'
    );
  });

  it('shows room and campus context in the selector label', () => {
    expect(
      getAssignedRoomDisplayLabel(
        room({
          name: '201',
          floor: '2',
          buildingName: 'Digi Campus',
        })
      )
    ).toBe('201 · 2 — Digi Campus');
  });
});
