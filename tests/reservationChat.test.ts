import { describe, expect, it } from 'vitest';

import {
  buildReservationChatClarificationMessage,
  canCheckReservationChatAvailability,
  extractStructuredText,
  getMissingReservationChatFields,
  getMissingReservationScheduleFields,
  hasReservationRoomSearchCriteria,
  mapReservationChatDraftToForm,
  mergeReservationChatExtractions,
  reservationChatExtractionSchema,
} from '../lib/ai/reservationChat';

const completeExtraction = reservationChatExtractionSchema.parse({
  assistantMessage: 'I found matching rooms.',
  intent: 'reservation' as const,
  roomQuery: 'Room 205',
  campus: '',
  buildingQuery: '',
  date: '2026-11-02',
  startTime: '14:00',
  endTime: '16:00',
  roomType: '',
  minCapacity: '',
  requiredFeatures: [],
  program: 'BSIT',
  purpose: 'Study group',
  organization: 'Student council',
  isEvent: 'No' as const,
});

describe('reservation chat extraction', () => {
  it('accepts an extracted draft without requiring campus selection', () => {
    const result = reservationChatExtractionSchema.parse(completeExtraction);
    expect(result.campus).toBe('');
    expect(getMissingReservationScheduleFields(result)).toEqual([]);
  });

  it('reports missing room and schedule details for clarification', () => {
    const result = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      roomQuery: '',
      date: '',
      startTime: '',
      endTime: '',
    });
    expect(getMissingReservationScheduleFields(result)).toEqual([
      'room or room type',
      'date',
      'start time',
      'end time',
    ]);
  });

  it('extracts a complete reservation with a separate program and purpose', () => {
    const result = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      roomQuery: 'Room 204',
      date: '2026-11-25',
      startTime: '08:00',
      endTime: '09:00',
      program: 'BSIT',
      purpose: 'Meeting',
      organization: '',
    });

    expect(getMissingReservationChatFields(result)).toEqual([]);
    expect(canCheckReservationChatAvailability(result, true)).toBe(true);
  });

  it('asks only for a missing program/course', () => {
    const extraction = reservationChatExtractionSchema.parse({ ...completeExtraction, program: '' });
    expect(getMissingReservationChatFields(extraction)).toEqual(['program/course']);
    expect(buildReservationChatClarificationMessage(extraction)).toBe(
      'I have your reservation details, but I still need your program/course. What program or course are you in?'
    );
  });

  it('asks only for a missing purpose', () => {
    const extraction = reservationChatExtractionSchema.parse({ ...completeExtraction, purpose: '' });
    expect(getMissingReservationChatFields(extraction)).toEqual(['purpose']);
    expect(buildReservationChatClarificationMessage(extraction)).toBe(
      'I have your reservation details, but I still need the purpose of your reservation. What will you use the room for?'
    );
  });

  it('asks for both program/course and purpose when both are missing', () => {
    const extraction = reservationChatExtractionSchema.parse({ ...completeExtraction, program: '', purpose: '' });
    expect(getMissingReservationChatFields(extraction)).toEqual(['program/course', 'purpose']);
    expect(buildReservationChatClarificationMessage(extraction)).toContain('program/course and the purpose');
    expect(canCheckReservationChatAvailability(extraction, true)).toBe(false);
  });

  it('merges a follow-up answer without losing room, campus, date, or schedule', () => {
    const first = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      campus: 'digi',
      program: '',
      purpose: '',
    });
    const followUp = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      roomQuery: '',
      campus: '',
      date: '',
      startTime: '',
      endTime: '',
      program: 'BSIT',
      purpose: 'Meeting',
      organization: '',
    });

    const merged = mergeReservationChatExtractions(first, followUp);
    expect(merged).toMatchObject({
      roomQuery: 'Room 205',
      campus: 'digi',
      date: '2026-11-02',
      startTime: '14:00',
      endTime: '16:00',
      program: 'BSIT',
      purpose: 'Meeting',
    });
    expect(getMissingReservationChatFields(merged)).toEqual([]);
    expect(canCheckReservationChatAvailability(merged, true)).toBe(true);
  });

  it('applies corrections to previously extracted program and purpose', () => {
    const corrected = mergeReservationChatExtractions(
      reservationChatExtractionSchema.parse(completeExtraction),
      reservationChatExtractionSchema.parse({
        ...completeExtraction,
        roomQuery: '',
        campus: '',
        date: '',
        startTime: '',
        endTime: '',
        program: 'BSBA',
        purpose: 'Group discussion',
      })
    );

    expect(corrected.program).toBe('BSBA');
    expect(corrected.purpose).toBe('Group discussion');
    expect(corrected.roomQuery).toBe('Room 205');
    expect(corrected.date).toBe('2026-11-02');
  });

  it('hands program and purpose to their own form fields without mapping Program to Organization', () => {
    expect(mapReservationChatDraftToForm({ ...completeExtraction, roomId: 'room-204-id' })).toEqual({
      roomId: 'room-204-id',
      reservationDate: '2026-11-02',
      startTime: '14:00',
      endTime: '16:00',
      programDepartmentOrganization: 'BSIT · Student council',
      purpose: 'Study group',
      isEventReservation: false,
    });
  });

  it('does not produce arbitrary room suggestions when the request has no room criteria', () => {
    expect(hasReservationRoomSearchCriteria(reservationChatExtractionSchema.parse({
      ...completeExtraction,
      roomQuery: '',
      campus: '',
      roomType: '',
      minCapacity: '',
    }))).toBe(false);
    expect(hasReservationRoomSearchCriteria(reservationChatExtractionSchema.parse({
      ...completeExtraction,
      roomQuery: '',
      campus: 'digi',
    }))).toBe(true);
  });

  it('reads structured JSON text from a Gemini generateContent response', () => {
    expect(extractStructuredText({ text: '{"intent":"reservation"}' })).toBe('{"intent":"reservation"}');
    expect(extractStructuredText({ text: '' })).toBeNull();
    expect(extractStructuredText({ candidates: [] })).toBeNull();
  });
});
