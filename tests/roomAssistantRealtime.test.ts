import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_ROOM_TYPE_OPTIONS,
  checkAssistantRoomAvailability,
  findAlternativeAssistantRooms,
  findAssistantRoomMatchesForDatePreference,
  getAssistantRoomSelectionTimeslot,
  findAssistantRoomMatches,
  getAssistantFutureWeekdayDates,
  getAssistantBuildingIds,
  getAssistantListenerFailureState,
  suggestAssistantTimeslotsForRoom,
  toAssistantReservationRecords,
  toAssistantRoomRecord,
  type AssistantPreferences,
  validateAssistantTimeslot,
} from '../lib/ai/roomAssistantRealtime';
import {
  getNextContiguousScheduleSelection,
} from '../lib/reservations/dayScheduleSelection';
import {
  formatReservationTimeSlot,
  getReservationTimeSlots,
  isReservationDateSelectable,
} from '../lib/reservations/timeSlots';

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
  it('matches reservation weekday rules by excluding Sunday only', () => {
    expect(isReservationDateSelectable(new Date('2026-06-07T00:00:00'))).toBe(false);
    expect(
      [
        '2026-06-08',
        '2026-06-09',
        '2026-06-10',
        '2026-06-11',
        '2026-06-12',
        '2026-06-13',
      ].every((date) => isReservationDateSelectable(new Date(`${date}T00:00:00`)))
    ).toBe(true);
  });

  it('uses the reservation form one-hour slot boundaries and labels', () => {
    const slots = getReservationTimeSlots({ startMinutes: 7 * 60, endMinutes: 10 * 60 });

    expect(slots).toEqual([
      { endTime: '08:00', startTime: '07:00' },
      { endTime: '09:00', startTime: '08:00' },
      { endTime: '10:00', startTime: '09:00' },
    ]);
    expect(formatReservationTimeSlot(slots[1])).toBe('8:00 AM - 9:00 AM');
  });

  it('selects one chatbot slot and expands only adjacent slots', () => {
    const firstSlot = { endTime: '10:00', startTime: '09:00' };
    const adjacentSlot = { endTime: '11:00', startTime: '10:00' };
    const thirdAdjacentSlot = { endTime: '12:00', startTime: '11:00' };
    const nonContiguousSlot = { endTime: '13:00', startTime: '12:00' };

    const oneSlot = getNextContiguousScheduleSelection([], firstSlot);
    expect(oneSlot.selection).toEqual(firstSlot);

    const twoSlots = getNextContiguousScheduleSelection(oneSlot.selectedSlots, adjacentSlot);
    expect(twoSlots.selection).toEqual({ endTime: '11:00', startTime: '09:00' });

    const threeSlots = getNextContiguousScheduleSelection(
      twoSlots.selectedSlots,
      thirdAdjacentSlot
    );
    expect(threeSlots.selection).toEqual({ endTime: '12:00', startTime: '09:00' });

    const rejectedGap = getNextContiguousScheduleSelection(
      [firstSlot],
      nonContiguousSlot
    );
    expect(rejectedGap.reason).toBe('non-contiguous');
    expect(rejectedGap.selection).toEqual(firstSlot);
    expect(rejectedGap.selectedSlots).toEqual([firstSlot]);
  });

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

  it('passes the selected date and contiguous time range back to the form after room selection', () => {
    const firstSlot = { endTime: '10:00', startTime: '09:00' };
    const secondSlot = { endTime: '11:00', startTime: '10:00' };
    const selectedRange = getNextContiguousScheduleSelection([firstSlot], secondSlot).selection;
    const formState = {
      date: '',
      endTime: '',
      roomId: '',
      startTime: '',
    };
    const chatbotTimeslot = {
      date: '2026-06-12',
      ...selectedRange,
    };

    formState.roomId = 'recommended-room';
    const timeslotToRestore = getAssistantRoomSelectionTimeslot(chatbotTimeslot);
    if (timeslotToRestore) {
      formState.date = timeslotToRestore.date;
      formState.startTime = timeslotToRestore.startTime;
      formState.endTime = timeslotToRestore.endTime;
    }

    expect(formState).toEqual({
      date: '2026-06-12',
      endTime: '11:00',
      roomId: 'recommended-room',
      startTime: '09:00',
    });
  });

  it('restores the latest changed chatbot timeslot after room selection', () => {
    const formState = {
      date: '',
      endTime: '',
      roomId: '',
      startTime: '',
    };
    const initialTimeslot = {
      date: '2026-06-12',
      endTime: '09:00',
      startTime: '08:00',
    };
    const latestTimeslot = {
      date: '2026-06-12',
      endTime: '11:00',
      startTime: '10:00',
    };

    expect(getAssistantRoomSelectionTimeslot(initialTimeslot)).toEqual(initialTimeslot);

    formState.roomId = 'recommended-room';
    formState.date = '';
    formState.startTime = '';
    formState.endTime = '';

    const timeslotToRestore = getAssistantRoomSelectionTimeslot(latestTimeslot);
    if (timeslotToRestore) {
      formState.date = timeslotToRestore.date;
      formState.startTime = timeslotToRestore.startTime;
      formState.endTime = timeslotToRestore.endTime;
    }

    expect(formState).toEqual({
      date: '2026-06-12',
      endTime: '11:00',
      roomId: 'recommended-room',
      startTime: '10:00',
    });
  });

  it('does not restore an incomplete form-selected timeslot', () => {
    expect(getAssistantRoomSelectionTimeslot({ date: '2026-06-12', startTime: '08:00' })).toBeNull();
  });

  it('validates each required chatbot date and time field', () => {
    const now = new Date('2026-06-01T08:00:00');

    expect(validateAssistantTimeslot({}, now)).toBe('missing-date');
    expect(validateAssistantTimeslot({ date: '2026-06-10' }, now)).toBe('missing-start-time');
    expect(validateAssistantTimeslot({ date: '2026-06-10', startTime: '10:00' }, now)).toBe(
      'missing-end-time'
    );
    expect(
      validateAssistantTimeslot(
        { date: '2026-06-10', endTime: '10:00', startTime: '10:00' },
        now
      )
    ).toBe('invalid-time');
    expect(
      validateAssistantTimeslot(
        { date: '2026-06-10', endTime: '09:00', startTime: '10:00' },
        now
      )
    ).toBe('invalid-time');
    expect(
      validateAssistantTimeslot(
        { date: '2026-06-01', endTime: '09:00', startTime: '07:00' },
        now
      )
    ).toBe('past-date');
    expect(
      validateAssistantTimeslot(
        { date: '2026-06-10', endTime: '11:00', startTime: '10:00' },
        now
      )
    ).toBe('valid');
  });

  it('excludes rooms that do not match the requested room type', () => {
    const rooms = [
      toAssistantRoomRecord(createRoom({ id: 'conference-101' })),
      toAssistantRoomRecord(createRoom({ id: 'glass-101', roomType: 'Glass Room' })),
    ];

    const results = findAssistantRoomMatches(rooms, [], {}, {
      preferredType: 'conference-room',
      requiredFeatures: [],
    });

    expect(results.map((room) => room.roomId)).toEqual(['conference-101']);
  });

  it('excludes rooms below the requested minimum capacity', () => {
    const rooms = [
      toAssistantRoomRecord(createRoom({ id: 'small-room', capacity: 8 })),
      toAssistantRoomRecord(createRoom({ id: 'large-room', capacity: 20 })),
    ];

    const results = findAssistantRoomMatches(rooms, [], {}, {
      minCapacity: 12,
      requiredFeatures: [],
    });

    expect(results.map((room) => room.roomId)).toEqual(['large-room']);
  });

  it('resolves a specific future date before matching rooms', () => {
    const room = toAssistantRoomRecord(createRoom({ id: 'future-room' }));
    const result = findAssistantRoomMatchesForDatePreference(
      [room],
      [],
      [],
      {
        date: '2026-06-10',
        endTime: '11:00',
        startTime: '10:00',
      },
      { kind: 'specific-date-time' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('resolved');
    expect(result.resolvedTimeslot).toMatchObject({ date: '2026-06-10' });
    expect(result.recommendations.map((roomResult) => roomResult.roomId)).toEqual(['future-room']);
  });

  it('routes a valid chatbot-selected date and time through recommendations', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom({ id: 'chatbot-selected-room' }))],
      [],
      [],
      {
        date: '2026-06-10',
        endTime: '11:00',
        startTime: '10:00',
      },
      { kind: 'chatbot-date-time' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('resolved');
    expect(result.resolvedTimeslot).toEqual({
      date: '2026-06-10',
      endTime: '11:00',
      startTime: '10:00',
    });
    expect(result.recommendations.map((room) => room.roomId)).toEqual(['chatbot-selected-room']);
  });

  it('keeps Use selected date/time behavior unchanged', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom({ id: 'selected-slot-room' }))],
      [],
      [],
      {
        date: '2026-06-10',
        endTime: '11:00',
        startTime: '10:00',
      },
      { kind: 'selected-date-time' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('resolved');
    expect(result.resolvedTimeslot?.date).toBe('2026-06-10');
    expect(result.recommendations.map((room) => room.roomId)).toEqual(['selected-slot-room']);
  });

  it('rejects a past specific date', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom())],
      [],
      [],
      {
        date: '2026-05-31',
        endTime: '11:00',
        startTime: '10:00',
      },
      { kind: 'specific-date-time' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('past-date');
    expect(result.recommendations).toHaveLength(0);
  });

  it('rejects a past time on the current local date', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom())],
      [],
      [],
      {
        date: '2026-06-05',
        endTime: '11:00',
        startTime: '10:00',
      },
      { kind: 'specific-date-time' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-05T12:00:00') }
    );

    expect(result.status).toBe('past-date');
    expect(result.recommendations).toHaveLength(0);
  });

  it('resolves Friday preferences only to future Fridays', () => {
    const dates = getAssistantFutureWeekdayDates(5, new Date('2026-06-01T08:00:00'));

    expect(dates).toEqual(['2026-06-05', '2026-06-12']);
    expect(dates.every((date) => new Date(`${date}T00:00:00`).getDay() === 5)).toBe(true);
  });

  it('resolves Saturday preferences only to future Saturdays', () => {
    const dates = getAssistantFutureWeekdayDates(6, new Date('2026-06-01T08:00:00'));

    expect(dates).toEqual(['2026-06-06', '2026-06-13']);
    expect(dates.every((date) => new Date(`${date}T00:00:00`).getDay() === 6)).toBe(true);
  });

  it.each([
    [{ dayOfWeek: 5, kind: 'weekday' }, '2026-06-05'],
    [{ dayOfWeek: 6, kind: 'weekday' }, '2026-06-06'],
  ] as const)('resolves a weekday preference with a concrete time', (datePreference, expectedDate) => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom())],
      [],
      [],
      {
        endTime: '11:00',
        startTime: '10:00',
      },
      datePreference,
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('resolved');
    expect(result.resolvedTimeslot?.date).toBe(expectedDate);
  });

  it('requires a concrete time for a weekday preference', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom())],
      [],
      [],
      {},
      { dayOfWeek: 5, kind: 'weekday' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('missing-time');
    expect(result.recommendations).toHaveLength(0);
  });

  it('skips a Friday with an approved reservation conflict', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom({ id: 'weekday-room' }))],
      [toAssistantReservationRecords([createReservation({
        roomId: 'weekday-room',
        date: '2026-06-05',
        startTime: '10:00',
        endTime: '11:00',
      })])[0]],
      [],
      {
        endTime: '11:00',
        startTime: '10:00',
      },
      { dayOfWeek: 5, kind: 'weekday' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('resolved');
    expect(result.resolvedTimeslot?.date).toBe('2026-06-12');
  });

  it('skips a Friday with a class schedule conflict', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom({ id: 'weekday-room' }))],
      [],
      [{
        buildingId: 'gd1',
        dayOfWeek: 5,
        endTime: '11:00',
        roomId: 'weekday-room',
        startTime: '10:00',
      }],
      {
        endTime: '11:00',
        startTime: '10:00',
      },
      { dayOfWeek: 5, kind: 'weekday' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('no-match');
    expect(result.resolvedTimeslot).toBeNull();
  });

  it('applies room requirements after resolving the preferred date', () => {
    const rooms = [
      toAssistantRoomRecord(createRoom({
        id: 'wrong-type',
        roomType: 'Glass Room',
      })),
      toAssistantRoomRecord(createRoom({
        id: 'too-small',
        capacity: 8,
      })),
      toAssistantRoomRecord(createRoom({
        id: 'missing-facility',
        acStatus: 'No Air Conditioning',
      })),
      toAssistantRoomRecord(createRoom({ id: 'matches-all' })),
    ];
    const result = findAssistantRoomMatchesForDatePreference(
      rooms,
      [],
      [],
      {
        endTime: '11:00',
        startTime: '10:00',
      },
      { dayOfWeek: 5, kind: 'weekday' },
      {
        minCapacity: 12,
        preferredType: 'conference-room',
        requiredFeatures: ['AC'],
      },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.recommendations.map((room) => room.roomId)).toEqual(['matches-all']);
  });

  it('returns a concrete selection that can update the existing reservation form', () => {
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom())],
      [],
      [],
      {
        endTime: '11:00',
        startTime: '10:00',
      },
      { dayOfWeek: 5, kind: 'weekday' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );
    const formUpdates: Required<{ date: string; endTime: string; startTime: string }>[] = [];

    if (result.resolvedTimeslot) {
      formUpdates.push(result.resolvedTimeslot);
    }

    expect(formUpdates).toEqual([{
      date: '2026-06-05',
      endTime: '11:00',
      startTime: '10:00',
    }]);
  });

  it('keeps weekday resolution separate from recurring reservation state', () => {
    const recurringState = { isRecurring: false, selectedDays: [] as number[] };
    const result = findAssistantRoomMatchesForDatePreference(
      [toAssistantRoomRecord(createRoom())],
      [],
      [],
      {
        endTime: '11:00',
        startTime: '10:00',
      },
      { dayOfWeek: 6, kind: 'weekday' },
      { requiredFeatures: [] },
      { now: new Date('2026-06-01T08:00:00') }
    );

    expect(result.status).toBe('resolved');
    expect(recurringState).toEqual({ isRecurring: false, selectedDays: [] });
  });

  it('excludes rooms that do not provide every requested facility', () => {
    const rooms = [
      toAssistantRoomRecord(createRoom({ id: 'with-ac', acStatus: 'Working' })),
      toAssistantRoomRecord(createRoom({ id: 'without-ac', acStatus: 'No Air Conditioning' })),
    ];

    const results = findAssistantRoomMatches(rooms, [], {}, {
      requiredFeatures: ['AC'],
    });

    expect(results.map((room) => room.roomId)).toEqual(['with-ac']);
  });

  it('treats class schedules as availability conflicts', () => {
    const room = toAssistantRoomRecord(createRoom({ id: 'conference-101' }));
    const timeslot = {
      date: '2026-06-03',
      endTime: '11:00',
      startTime: '10:00',
    };
    const schedules = [{
      buildingId: 'gd1',
      dayOfWeek: 3,
      endTime: '11:30',
      roomId: 'conference-101',
      startTime: '09:30',
    }];
    const result = checkAssistantRoomAvailability(
      room,
      timeslot,
      [],
      new Date('2026-06-01T08:00:00'),
      schedules
    );

    expect(result.available).toBe(false);
    expect(result.conflictingSchedules).toHaveLength(1);
    expect(findAssistantRoomMatches([room], [], timeslot, {
      requiredFeatures: [],
    }, schedules)).toHaveLength(0);
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
      },
      { now: new Date('2026-06-03T08:00:00') }
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

    expect(results).toHaveLength(1);
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

  it('searches every building for a campus while preserving building scope', () => {
    expect(getAssistantBuildingIds(null, 'main')).toEqual(['gd1', 'gd2', 'gd3']);
    expect(getAssistantBuildingIds('gd2', 'main')).toEqual(['gd2']);
  });

  it('does not infer facilities from missing status values', () => {
    const room = toAssistantRoomRecord(
      createRoom({
        acStatus: '',
        tvProjectorStatus: '',
        whiteboardStatus: undefined,
      })
    );

    expect(room.features).not.toEqual(expect.arrayContaining(['AC', 'Projector', 'Whiteboard']));
    expect(findAssistantRoomMatches([room], [], {}, {
      requiredFeatures: ['AC'],
    })).toHaveLength(0);
  });

  it('keeps unknown room types from satisfying a requested type', () => {
    const room = toAssistantRoomRecord(createRoom({ roomType: 'Unclassified Room' }));

    expect(room.type).toBe('unknown');
    expect(findAssistantRoomMatches([room], [], {}, {
      preferredType: 'class-room',
      requiredFeatures: [],
    })).toHaveLength(0);
  });

  it('does not return past alternative times', () => {
    const room = toAssistantRoomRecord(createRoom({ id: 'conference-101' }));
    const suggestions = suggestAssistantTimeslotsForRoom(
      room,
      [],
      {
        date: '2026-06-03',
        endTime: '14:00',
        startTime: '13:00',
      },
      {
        endMinutes: 21 * 60,
        startMinutes: 7 * 60,
      },
      { now: new Date('2026-06-03T12:00:00') }
    );

    expect(
      suggestions.every(
        (suggestion) =>
          suggestion.date !== '2026-06-03' || (suggestion.startTime ?? '') > '12:00'
      )
    ).toBe(true);
  });

  it('clears loading when an assistant listener fails', () => {
    expect(getAssistantListenerFailureState('reservations')).toEqual({
      error: 'Unable to load live reservations data. Refresh the page and try again.',
      loading: false,
    });
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
