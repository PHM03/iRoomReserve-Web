import { z } from 'zod';

export const reservationChatExtractionSchema = z.object({
  assistantMessage: z.string().trim().min(1).max(600),
  intent: z.enum(['reservation', 'other', 'unclear']),
  roomQuery: z.string().trim().max(160),
  campus: z.enum(['', 'main', 'digi']),
  buildingQuery: z.string().trim().max(120),
  date: z.string().trim().max(10),
  startTime: z.string().trim().max(5),
  endTime: z.string().trim().max(5),
  roomType: z.enum([
    '',
    'conference-room',
    'glass-room',
    'class-room',
    'specialized-room',
    'gymnasium',
    'open-area',
  ]),
  minCapacity: z.string().trim().max(4),
  requiredFeatures: z.array(z.string().trim().min(1).max(60)).max(12),
  program: z.string().trim().max(100),
  purpose: z.string().trim().max(100),
  organization: z.string().trim().max(160),
  isEvent: z.enum(['', 'Yes', 'No']),
});

export type ReservationChatExtraction = z.infer<typeof reservationChatExtractionSchema>;

export function hasReservationRoomSearchCriteria(extraction: ReservationChatExtraction) {
  return Boolean(
    extraction.roomQuery ||
      extraction.campus ||
      extraction.buildingQuery ||
      extraction.roomType ||
      extraction.minCapacity ||
      extraction.requiredFeatures.length
  );
}

export const RESERVATION_CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    assistantMessage: { type: 'string' },
    intent: { type: 'string', enum: ['reservation', 'other', 'unclear'] },
    roomQuery: { type: 'string' },
    campus: { type: 'string', enum: ['', 'main', 'digi'] },
    buildingQuery: { type: 'string' },
    date: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    roomType: {
      type: 'string',
      enum: ['', 'conference-room', 'glass-room', 'class-room', 'specialized-room', 'gymnasium', 'open-area'],
    },
    minCapacity: { type: 'string' },
    requiredFeatures: { type: 'array', items: { type: 'string' } },
    program: { type: 'string' },
    purpose: { type: 'string' },
    organization: { type: 'string' },
    isEvent: { type: 'string', enum: ['', 'Yes', 'No'] },
  },
  required: [
    'assistantMessage',
    'intent',
    'roomQuery',
    'campus',
    'buildingQuery',
    'date',
    'startTime',
    'endTime',
    'roomType',
    'minCapacity',
    'requiredFeatures',
    'program',
    'purpose',
    'organization',
    'isEvent',
  ],
} as const;

export interface ReservationChatTurn {
  content: string;
  role: 'assistant' | 'user';
}

export function getMissingReservationScheduleFields(extraction: ReservationChatExtraction) {
  return [
    ...(!extraction.roomQuery && !extraction.roomType ? ['room or room type'] : []),
    ...(!/^\d{4}-\d{2}-\d{2}$/.test(extraction.date) ? ['date'] : []),
    ...(!/^\d{2}:\d{2}$/.test(extraction.startTime) ? ['start time'] : []),
    ...(!/^\d{2}:\d{2}$/.test(extraction.endTime) ? ['end time'] : []),
  ];
}

export function mergeReservationChatExtractions(
  previous: ReservationChatExtraction | null,
  current: ReservationChatExtraction
): ReservationChatExtraction {
  if (!previous) return current;

  return {
    ...previous,
    ...current,
    assistantMessage: current.assistantMessage || previous.assistantMessage,
    intent: current.intent === 'unclear' ? previous.intent : current.intent,
    roomQuery: current.roomQuery || previous.roomQuery,
    campus: current.campus || previous.campus,
    buildingQuery: current.buildingQuery || previous.buildingQuery,
    date: current.date || previous.date,
    startTime: current.startTime || previous.startTime,
    endTime: current.endTime || previous.endTime,
    roomType: current.roomType || previous.roomType,
    minCapacity: current.minCapacity || previous.minCapacity,
    requiredFeatures: current.requiredFeatures.length
      ? current.requiredFeatures
      : previous.requiredFeatures,
    program: current.program || previous.program,
    purpose: current.purpose || previous.purpose,
    organization: current.organization || previous.organization,
    isEvent: current.isEvent || previous.isEvent,
  };
}

export function getMissingReservationChatFields(extraction: ReservationChatExtraction) {
  return [
    ...getMissingReservationScheduleFields(extraction),
    ...(!extraction.program.trim() ? ['program/course'] : []),
    ...(!extraction.purpose.trim() ? ['purpose'] : []),
  ];
}

export function canCheckReservationChatAvailability(
  extraction: ReservationChatExtraction,
  hasSelectedRoom: boolean
) {
  return hasSelectedRoom && getMissingReservationChatFields(extraction).every(
    (field) => field === 'room or room type'
  );
}

export function buildReservationChatClarificationMessage(extraction: ReservationChatExtraction) {
  const missing = getMissingReservationChatFields(extraction);
  const isMissingProgram = missing.includes('program/course');
  const isMissingPurpose = missing.includes('purpose');

  if (isMissingProgram && isMissingPurpose && missing.length === 2) {
    return 'I still need two details: your program/course and the purpose of your reservation. Could you provide those details?';
  }
  if (isMissingProgram && missing.length === 1) {
    return 'I have your reservation details, but I still need your program/course. What program or course are you in?';
  }
  if (isMissingPurpose && missing.length === 1) {
    return 'I have your reservation details, but I still need the purpose of your reservation. What will you use the room for?';
  }

  return missing.length
    ? `I still need ${missing.join(', ')}. Could you provide those details?`
    : 'Your reservation details are complete. Select Preview availability to check the room and schedule.';
}

export function mapReservationChatDraftToForm(
  draft: ReservationChatExtraction & { roomId: string }
) {
  return {
    roomId: draft.roomId,
    reservationDate: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    programDepartmentOrganization: [draft.program, draft.organization]
      .map((value) => value.trim())
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join(' · '),
    purpose: draft.purpose,
    isEventReservation: draft.isEvent === 'Yes',
  };
}

export function extractStructuredText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('text' in payload)) {
    return null;
  }

  const text = (payload as { text?: unknown }).text;
  return typeof text === 'string' && text.trim() ? text : null;
}
