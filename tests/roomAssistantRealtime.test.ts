import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_ROOM_TYPE_OPTIONS,
  checkAssistantRoomAvailability,
  findAlternativeAssistantRooms,
  findAssistantRoomMatches,
  suggestAssistantTimeslotsForRoom,
  toAssistantReservationRecords,
  toAssistantRoomRecord,
  type AssistantPreferences,
} from '../lib/ai/roomAssistantRealtime';

function createRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: 'room-1',
    name: 'Room 1',
    floor: '2',
    roomType: 'Conference Room',
    acStatus: 'Working',
    tvProjectorStatus: 'Working',
    whiteboardStatus: 'Working',
    capacity: 12,
    status: 'Available',
    buildingId: 'gd1',
    buildingName: 'GD1 Main Campus',
    reservedBy: null,
    ...overrides,
  } as never;
}

function createReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reservation-1',
    userId: 'user-1',
    userName: 'User One',
    userRole: 'student',
    roomId: 'room-1',
    roomName: 'Room 1',
    buildingId: 'gd1',
    buildingName: 'GD1 Main Campus',
    campus: 'main',
    date: '2026-06-03',
    startTime: '10:00',
    endTime: '11:00',
    purpose: 'Meeting',
    approvalFlow: [],
    currentStep: 0,
    approvals: [],
    status: 'approved',
    adminUid: null,
    ...overrides,
  } as never;
}

describe('roomAssistantRealtime', () => {
  it('exposes the complete room type preference list', () => {
    expect(ASSISTANT_ROOM_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Conference Room',
      'Glass Room',
      'Class Room',
      'Specialized Room',
      'Gymnasium',
      'Open Area',
    ]);
  });

  it('checks a room against live reservation time ranges', () => {
    const selectedRoom = toAssistantRoomRecord(
      createRoom({
        id: 'conference-101',
        name: 'Conference Room 101',
      })
    );
    const reservations = toAssistantReservationRecords([
      createReservation({
        roomId: 'conference-101',
        roomName: 'Conference Room 101',
      }),
    ]);

    const result = checkAssistantRoomAvailability(
      selectedRoom,
      {
        date: '2026-06-03',
        endTime: '10:30',
        startTime: '09:30',
      },
      reservations
    );

    expect(result.available).toBe(false);
    expect(result.availabilityLabel).toBe('taken');
    expect(result.conflictingReservations).toHaveLength(1);
  });

  it('suggests another date or time for the same room when the requested slot is taken', () => {
    const selectedRoom = toAssistantRoomRecord(
      createRoom({
        id: 'conference-101',
        name: 'Conference Room 101',
      })
    );
    const reservations = toAssistantReservationRecords([
      createReservation({
        roomId: 'conference-101',
        roomName: 'Conference Room 101',
      }),
    ]);

    const suggestions = suggestAssistantTimeslotsForRoom(
      selectedRoom,
      reservations,
      {
        date: '2026-06-03',
        endTime: '11:00',
        startTime: '10:00',
      },
      {
        endMinutes: 21 * 60,
        startMinutes: 7 * 60,
      }
    );

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toMatchObject({
      date: '2026-06-03',
      endTime: '10:00',
      startTime: '09:00',
    });
  });

  it('returns matching alternative rooms at the same time', () => {
    const assistantRooms = [
      toAssistantRoomRecord(
        createRoom({
          id: 'conference-101',
          name: 'Conference Room 101',
        })
      ),
      toAssistantRoomRecord(
        createRoom({
          id: 'conference-102',
          name: 'Conference Room 102',
          capacity: 16,
        })
      ),
      toAssistantRoomRecord(
        createRoom({
          id: 'glass-201',
          name: 'Glass Room 201',
          roomType: 'Glass Room',
          capacity: 10,
          whiteboardStatus: 'No Whiteboard',
        })
      ),
    ];
    const reservations = toAssistantReservationRecords([
      createReservation({
        roomId: 'conference-101',
        roomName: 'Conference Room 101',
      }),
    ]);
    const preferences: AssistantPreferences = {
      minCapacity: 12,
      preferredType: 'conference-room',
      requiredFeatures: ['AC', 'Projector'],
    };

    const results = findAlternativeAssistantRooms(
      assistantRooms,
      reservations,
      assistantRooms[0],
      {
        date: '2026-06-03',
        endTime: '11:00',
        startTime: '10:00',
      },
      preferences
    );

    expect(results).toHaveLength(2);
    expect(results[0].roomId).toBe('conference-102');
    expect(results[0].reason).toContain('preferred conference room');
  });

  it('keeps the guided preference flow working even before date and time are chosen', () => {
    const assistantRooms = [
      toAssistantRoomRecord(
        createRoom({
          id: 'conference-101',
          name: 'Conference Room 101',
        })
      ),
      toAssistantRoomRecord(
        createRoom({
          id: 'specialized-301',
          name: 'Specialized Room 301',
          roomType: 'Specialized Room',
          status: 'Occupied',
        })
      ),
    ];
    const preferences: AssistantPreferences = {
      minCapacity: 10,
      preferredType: 'conference-room',
      requiredFeatures: ['Whiteboard'],
    };

    const results = findAssistantRoomMatches(assistantRooms, [], {}, preferences);

    expect(results).toHaveLength(1);
    expect(results[0].roomId).toBe('conference-101');
  });

  it('maps legacy Firestore room field aliases before scoring recommendations', () => {
    const assistantRoom = toAssistantRoomRecord(
      createRoom({
        acStatus: undefined,
        buildingName: undefined,
        capacity: undefined,
        features: undefined,
        name: undefined,
        roomType: undefined,
        room_features: ['Projector'],
        room_name: 'Legacy Room 12',
        room_type: 'Glass Room',
        tv_projector_status: 'Working',
        whiteboard_status: 'Working',
        maxCapacity: 24,
        building_name: 'Legacy Building',
      })
    );

    expect(assistantRoom.label).toBe('Legacy Room 12');
    expect(assistantRoom.building).toBe('Legacy Building');
    expect(assistantRoom.capacity).toBe(24);
    expect(assistantRoom.type).toBe('glass-room');
    expect(assistantRoom.features).toEqual(
      expect.arrayContaining(['Projector', 'Whiteboard'])
    );
  });

  it('maps legacy Firestore reservation field aliases before availability checks', () => {
    const reservations = toAssistantReservationRecords([
      createReservation({
        date: undefined,
        endTime: undefined,
        roomId: undefined,
        roomName: undefined,
        startTime: undefined,
        reservation_date: '2026-06-03',
        end_time: '11:00',
        room_id: 'room-1',
        room_name: 'Legacy Room 12',
        start_time: '10:00',
      }),
    ]);

    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      date: '2026-06-03',
      endTime: '11:00',
      roomId: 'room-1',
      roomName: 'Legacy Room 12',
      startTime: '10:00',
    });
  });
});
