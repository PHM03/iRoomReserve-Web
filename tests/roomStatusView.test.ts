import { describe, expect, it } from 'vitest';

import type { Building } from '../lib/buildings';
import {
  buildCampusOptions,
  compareFloors,
  groupRoomStatusesByFloor,
  type RoomStatusViewItem,
} from '../lib/roomStatusView';

function makeBuilding(overrides: Partial<Building>): Building {
  return {
    id: 'building-id',
    name: 'Building Name',
    code: 'BLDG',
    address: 'Address',
    floors: 5,
    campus: 'main',
    assignedAdminUid: null,
    ...overrides,
  };
}

describe('roomStatusView', () => {
  it('groups buildings by campus and keeps GD buildings in order', () => {
    const options = buildCampusOptions([
      makeBuilding({
        id: 'digital-campus',
        name: 'Innovation Hub',
        code: 'DIGI',
        campus: 'digi',
      }),
      makeBuilding({
        id: 'gd3',
        name: 'General Directorate 3',
        code: 'GD3',
      }),
      makeBuilding({
        id: 'gd1',
        name: 'General Directorate 1',
        code: 'GD1',
      }),
      makeBuilding({
        id: 'gd2',
        name: 'General Directorate 2',
        code: 'GD2',
      }),
    ]);

    expect(options.map((option) => option.id)).toEqual(['main', 'digi']);
    expect(options[0].buildings.map((building) => building.label)).toEqual([
      'GD1',
      'GD2',
      'GD3',
    ]);
    expect(options[0].buildings[0].description).toBe('Basement to 8th floor');
    expect(options[0].buildings[1].description).toBe('1st to 10th floor');
  });

  it('sorts floors in natural campus order', () => {
    const floors = [
      '10th Floor',
      '2nd Floor',
      'Ground Floor',
      'Basement',
      '1st Floor',
      'Lobby',
    ];

    expect([...floors].sort(compareFloors)).toEqual([
      'Basement',
      'Ground Floor',
      '1st Floor',
      '2nd Floor',
      '10th Floor',
      'Lobby',
    ]);
  });

  it('groups room statuses by floor in sorted order', () => {
    const roomItems: RoomStatusViewItem[] = [
      {
        room: {
          id: 'room-2',
          name: '203',
          floor: '2nd Floor',
          roomType: 'Classroom',
          acStatus: 'Working',
          tvProjectorStatus: 'Working',
          capacity: 35,
          status: 'Available',
          buildingId: 'gd1',
          buildingName: 'GD1',
          reservedBy: null,
        },
        resolved: {
          status: 'Available',
          reservation: null,
          detail: 'Ready for reservation',
        },
      },
      {
        room: {
          id: 'room-1',
          name: '102',
          floor: '1st Floor',
          roomType: 'Laboratory',
          acStatus: 'Working',
          tvProjectorStatus: 'Working',
          capacity: 40,
          status: 'Reserved',
          buildingId: 'gd1',
          buildingName: 'GD1',
          reservedBy: null,
        },
        resolved: {
          status: 'Reserved',
          reservation: null,
          detail: 'Reserved',
        },
      },
    ];

    const groups = groupRoomStatusesByFloor(roomItems);

    expect(groups.map((group) => group.label)).toEqual(['1st Floor', '2nd Floor']);
    expect(groups[0].rooms[0].room.name).toBe('102');
    expect(groups[1].rooms[0].room.name).toBe('203');
  });
});
