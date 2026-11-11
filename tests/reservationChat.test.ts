import { describe, expect, it } from 'vitest';

import {
  buildReservationChatClarificationMessage,
  canCheckReservationChatAvailability,
  extractStructuredText,
  getMissingReservationChatFields,
  getMissingReservationScheduleFields,
  hasReservationRoomSearchCriteria,
  isAlternativeRoomRequest,
  isRoomTypeHelpRequest,
  isSimpleAlternativeRoomRequest,
  mapReservationChatDraftToForm,
  mergeReservationChatExtractions,
  reservationChatExtractionRequestSchema,
  reservationChatExtractionSchema,
} from '../lib/ai/reservationChat';

const completeExtraction = reservationChatExtractionSchema.parse({
  assistantMessage: 'I found matching rooms.',
  topicDisposition: 'supported' as const,
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
  it('recognizes room type questions and requests for additional rooms', () => {
    expect(isRoomTypeHelpRequest('Can you tell me what are the types?')).toBe(true);
    expect(isRoomTypeHelpRequest('What types of rooms do you have?')).toBe(true);
    expect(isRoomTypeHelpRequest('I need a room, what are the types? I want it on Nov 25 from 8 AM to 9 AM for BSIT.')).toBe(false);
    expect(isAlternativeRoomRequest('Can you suggest others rooms?')).toBe(true);
    expect(isAlternativeRoomRequest('Can you show me more options?')).toBe(true);
    expect(isSimpleAlternativeRoomRequest('Can you suggest others rooms?')).toBe(true);
    expect(isSimpleAlternativeRoomRequest('Can you suggest other rooms next Friday at 10 AM?')).toBe(false);
    expect(isAlternativeRoomRequest('Can you recommend a classroom?')).toBe(false);
  });

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

  it('preserves short date/time follow-ups and applies explicit schedule corrections', () => {
    const first = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      date: '2026-11-02',
      startTime: '14:00',
      endTime: '16:00',
    });
    const dateOnlyFollowUp = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      date: '2026-11-03',
      roomQuery: '',
      campus: '',
      buildingQuery: '',
      startTime: '',
      endTime: '',
      program: '',
      purpose: '',
      organization: '',
      isEvent: '',
    });
    const dateCorrected = mergeReservationChatExtractions(first, dateOnlyFollowUp);
    expect(dateCorrected).toMatchObject({ date: '2026-11-03', startTime: '14:00', endTime: '16:00' });

    const timeCorrection = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      roomQuery: '',
      campus: '',
      buildingQuery: '',
      date: '',
      startTime: '15:00',
      endTime: '17:00',
      program: '',
      purpose: '',
      organization: '',
      isEvent: '',
    });
    expect(mergeReservationChatExtractions(dateCorrected, timeCorrection)).toMatchObject({
      roomQuery: 'Room 205',
      date: '2026-11-03',
      startTime: '15:00',
      endTime: '17:00',
    });
  });

  it('rejects client-supplied topic classifications and intent fields in extract requests', () => {
    const request = {
      action: 'extract' as const,
      localDate: '2026-11-02',
      timeZone: 'Asia/Shanghai',
      messages: [{ role: 'user' as const, content: 'Who is SpongeBob?' }],
    };
    expect(reservationChatExtractionRequestSchema.safeParse(request).success).toBe(true);
    expect(reservationChatExtractionRequestSchema.safeParse({
      ...request,
      topicDisposition: 'supported',
    }).success).toBe(false);
    expect(reservationChatExtractionRequestSchema.safeParse({
      ...request,
      messages: [{ ...request.messages[0], intent: 'reservation' }],
    }).success).toBe(false);
  });

  it('does not merge stale supported fields into an unrelated or ambiguous turn', () => {
    const previous = reservationChatExtractionSchema.parse(completeExtraction);
    const unrelated = reservationChatExtractionSchema.parse({
      ...completeExtraction,
      topicDisposition: 'unrelated',
      intent: 'other',
      roomQuery: '',
      campus: '',
      buildingQuery: '',
      date: '',
      startTime: '',
      endTime: '',
      roomType: '',
      minCapacity: '',
      requiredFeatures: [],
      program: '',
      purpose: '',
      organization: '',
      isEvent: '',
    });
    expect(mergeReservationChatExtractions(previous, unrelated)).toEqual(unrelated);
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
