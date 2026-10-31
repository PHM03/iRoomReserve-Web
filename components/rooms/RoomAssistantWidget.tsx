'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import {
  buildReservationChatClarificationMessage,
  canCheckReservationChatAvailability,
  hasReservationRoomSearchCriteria,
  getMissingReservationChatFields,
  getMissingReservationScheduleFields,
  mergeReservationChatExtractions,
  type ReservationChatExtraction,
  type ReservationChatTurn,
} from '@/lib/ai/reservationChat';
import {
  getQuickReservationFollowUpRequirements,
  getQuickReservationMissingDetails,
  isQuickReservationStartInPast,
  type QuickReservationDraft,
  isQuickReservationTimeRangeValid,
  type QuickReservationTimeRanges,
} from '@/lib/ai/quickReservation';

import {
  getNextContiguousScheduleSelection,
} from '@/lib/reservations/dayScheduleSelection';
import RoomAvailabilityPicker from '@/components/rooms/RoomAvailabilityPicker';
import {
  ASSISTANT_FEATURE_OPTIONS,
  ASSISTANT_ROOM_TYPE_OPTIONS,
  checkAssistantRoomAvailability,
  findAlternativeAssistantRooms,
  findAssistantRoomAutocompleteMatches,
  findAssistantRoomMatchesForDatePreference,
  formatAssistantTimeslot,
  getAssistantRoomTypeLabel,
  getAssistantRoomSelectionTimeslot,
  getFallbackPreferencesFromRoom,
  isAssistantTimeslotInPast,
  isCompleteTimeslot,
  suggestAssistantTimeslotsForRoom,
  type AssistantScheduleRecord,
  type AssistantAvailabilityResult,
  type AssistantDatePreference,
  type AssistantPreferences,
  type AssistantRecommendation,
  type AssistantRoomRecord,
  type AssistantTimeslot,
  type AssistantTimeslotSuggestion,
  type AssistantRoomTypeValue,
  validateAssistantTimeslot,
} from '@/lib/ai/roomAssistantRealtime';
import { getCampusName } from '@/lib/buildings/campusAssignments';
import { inferCampusFromBuilding } from '@/lib/buildings/campuses';
import type { ReservationCampus } from '@/lib/buildings/campuses';
import { isRoomAdministrativelyUnavailable } from '@/lib/rooms/roomStatus';
import { getRoomFeedbackSummaries } from '@/lib/feedback/feedback';
import type { RoomFeedbackSummary } from '@/lib/feedback/feedback-summaries';
import {
  formatReservationTimeSlot,
  getReservationTimeSlots,
  type ReservationTimeSlot,
} from '@/lib/reservations/timeSlots';

type AssistantOptionValue =
  | number
  | string
  | AssistantTimeslotSuggestion;

type AssistantOption = {
  label: string;
  value: AssistantOptionValue;
};

type AssistantRecommendationCard = AssistantRecommendation & {
  feedbackSummary?: RoomFeedbackSummary;
};

type AssistantMessage = {
  allowMultiple?: boolean;
  id: string;
  options?: AssistantOption[];
  recommendations?: AssistantRecommendationCard[];
  role: 'system' | 'user';
  text: string;
  type: 'buttons' | 'date-time-picker' | 'feature-picker' | 'recommendations' | 'text';
};

type AssistantStep =
  | 'campus'
  | 'capacity'
  | 'date'
  | 'date-time'
  | 'entry'
  | 'features'
  | 'results'
  | 'reservation-chat'
  | 'quick-reservation'
  | 'timeslot-suggestions'
  | 'type'
  | 'unavailable-actions';

interface RoomAssistantWidgetProps {
  activeCampus?: ReservationCampus | null;
  campusTimeRange?: { endMinutes: number; startMinutes: number } | null;
  dataLoading?: boolean;
  dataError?: string | null;
  onOpenWithoutCampus: () => void;
  onSelectCampus: (campus: ReservationCampus) => void;
  onSelectRoom: (roomId: string, preserveDateTime?: boolean) => void;
  onChatReservationHandoff: (draft: ReservationChatExtraction & { roomId: string }) => void;
  onQuickReservationHandoff: (draft: QuickReservationDraft) => void;
  quickRequiresConceptPaper: boolean;
  quickRequiresMainCampusApproval: boolean;
  quickTimeRanges: QuickReservationTimeRanges;
  existingReservationDraft: { isEvent: boolean; organization: string; program: string; purpose: string };
  onSelectTimeslot: (timeslot: Required<AssistantTimeslot>) => void;
  reservations: ReadonlyArray<{
    date: string;
    endTime: string;
    id: string;
    roomId: string;
    roomName: string;
    startTime: string;
    status: 'pending' | 'approved' | 'expired' | 'rejected' | 'completed' | 'cancelled';
  }>;
  schedules: ReadonlyArray<AssistantScheduleRecord>;
  autocompleteRooms: AssistantRoomRecord[];
  rooms: AssistantRoomRecord[];
  selectedRoom?: AssistantRoomRecord | null;
  timeslot: AssistantTimeslot;
}

const BOT_REPLY_DELAY_MS = 620;
const BOT_REPLY_GAP_MS = 760;
const DEFAULT_CAPACITY_CHOICES = [8, 12, 20, 40, 60];

const CAMPUS_OPTIONS: AssistantOption[] = [
  {
    label: 'SDCA Main Campus',
    value: 'main'
  },
  {
    label: 'SDCA Digital Campus',
    value: 'digi'
  },
];

const ENTRY_OPTIONS: AssistantOption[] = [
  { label: 'Reserve with chat', value: 'reservation-chat' },
  {
    label: 'Check availability',
    value: 'check-selected-room'
  },
  {
    label: 'Help me choose',
    value: 'help-me-choose'
  },
];

const DATE_PREFERENCE_OPTIONS: AssistantOption[] = [
  {
    label: 'Use selected date/time',
    value: 'use-selected-date-time'
  },
  {
    label: 'Specific date/time in form',
    value: 'specific-date-time'
  },
  {
    label: 'Choose date & time',
    value: 'choose-date-time'
  },
  {
    label: 'Any Friday',
    value: 'any-friday'
  },
  {
    label: 'Any Saturday',
    value: 'any-saturday'
  },
];

const ASSISTANT_WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const UNAVAILABLE_OPTIONS: AssistantOption[] = [
  {
    label: 'Try another day/time',
    value: 'try-another-day-time'
  },
  {
    label: 'See alternative rooms',
    value: 'see-alternative-rooms'
  },
];

let messageCounter = 0;

function createMessageId() {
  messageCounter += 1;
  return `room-assistant-widget-${messageCounter}`;
}

function createMessage(
  text: string,
  role: 'system' | 'user',
  type: AssistantMessage['type'],
  extra: Partial<AssistantMessage> = {}
): AssistantMessage {
  return {
    id: createMessageId(),
    role,
    text,
    type,
    ...extra,
  };
}

function getRoomDisplayName(room?: Pick<AssistantRoomRecord, 'label' | 'roomId'> | null) {
  if (!room) {
    return 'this room';
  }

  return room.label || room.roomId;
}

function normalizeFeatures(features: string[]) {
  return [
    ...new Set(
      features
        .filter((feature) => typeof feature === 'string' && feature.trim().length > 0)
        .map((feature) => feature.trim())
    ),
  ];
}

function hasStoredPreferences(preferences: AssistantPreferences) {
  return Boolean(
    preferences.preferredType ||
      preferences.minCapacity ||
      preferences.requiredFeatures.length > 0 ||
      preferences.preferredBuilding
  );
}

function formatFeatureSummary(features: string[]) {
  if (features.length === 0) {
    return 'No special features';
  }

  if (features.length === 1) {
    return features[0];
  }

  if (features.length === 2) {
    return `${features[0]} and ${features[1]}`;
  }

  return `${features.slice(0, -1).join(', ')}, and ${features[features.length - 1]}`;
}

function buildCapacityOptions(rooms: AssistantRoomRecord[]): AssistantOption[] {
  const capacities = [
    ...new Set(
      rooms
        .map((room) => room.capacity)
        .filter((capacity) => typeof capacity === 'number' && Number.isFinite(capacity))
    ),
  ]
    .sort((left, right) => left - right)
    .slice(0, 6);

  return [
    ...(capacities.length > 0 ? capacities : DEFAULT_CAPACITY_CHOICES).map((capacity) => ({
      label: `${capacity} people`,
      value: capacity,
    })),
    {
      label: 'Any size',
      value: ''
    },
  ];
}

function buildFeatureOptions(rooms: AssistantRoomRecord[]): AssistantOption[] {
  const features = [
    ...new Set([
      ...ASSISTANT_FEATURE_OPTIONS,
      ...rooms.flatMap((room) => normalizeFeatures(room.features)),
    ]),
  ].sort((left, right) => left.localeCompare(right));

  return features.map((feature) => ({
    label: feature,
    value: feature,
  }));
}

function isInteractiveMessage(message: AssistantMessage) {
  return (
    message.type === 'buttons' ||
    message.type === 'date-time-picker' ||
    message.type === 'feature-picker' ||
    message.type === 'recommendations'
  );
}

function getLastInteractiveMessageId(messages: AssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isInteractiveMessage(messages[index])) {
      return messages[index].id;
    }
  }

  return null;
}

function isCampusOptionValue(value: AssistantOptionValue): value is ReservationCampus {
  return value === 'main' || value === 'digi';
}

function createCampusPromptMessage() {
  return createMessage(
    'Which campus are you looking for? SDCA Main Campus or SDCA Digital Campus?',
    'system',
    'buttons',
    { options: CAMPUS_OPTIONS }
  );
}

function createEntryPromptMessage(
  selectedRoom: AssistantRoomRecord | null,
  timeslot: AssistantTimeslot
) {
  if (selectedRoom) {
    return createMessage(
      isCompleteTimeslot(timeslot)
        ? `What date and time are you planning to use ${getRoomDisplayName(
            selectedRoom
          )}? I can check the date and time currently selected in the form.`
        : `What date and time are you planning to use ${getRoomDisplayName(
            selectedRoom
          )}? Select the date, start time, and end time in the reservation form, then ask me to check it.`,
      'system',
      'buttons',
      { options: ENTRY_OPTIONS }
    );
  }

  return createMessage(
    'Hi! I can help you choose a room, or check a room you already picked once you are ready.',
    'system',
    'buttons',
    { options: ENTRY_OPTIONS }
  );
}

function createDatePreferencePromptMessage(timeslot: AssistantTimeslot, notice?: string) {
  const currentSelection = isCompleteTimeslot(timeslot)
    ? `The form currently has ${formatAssistantTimeslot(timeslot as Required<AssistantTimeslot>)}.`
    : 'Set a date, start time, and end time in the reservation form before checking availability.';

  return createMessage(
    `${notice ? `${notice} ` : ''}${currentSelection} When should I search?`,
    'system',
    'buttons',
    { options: DATE_PREFERENCE_OPTIONS }
  );
}

function createDateTimePickerMessage() {
  return createMessage(
    'Choose the date and time to search. I will also update the reservation form for you.',
    'system',
    'date-time-picker'
  );
}

function createTypePromptMessage() {
  return createMessage(
    'Sure. What kind of room are you looking for?',
    'system',
    'buttons',
    {
      options: [
        ...ASSISTANT_ROOM_TYPE_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value,
        })),
        {
          label: 'No preference',
          value: ''
        },
      ],
    }
  );
}

function createCapacityPromptMessage(selectedType?: AssistantRoomTypeValue) {
  if (!selectedType) {
    return createMessage(
      'Got it, no specific room type. How many people should it fit?',
      'system',
      'buttons'
    );
  }

  return createMessage(
    `Got it, a ${getAssistantRoomTypeLabel(selectedType).toLowerCase()}. How many people should it fit?`,
    'system',
    'buttons'
  );
}

function createCapacityAcknowledgementMessage(minCapacity?: number) {
  if (typeof minCapacity === 'number' && Number.isFinite(minCapacity)) {
    return createMessage(`Nice, around ${minCapacity} people.`, 'system', 'text');
  }

  return createMessage('Nice, keeping the group size flexible.', 'system', 'text');
}

function createFeaturePromptMessage(options: AssistantOption[]) {
  return createMessage('Any features I should prioritize?', 'system', 'feature-picker', {
    allowMultiple: true,
    options: [
      ...options,
      {
        label: 'Done',
        value: '__done__'
      },
    ],
  });
}

function createSearchMessage() {
  return createMessage('Checking live room data for you...', 'system', 'text');
}

function createRecommendationMessage(
  recommendations: AssistantRecommendationCard[],
  introText: string,
  emptyText: string
) {
  if (recommendations.length === 0) {
    return createMessage(emptyText, 'system', 'text');
  }

  return createMessage(introText, 'system', 'recommendations', { recommendations });
}

function formatFeedbackSummary(summary: RoomFeedbackSummary) {
  if (summary.reviewCount === 0) {
    return ['No feedback yet.'];
  }

  const reviewLabel = `${summary.reviewCount} ${summary.reviewCount === 1 ? 'review' : 'reviews'}`;
  const lines = [
    `Based on ${reviewLabel}${summary.reviewCount < 5 ? ' · Limited feedback' : ''}.`,
  ];

  if (typeof summary.averageRating === 'number') {
    lines.push(`Average rating: ${summary.averageRating.toFixed(1)}/5`);
  }

  if (typeof summary.averageVaderScore === 'number') {
    lines.push(`Average sentiment score: ${summary.averageVaderScore.toFixed(2)}`);
  }

  if (summary.positiveRate > 0 || summary.negativeRate > 0) {
    lines.push(
      `Sentiment: ${summary.positiveRate.toFixed(1)}% positive, ${summary.negativeRate.toFixed(
        1
      )}% negative`
    );
  }

  if (summary.topPositiveAspects.length > 0) {
    lines.push(`Often praised: ${summary.topPositiveAspects.join(', ')}`);
  }

  if (summary.topNegativeAspects.length > 0) {
    lines.push(`Common concerns: ${summary.topNegativeAspects.join(', ')}`);
  }

  return lines;
}

async function attachFeedbackSummaries(
  recommendations: AssistantRecommendation[],
): Promise<AssistantRecommendationCard[]> {
  if (recommendations.length === 0) {
    return [];
  }

  let feedbackByRoomId: Readonly<Record<string, RoomFeedbackSummary>> = {};
  try {
    feedbackByRoomId = await getRoomFeedbackSummaries(
      recommendations.map((recommendation) => recommendation.roomId),
    );
  } catch (error) {
    console.warn('Room feedback summaries could not be loaded:', error);
  }

  return recommendations.map((recommendation) => ({
    ...recommendation,
    feedbackSummary: feedbackByRoomId[recommendation.roomId],
  }));
}

function createUnavailableOptionsMessage() {
  return createMessage(
    'You can try another day and time for this room, or I can show other rooms available at the same time.',
    'system',
    'buttons',
    { options: UNAVAILABLE_OPTIONS }
  );
}

function createTimeslotSuggestionMessage(suggestions: AssistantTimeslotSuggestion[]) {
  if (suggestions.length === 0) {
    return createMessage(
      'I could not find another open slot for that room in the next two weeks. Try a different room or time.',
      'system',
      'text'
    );
  }

  return createMessage(
    'Here are the next available date and time options I found for that same room:',
    'system',
    'buttons',
    {
      options: suggestions.map((suggestion) => ({
        label: suggestion.label,
        value: suggestion,
      })),
    }
  );
}

function createEntryFollowUpMessage(selectedRoom: AssistantRoomRecord | null) {
  return createMessage(
    selectedRoom
      ? `I updated the form. Want me to check ${getRoomDisplayName(selectedRoom)} now?`
      : 'I updated the form. Want me to check that room now?',
    'system',
    'buttons',
    { options: ENTRY_OPTIONS }
  );
}

function buildAvailabilityMessage(
  selectedRoom: AssistantRoomRecord,
  availability: AssistantAvailabilityResult,
  timeslot: Required<AssistantTimeslot>
) {
  if (availability.available) {
    return `Room ${getRoomDisplayName(selectedRoom)} is free at ${formatAssistantTimeslot(
      timeslot
    )}! Would you like to reserve it?`;
  }

  const [firstConflict] = availability.conflictingReservations;

  if (firstConflict) {
    return `Room ${getRoomDisplayName(selectedRoom)} is already reserved on ${formatAssistantTimeslot(
      {
        date: firstConflict.date,
        endTime: firstConflict.endTime,
        startTime: firstConflict.startTime,
      }
    )}.`;
  }

  const [firstSchedule] = availability.conflictingSchedules;

  if (firstSchedule) {
    return `Room ${getRoomDisplayName(
      selectedRoom
    )} has a class schedule during ${formatAssistantTimeslot(timeslot)}.`;
  }

  if (availability.roomStatus === 'Unavailable') {
    return `Room ${getRoomDisplayName(
      selectedRoom
    )} is currently marked as unavailable, so it cannot be reserved for ${formatAssistantTimeslot(
      timeslot
    )}.`;
  }

  return `Room ${getRoomDisplayName(selectedRoom)} is currently ${availability.roomStatus.toLowerCase()} at ${formatAssistantTimeslot(
    timeslot
  )}.`;
}

export default function RoomAssistantWidget({
  activeCampus = null,
  campusTimeRange = null,
  dataLoading = false,
  dataError = null,
  onOpenWithoutCampus,
  onSelectCampus,
  onSelectRoom,
  onChatReservationHandoff,
  onQuickReservationHandoff,
  quickRequiresConceptPaper,
  quickRequiresMainCampusApproval,
  quickTimeRanges,
  existingReservationDraft,
  onSelectTimeslot,
  reservations,
  schedules,
  autocompleteRooms,
  rooms,
  selectedRoom = null,
  timeslot,
}: Readonly<RoomAssistantWidgetProps>) {
  const [initialConversation] = useState(() => {
    const initialMessage = createEntryPromptMessage(selectedRoom, timeslot);

    return {
      activePromptId: initialMessage.id,
      initialMessage,
    };
  });
  const [isOpen, setIsOpen] = useState(false);
  const [panelBounds, setPanelBounds] = useState<{
    height: number;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    initialConversation.initialMessage,
  ]);
  const [datePreference, setDatePreference] = useState<AssistantDatePreference | null>(null);
  const [dateTimeDraft, setDateTimeDraft] = useState<AssistantTimeslot>({});
  const [selectedDateTimeSlots, setSelectedDateTimeSlots] = useState<ReservationTimeSlot[]>([]);
  const [dateTimeError, setDateTimeError] = useState('');
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomSuggestionsOpen, setRoomSuggestionsOpen] = useState(false);
  const [activeRoomSuggestionIndex, setActiveRoomSuggestionIndex] = useState(-1);
  const [roomSuggestionChecks, setRoomSuggestionChecks] = useState<Record<string, {
    available: boolean | null;
    date: string;
    endTime: string;
    error?: boolean;
    startTime: string;
  }>>({});
  const [preferences, setPreferences] = useState<AssistantPreferences>({ requiredFeatures: [] });
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [step, setStep] = useState<AssistantStep>('entry');
  const [chatInput, setChatInput] = useState('');
  const [chatTurns, setChatTurns] = useState<ReservationChatTurn[]>([]);
  const [chatExtraction, setChatExtraction] = useState<ReservationChatExtraction | null>(null);
  const [chatSelectedRoomId, setChatSelectedRoomId] = useState('');
  const [chatAlternativeRoomIds, setChatAlternativeRoomIds] = useState<string[] | null>(null);
  const [chatReservationDetailsMinimized, setChatReservationDetailsMinimized] = useState(false);
  const [chatAvailability, setChatAvailability] = useState<{ available: boolean; message: string } | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const flowGenerationRef = useRef(0);
  const [quickRoomQuery, setQuickRoomQuery] = useState('');
  const [quickRoom, setQuickRoom] = useState<AssistantRoomRecord | null>(null);
  const [quickDate, setQuickDate] = useState('');
  const [quickStartTime, setQuickStartTime] = useState('');
  const [quickEndTime, setQuickEndTime] = useState('');
  const [quickPurpose, setQuickPurpose] = useState('');
  const [quickOrganization, setQuickOrganization] = useState('');
  const [quickIsEvent, setQuickIsEvent] = useState(false);
  const [quickAvailability, setQuickAvailability] = useState<{ available: boolean; message: string } | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(
    initialConversation.activePromptId
  );
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const roomSuggestionsRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const replyTimeoutsRef = useRef<number[]>([]);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    height: number;
    pointerX: number;
    pointerY: number;
    width: number;
  } | null>(null);

  const capacityOptions = useMemo(() => buildCapacityOptions(rooms), [rooms]);
  const featureOptions = useMemo(() => buildFeatureOptions(rooms), [rooms]);
  const reservationTimeSlots = useMemo(
    () => (campusTimeRange ? getReservationTimeSlots(campusTimeRange) : []),
    [campusTimeRange]
  );
  const roomSuggestions = useMemo(
    () => findAssistantRoomAutocompleteMatches(autocompleteRooms, roomSearchQuery),
    [autocompleteRooms, roomSearchQuery]
  );
  const selectableRoomSuggestionIndexes = roomSuggestions.flatMap((room, index) =>
    isRoomAdministrativelyUnavailable(room.status) ? [] : [index]
  );
  const roomSuggestionAvailabilityKnown =
    !dataLoading && !dataError && validateAssistantTimeslot(timeslot) === 'valid';

  function clearReplyTimers() {
    replyTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    replyTimeoutsRef.current = [];
    setIsBotTyping(false);
  }

  function resetConversation() {
    flowGenerationRef.current += 1;
    const nextEntryMessage = createEntryPromptMessage(selectedRoom, timeslot);

    clearReplyTimers();
    setMessages([nextEntryMessage]);
    setDatePreference(null);
    setDateTimeDraft({});
    setSelectedDateTimeSlots([]);
    setDateTimeError('');
    setRoomSearchQuery('');
    setRoomSuggestionsOpen(false);
    setActiveRoomSuggestionIndex(-1);
    setPreferences({ requiredFeatures: [] });
    setSelectedFeatures([]);
    setStep('entry');
    setChatInput('');
    setChatTurns([]);
    setChatExtraction(null);
    setChatSelectedRoomId('');
    setChatAlternativeRoomIds(null);
    setChatReservationDetailsMinimized(false);
    setChatAvailability(null);
    setChatError('');
    setChatBusy(false);
    setQuickRoomQuery('');
    setQuickRoom(null);
    setQuickDate('');
    setQuickStartTime('');
    setQuickEndTime('');
    setQuickPurpose('');
    setQuickOrganization('');
    setQuickIsEvent(false);
    setQuickAvailability(null);
    setQuickError('');
    setQuickBusy(false);
    setActivePromptId(nextEntryMessage.id);
  }

  function appendUserMessage(text: string) {
    const message = createMessage(text, 'user', 'text');
    setMessages((currentMessages) => [...currentMessages, message]);
  }

  function handleRoomSearchChange(value: string) {
    setRoomSearchQuery(value);
    setRoomSuggestionsOpen(value.trim().length >= 2);
    setActiveRoomSuggestionIndex(-1);
  }

  function selectAutocompleteRoom(room: AssistantRoomRecord) {
    if (isRoomAdministrativelyUnavailable(room.status)) return;
    setRoomSearchQuery(room.label || room.roomId);
    setRoomSuggestionsOpen(false);
    setActiveRoomSuggestionIndex(-1);
    onSelectRoom(room.roomId, true);
    setIsOpen(false);
  }

  const chatRoomSuggestions = useMemo(() => {
    if (!chatExtraction || (!hasReservationRoomSearchCriteria(chatExtraction) && chatAlternativeRoomIds === null)) return [];
    let matches = chatAlternativeRoomIds !== null
      ? chatAlternativeRoomIds
          .map((roomId) => autocompleteRooms.find((room) => room.roomId === roomId))
          .filter((room): room is AssistantRoomRecord => Boolean(room))
          .map((room) => ({ ...room, score: 0 }))
      : chatExtraction.roomQuery
        ? findAssistantRoomAutocompleteMatches(autocompleteRooms, chatExtraction.roomQuery)
        : autocompleteRooms.map((room) => ({ ...room, score: 0 }));
    if (chatAlternativeRoomIds === null) {
      if (chatExtraction.campus) {
        matches = matches.filter((room) => inferCampusFromBuilding({
          id: room.originalRoom.buildingId,
          name: room.originalRoom.buildingName,
        }) === chatExtraction.campus);
      }
      if (chatExtraction.buildingQuery) {
        const query = chatExtraction.buildingQuery.toLowerCase();
        matches = matches.filter((room) => `${room.building} ${room.originalRoom.buildingName ?? ''}`.toLowerCase().includes(query));
      }
      if (chatExtraction.roomType) {
        matches = matches.filter((room) => room.type === chatExtraction.roomType);
      }
      if (chatExtraction.minCapacity) {
        const minCapacity = Number(chatExtraction.minCapacity);
        if (Number.isFinite(minCapacity)) matches = matches.filter((room) => room.capacity >= minCapacity);
      }
      if (chatExtraction.requiredFeatures.length) {
        matches = matches.filter((room) => chatExtraction.requiredFeatures.every((feature) =>
          room.features.some((available) => available.toLowerCase().includes(feature.toLowerCase()))));
      }
    }
    return matches.slice(0, 8);
  }, [autocompleteRooms, chatAlternativeRoomIds, chatExtraction]);
  const visibleChatRoomSuggestions =
    chatReservationDetailsMinimized && chatSelectedRoomId
      ? chatRoomSuggestions.filter((room) => room.roomId === chatSelectedRoomId)
      : chatRoomSuggestions;
  const quickRoomSuggestions = useMemo(
    () => quickRoomQuery.trim().length >= 2
      ? findAssistantRoomAutocompleteMatches(autocompleteRooms, quickRoomQuery)
      : [],
    [autocompleteRooms, quickRoomQuery]
  );

  async function validateQuickReservation() {
    if (!quickRoom || !quickDate || !quickStartTime || !quickEndTime || quickBusy) {
      setQuickError('Select a room, date, start time, and end time first.');
      return;
    }
    if (isRoomAdministrativelyUnavailable(quickRoom.status)) {
      setQuickError(`${quickRoom.label || quickRoom.roomId} is unavailable for reservations. Choose another room.`);
      return;
    }
    setQuickBusy(true);
    const operationGeneration = flowGenerationRef.current;
    setQuickError('');
    setQuickAvailability(null);
    if (isQuickReservationStartInPast(quickDate, quickStartTime)) {
      setQuickAvailability({ available: false, message: 'That reservation time has already started or passed. Choose a future timeslot.' });
      setQuickBusy(false);
      return;
    }
    const roomCampus = inferCampusFromBuilding({ id: quickRoom.originalRoom.buildingId, name: quickRoom.originalRoom.buildingName });
    if (!isQuickReservationTimeRangeValid(roomCampus, quickStartTime, quickEndTime, quickTimeRanges)) {
      setQuickAvailability({ available: false, message: `Choose a valid ${roomCampus ? getCampusName(roomCampus) : 'campus'} reservation time using the standard one-hour reservation slots.` });
      setQuickBusy(false);
      return;
    }
    try {
      const result = await apiRequest<{ checks: Array<{ available: boolean; message: string; roomId: string }> }>('/api/ai/room-reservation', {
        body: { action: 'check-availability', date: quickDate, startTime: quickStartTime, endTime: quickEndTime, roomIds: [quickRoom.roomId] },
      });
      if (operationGeneration !== flowGenerationRef.current) return;
      const check = result.checks.find((item) => item.roomId === quickRoom.roomId);
      if (!check) {
        setQuickAvailability({ available: false, message: 'Could not verify this room.' });
      } else {
        setQuickAvailability({ available: check.available, message: check.message });
      }
    } catch (error) {
      if (operationGeneration !== flowGenerationRef.current) return;
      setQuickError(error instanceof Error ? error.message : 'Availability validation failed.');
    } finally {
      if (operationGeneration === flowGenerationRef.current) setQuickBusy(false);
    }
  }

  async function submitReservationChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const nextTurns = [...chatTurns, { role: 'user' as const, content: text }];
    setChatTurns(nextTurns);
    setChatInput('');
    setChatBusy(true);
    const operationGeneration = flowGenerationRef.current;
    setChatError('');
    setChatAvailability(null);
    setMessages((current) => [...current, createMessage(text, 'user', 'text')]);
    try {
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const result = await apiRequest<{ extraction: ReservationChatExtraction }>('/api/ai/room-reservation', {
        body: { action: 'extract', localDate, messages: nextTurns, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      if (operationGeneration !== flowGenerationRef.current) return;
      const extraction = mergeReservationChatExtractions(chatExtraction, result.extraction);
      const priorChatSelection = autocompleteRooms.find((room) => room.roomId === chatSelectedRoomId) ?? selectedRoom;
      const normalizeRoomText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      const findUniqueExactRoom = (query: string, campus?: ReservationCampus) => {
        const normalizedQuery = normalizeRoomText(query);
        if (!normalizedQuery) return null;
        const exactMatches = autocompleteRooms.filter((room) => {
          const nameMatches = [room.label, room.originalRoom.name]
            .some((value) => normalizeRoomText(value) === normalizedQuery);
          const roomCampus = inferCampusFromBuilding({
            id: room.originalRoom.buildingId,
            name: room.originalRoom.buildingName,
          });
          return nameMatches && (!campus || roomCampus === campus);
        });
        return exactMatches.length === 1 ? exactMatches[0] : null;
      };

      const explicitReference = text.match(/\broom\s*#?\s*[a-z0-9-]+/i)?.[0] ?? '';
      const alternativeRequest =
        /\b(other|another|different)\s+rooms?\b|\balternative(?:s)?\b|\bsimilar(?:\s+to)?\b/i.test(text);
      const referenceRoom = alternativeRequest
        ? (priorChatSelection && (!explicitReference || findUniqueExactRoom(explicitReference)?.roomId === priorChatSelection.roomId)
            ? priorChatSelection
            : findUniqueExactRoom(explicitReference) ??
              findUniqueExactRoom(extraction.roomQuery, extraction.campus || undefined) ??
              findUniqueExactRoom(chatExtraction?.roomQuery ?? '', chatExtraction?.campus || undefined))
        : null;

      let nextExtraction = extraction;
      let nextSelectedRoomId = '';
      let nextAlternativeRoomIds: string[] | null = null;
      let nextChatAvailability: { available: boolean; message: string } | null = null;

      if (alternativeRequest && referenceRoom) {
        const requestedTimeslot = {
          date: extraction.date,
          startTime: extraction.startTime,
          endTime: extraction.endTime,
        };
        let alternatives = findAlternativeAssistantRooms(
          autocompleteRooms,
          reservations,
          referenceRoom,
          requestedTimeslot,
          null,
          schedules
        ).slice(0, 4);
        const hasCompleteSchedule = !getMissingReservationScheduleFields(extraction)
          .some((field) => field !== 'room or room type');
        let availabilityWasVerified = false;
        if (alternatives.length > 0 && hasCompleteSchedule && !isAssistantTimeslotInPast(requestedTimeslot)) {
          try {
            alternatives = await getServerAvailableRecommendations(
              alternatives,
              requestedTimeslot as Required<AssistantTimeslot>
            );
            availabilityWasVerified = true;
          } catch {
            // Keep the live room matches available for a manual server-side preview.
          }
        }
        nextAlternativeRoomIds = alternatives.map((room) => room.roomId);
        nextExtraction = {
          ...extraction,
          assistantMessage: alternatives.length > 0
            ? availabilityWasVerified
              ? `Here are rooms similar to ${referenceRoom.label || referenceRoom.roomId} that are available at that time. Select one to continue.`
              : `Here are similar live rooms to ${referenceRoom.label || referenceRoom.roomId}. Select one to check its availability.`
            : availabilityWasVerified
              ? `I could not find a similar room available at that time. Try another time or a different room.`
              : `I could not find a similar room in the live room list. Try a different room.` ,
        };
      } else if (!alternativeRequest) {
        const priorRoomCampus = priorChatSelection ? inferCampusFromBuilding({
          id: priorChatSelection.originalRoom.buildingId,
          name: priorChatSelection.originalRoom.buildingName,
        }) : chatExtraction?.campus || undefined;
        const exactRoomQuery = extraction.roomQuery || explicitReference;
        const exactRoom = findUniqueExactRoom(
          exactRoomQuery,
          extraction.campus || priorRoomCampus || undefined
        );
        if (exactRoom) {
          const exactRoomCampus = inferCampusFromBuilding({
            id: exactRoom.originalRoom.buildingId,
            name: exactRoom.originalRoom.buildingName,
          });
          const campusName = exactRoomCampus ? getCampusName(exactRoomCampus) : '';
          const buildingName = exactRoom.building || exactRoom.originalRoom.buildingName || exactRoom.originalRoom.buildingId;
          nextSelectedRoomId = exactRoom.roomId;
          if (
            isRoomAdministrativelyUnavailable(exactRoom.status) &&
            getMissingReservationChatFields(extraction).length === 0
          ) {
            nextChatAvailability = {
              available: false,
              message: `${exactRoom.label || exactRoom.roomId} is unavailable for reservations. Ask me for similar rooms or choose another room.`,
            };
          }
          nextExtraction = {
            ...extraction,
            assistantMessage: isRoomAdministrativelyUnavailable(exactRoom.status)
              ? `${exactRoom.label || exactRoom.roomId} at ${[campusName, buildingName].filter(Boolean).join(' · ')} is unavailable for reservations. Ask me for similar rooms or choose another room.`
              : `I found ${exactRoom.label || exactRoom.roomId} at ${[campusName, buildingName].filter(Boolean).join(' · ')}. I selected it so you can check availability.`,
            buildingQuery: extraction.buildingQuery || buildingName,
            campus: extraction.campus || exactRoomCampus || '',
          };
        } else {
          const selectedRoomCampus = priorChatSelection ? inferCampusFromBuilding({
            id: priorChatSelection.originalRoom.buildingId,
            name: priorChatSelection.originalRoom.buildingName,
          }) : null;
          const sameSelectedRoom = priorChatSelection && (
            !extraction.roomQuery ||
            [priorChatSelection.roomId, priorChatSelection.label, priorChatSelection.originalRoom.name]
              .some((value) => normalizeRoomText(value) === normalizeRoomText(extraction.roomQuery))
          );
          const selectedRoomMatchesCampus = !extraction.campus || selectedRoomCampus === extraction.campus;
          nextSelectedRoomId = sameSelectedRoom && selectedRoomMatchesCampus ? priorChatSelection.roomId : '';
        }
      }

      if (nextExtraction.intent === 'reservation' && !nextChatAvailability) {
        const missingDetails = getMissingReservationChatFields(nextExtraction);
        if (missingDetails.length || !alternativeRequest) {
          nextExtraction = {
            ...nextExtraction,
            assistantMessage: buildReservationChatClarificationMessage(nextExtraction),
          };
        }
      }

      if (
        nextExtraction.intent === 'reservation' &&
        nextSelectedRoomId &&
        canCheckReservationChatAvailability(nextExtraction, true)
      ) {
        const resolvedRoom = autocompleteRooms.find((room) => room.roomId === nextSelectedRoomId);
        const resolvedCampus = resolvedRoom ? inferCampusFromBuilding({
          id: resolvedRoom.originalRoom.buildingId,
          name: resolvedRoom.originalRoom.buildingName,
        }) : null;
        const requestedTimeslot = {
          date: nextExtraction.date,
          startTime: nextExtraction.startTime,
          endTime: nextExtraction.endTime,
        };

        if (isAssistantTimeslotInPast(requestedTimeslot)) {
          nextChatAvailability = {
            available: false,
            message: 'That reservation time has already started or passed. Choose a future timeslot.',
          };
        } else if (!isQuickReservationTimeRangeValid(
          resolvedCampus,
          nextExtraction.startTime,
          nextExtraction.endTime,
          quickTimeRanges
        )) {
          nextChatAvailability = {
            available: false,
            message: 'Choose a valid one-hour reservation slot within this campus’s existing reservation hours.',
          };
        } else {
          try {
            const availabilityResult = await apiRequest<{
              checks: Array<{ available: boolean; message: string; roomId: string }>;
            }>('/api/ai/room-reservation', {
              body: {
                action: 'check-availability',
                date: nextExtraction.date,
                startTime: nextExtraction.startTime,
                endTime: nextExtraction.endTime,
                roomIds: [nextSelectedRoomId],
              },
            });
            if (operationGeneration !== flowGenerationRef.current) return;
            const availability = availabilityResult.checks.find((check) => check.roomId === nextSelectedRoomId);
            nextChatAvailability = availability
              ? { available: availability.available, message: availability.message }
              : { available: false, message: 'Could not verify this room.' };
          } catch (error) {
            if (operationGeneration !== flowGenerationRef.current) return;
            nextChatAvailability = null;
            setChatError(error instanceof Error ? error.message : 'Availability preview failed. Please try again.');
          }
        }

        if (nextChatAvailability) {
          const roomLabel = resolvedRoom?.label || resolvedRoom?.roomId || 'The selected room';
          nextExtraction = {
            ...nextExtraction,
            assistantMessage: nextChatAvailability.available
              ? `${roomLabel} is available for your requested schedule. Review the draft and continue to the reservation form.`
              : `${roomLabel} is unavailable for this request: ${nextChatAvailability.message} Ask me for similar rooms or choose another room.`,
          };
        }
      }

      setChatExtraction(nextExtraction);
      setChatAlternativeRoomIds(nextAlternativeRoomIds);
      setChatSelectedRoomId(nextSelectedRoomId);
      setChatReservationDetailsMinimized(false);
      setChatAvailability(null);
      if (nextChatAvailability) setChatAvailability(nextChatAvailability);
      const assistantTurn = { role: 'assistant' as const, content: nextExtraction.assistantMessage };
      setChatTurns([...nextTurns, assistantTurn]);
      setMessages((current) => [...current, createMessage(assistantTurn.content, 'system', 'text')]);
    } catch (error) {
      if (operationGeneration !== flowGenerationRef.current) return;
      setChatTurns(nextTurns);
      setChatError(error instanceof Error ? error.message : 'The reservation assistant could not process that message.');
    } finally {
      if (operationGeneration === flowGenerationRef.current) setChatBusy(false);
    }
  }

  async function previewChatAvailability() {
    if (!chatExtraction || !chatSelectedRoomId || chatBusy) return;
    if (!canCheckReservationChatAvailability(chatExtraction, Boolean(chatSelectedRoomId))) {
      setChatError(buildReservationChatClarificationMessage(chatExtraction));
      return;
    }
    const chatRoom = autocompleteRooms.find((room) => room.roomId === chatSelectedRoomId);
    if (isAssistantTimeslotInPast({
      date: chatExtraction.date,
      startTime: chatExtraction.startTime,
      endTime: chatExtraction.endTime,
    })) {
      setChatError('That reservation time has already started or passed. Choose a future timeslot.');
      setChatAvailability(null);
      return;
    }
    if (chatRoom) {
      const campus = inferCampusFromBuilding({ id: chatRoom.originalRoom.buildingId, name: chatRoom.originalRoom.buildingName });
      if (!isQuickReservationTimeRangeValid(campus, chatExtraction.startTime, chatExtraction.endTime, quickTimeRanges)) {
        setChatError('Choose a valid one-hour reservation slot within this campus’s existing reservation hours.');
        setChatAvailability(null);
        return;
      }
    }
    setChatBusy(true);
    const operationGeneration = flowGenerationRef.current;
    setChatError('');
    try {
      const result = await apiRequest<{ checks: Array<{ available: boolean; message: string; roomId: string }> }>('/api/ai/room-reservation', {
        body: { action: 'check-availability', date: chatExtraction.date, startTime: chatExtraction.startTime, endTime: chatExtraction.endTime, roomIds: [chatSelectedRoomId] },
      });
      if (operationGeneration !== flowGenerationRef.current) return;
      const check = result.checks.find((item) => item.roomId === chatSelectedRoomId);
      setChatAvailability(check ? { available: check.available, message: check.message } : { available: false, message: 'Could not verify this room.' });
    } catch (error) {
      if (operationGeneration !== flowGenerationRef.current) return;
      setChatError(error instanceof Error ? error.message : 'Availability preview failed.');
    } finally {
      if (operationGeneration === flowGenerationRef.current) setChatBusy(false);
    }
  }

  function handleRoomSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setRoomSuggestionsOpen(false);
      setActiveRoomSuggestionIndex(-1);
      return;
    }

    if (!roomSuggestionsOpen || selectableRoomSuggestionIndexes.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveRoomSuggestionIndex((index) => {
        const currentPosition = selectableRoomSuggestionIndexes.indexOf(index);
        const nextPosition = currentPosition < 0
          ? 0
          : Math.min(currentPosition + 1, selectableRoomSuggestionIndexes.length - 1);
        return selectableRoomSuggestionIndexes[nextPosition];
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveRoomSuggestionIndex((index) => {
        const currentPosition = selectableRoomSuggestionIndexes.indexOf(index);
        const previousPosition = currentPosition < 0 ? 0 : Math.max(currentPosition - 1, 0);
        return selectableRoomSuggestionIndexes[previousPosition];
      });
    } else if (event.key === 'Enter' && activeRoomSuggestionIndex >= 0) {
      event.preventDefault();
      const room = roomSuggestions[activeRoomSuggestionIndex];
      if (room) {
        selectAutocompleteRoom(room);
      }
    }
  }

  function queueBotMessages(
    nextMessages: AssistantMessage[],
    initialDelay = BOT_REPLY_DELAY_MS
  ) {
    clearReplyTimers();
    setActivePromptId(null);

    if (nextMessages.length === 0) {
      return;
    }

    const nextInteractiveId = getLastInteractiveMessageId(nextMessages);
    setIsBotTyping(true);

    nextMessages.forEach((message, index) => {
      const timeoutId = window.setTimeout(() => {
        setMessages((currentMessages) => [...currentMessages, message]);

        if (index === nextMessages.length - 1) {
          setIsBotTyping(false);
          setActivePromptId(nextInteractiveId);
        }
      }, initialDelay + (index * BOT_REPLY_GAP_MS));

      replyTimeoutsRef.current.push(timeoutId);
    });
  }

  function startGuidedFlow() {
    flowGenerationRef.current += 1;
    appendUserMessage('Help me choose');

    if (!activeCampus) {
      setStep('campus');
      queueBotMessages([createCampusPromptMessage()]);
      return;
    }

    if (dataError) {
      setStep('entry');
      queueBotMessages([createMessage(dataError, 'system', 'text')]);
      return;
    }

    if (dataLoading) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'I am still waiting for your authenticated Firebase session and live room data. Try again in a moment.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    if (rooms.length === 0) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'I could not load any rooms from the top-level rooms collection for the current selection yet. Pick a building first, then try again.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    setPreferences({ requiredFeatures: [] });
    setSelectedFeatures([]);
    setStep('date');
    queueBotMessages([createDatePreferencePromptMessage(timeslot)]);
  }

  function handleCampusSelection(value: ReservationCampus) {
    onSelectCampus(value);
    setDatePreference(null);
    setPreferences({ requiredFeatures: [] });
    setSelectedFeatures([]);
    setStep('date');
    appendUserMessage(getCampusName(value));
    queueBotMessages([
      createMessage(
        `Got it, I will look in ${getCampusName(value)}.`,
        'system',
        'text'
      ),
      createDatePreferencePromptMessage(timeslot),
    ]);
  }

  function handleDatePreferenceSelection(value: string) {
    if (value === 'choose-date-time') {
      setDateTimeDraft({
        date: timeslot.date ?? '',
      });
      setSelectedDateTimeSlots([]);
      setDateTimeError('');
      setStep('date-time');
      appendUserMessage('Choose date & time');
      queueBotMessages([createDateTimePickerMessage()]);
      return;
    }

    const nextPreference: AssistantDatePreference | null =
      value === 'use-selected-date-time'
        ? { kind: 'selected-date-time' }
        : value === 'specific-date-time'
          ? { kind: 'specific-date-time' }
          : value === 'any-friday'
            ? { dayOfWeek: 5, kind: 'weekday' }
            : value === 'any-saturday'
              ? { dayOfWeek: 6, kind: 'weekday' }
              : null;

    if (!nextPreference) {
      return;
    }

    const requiresDate = nextPreference.kind !== 'weekday';
    const hasRequiredTime = Boolean(timeslot.startTime && timeslot.endTime);
    const hasRequiredDate = Boolean(timeslot.date);

    if (!hasRequiredTime || (requiresDate && !hasRequiredDate)) {
      setStep('date');
      queueBotMessages([
        createDatePreferencePromptMessage(
          timeslot,
          requiresDate
            ? 'Please set the specific date, start time, and end time in the reservation form first.'
            : 'Please set the start time and end time in the reservation form first so I can check future dates.'
        ),
      ]);
      return;
    }

    if (
      requiresDate &&
      isCompleteTimeslot(timeslot) &&
      isAssistantTimeslotInPast(timeslot as Required<AssistantTimeslot>)
    ) {
      setStep('date');
      queueBotMessages([
        createDatePreferencePromptMessage(
          timeslot,
          'That date and time has already passed. Please choose a future date and time in the reservation form.'
        ),
      ]);
      return;
    }

    setDatePreference(nextPreference);
    setStep('type');
    appendUserMessage(
      nextPreference.kind === 'weekday'
        ? `Any ${ASSISTANT_WEEKDAY_LABELS[nextPreference.dayOfWeek]}`
        : nextPreference.kind === 'specific-date-time'
          ? 'Specific date and time'
          : 'Use selected date and time'
    );
    queueBotMessages([createTypePromptMessage()]);
  }

  function handleDateTimeDateChange(value: string) {
    setDateTimeDraft({ date: value });
    setSelectedDateTimeSlots([]);
    setDateTimeError('');
  }

  function handleDateTimeSlotSelection(slot: ReservationTimeSlot) {
    if (!dateTimeDraft.date || isAssistantTimeslotInPast({ ...slot, date: dateTimeDraft.date })) {
      return;
    }

    const nextSelection = getNextContiguousScheduleSelection(selectedDateTimeSlots, slot);
    setSelectedDateTimeSlots(nextSelection.selectedSlots);

    if (nextSelection.reason === 'non-contiguous') {
      setDateTimeError('Choose a time slot next to the selected range.');
      return;
    }

    setDateTimeDraft({
      date: dateTimeDraft.date,
      ...(nextSelection.selection ?? {}),
    });
    setDateTimeError('');
  }

  function handleDateTimeSubmit(messageId: string) {
    if (messageId !== activePromptId || isBotTyping) {
      return;
    }

    const validationStatus = validateAssistantTimeslot(dateTimeDraft);
    const validationMessage =
      validationStatus === 'missing-date'
        ? 'Please choose a date.'
        : validationStatus === 'missing-start-time'
          ? 'Please choose a start time.'
          : validationStatus === 'missing-end-time'
            ? 'Please choose an end time.'
            : validationStatus === 'invalid-time'
              ? 'End time must be after start time.'
              : validationStatus === 'past-date'
                ? 'Please choose a date and time that is not in the past.'
                : '';

    if (validationMessage) {
      setDateTimeError(validationMessage);
      return;
    }

    const resolvedTimeslot = dateTimeDraft as Required<AssistantTimeslot>;
    onSelectTimeslot(resolvedTimeslot);
    setDatePreference({ kind: 'chatbot-date-time' });
    setDateTimeError('');
    setStep('type');
    appendUserMessage(`Date and time: ${formatAssistantTimeslot(resolvedTimeslot)}`);
    queueBotMessages([createTypePromptMessage()]);
  }

  function handleSelectedRoomCheck() {
    appendUserMessage('Check availability');

    if (dataError) {
      setStep('entry');
      queueBotMessages([createMessage(dataError, 'system', 'text')]);
      return;
    }

    if (dataLoading) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'I am still loading live Firebase room data. Try checking again in a moment.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    if (!selectedRoom) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'Pick a room from the list first, then I can check it against live availability.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    if (!isCompleteTimeslot(timeslot)) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          `What date and time are you planning to use ${getRoomDisplayName(
            selectedRoom
          )}? Select the date, start time, and end time in the reservation form, then tap Check availability again.`,
          'system',
          'text'
        ),
      ]);
      return;
    }

    const resolvedTimeslot = timeslot as Required<AssistantTimeslot>;
    const availability = checkAssistantRoomAvailability(
      selectedRoom,
      resolvedTimeslot,
      reservations,
      new Date(),
      schedules
    );

    if (availability.available) {
      setStep('results');
      queueBotMessages([
        createMessage(
          buildAvailabilityMessage(selectedRoom, availability, resolvedTimeslot),
          'system',
          'text'
        ),
      ]);
      return;
    }

    setStep('unavailable-actions');
    queueBotMessages([
      createMessage(
        buildAvailabilityMessage(selectedRoom, availability, resolvedTimeslot),
        'system',
        'text'
      ),
      createUnavailableOptionsMessage(),
    ]);
  }

  function handleTypeSelection(value: AssistantRoomTypeValue | '') {
    const nextPreferences: AssistantPreferences = {
      ...preferences,
      preferredType: value || undefined,
      requiredFeatures: [],
    };

    setPreferences(nextPreferences);
    setSelectedFeatures([]);
    setStep('capacity');
    appendUserMessage(value ? getAssistantRoomTypeLabel(value) : 'No preference');
    queueBotMessages([
      createMessage(
        createCapacityPromptMessage(value || undefined).text,
        'system',
        'buttons',
        { options: capacityOptions }
      ),
    ]);
  }

  function handleCapacitySelection(value: number | string) {
    const normalizedCapacity =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value !== ''
          ? Number(value)
          : undefined;
    const nextPreferences: AssistantPreferences = {
      ...preferences,
      minCapacity: Number.isFinite(normalizedCapacity) ? normalizedCapacity : undefined,
      requiredFeatures: preferences.requiredFeatures,
    };

    setPreferences(nextPreferences);
    setStep('features');
    appendUserMessage(
      nextPreferences.minCapacity ? `Around ${nextPreferences.minCapacity} people` : 'Any size'
    );
    queueBotMessages([
      createCapacityAcknowledgementMessage(nextPreferences.minCapacity),
      createFeaturePromptMessage(featureOptions),
    ]);
  }

  function handleFeatureToggle(value: string) {
    setSelectedFeatures((currentFeatures) =>
      currentFeatures.includes(value)
        ? currentFeatures.filter((feature) => feature !== value)
        : [...currentFeatures, value]
    );
  }

  async function getServerAvailableRecommendations(
    recommendations: AssistantRecommendation[],
    reservationTimeslot: Required<AssistantTimeslot>
  ) {
    if (recommendations.length === 0) return [];
    const candidates = recommendations.slice(0, 4);
    const result = await apiRequest<{
      checks: Array<{ available: boolean; message: string; roomId: string }>;
    }>('/api/ai/room-reservation', {
      body: {
        action: 'check-availability',
        date: reservationTimeslot.date,
        startTime: reservationTimeslot.startTime,
        endTime: reservationTimeslot.endTime,
        roomIds: candidates.map((room) => room.roomId),
      },
    });
    const availableRoomIds = new Set(result.checks.filter((check) => check.available).map((check) => check.roomId));
    return candidates.filter((room) => availableRoomIds.has(room.roomId));
  }

  async function handleFeatureSubmit() {
    const operationGeneration = flowGenerationRef.current;
    if (!activeCampus) {
      setStep('campus');
      queueBotMessages([createCampusPromptMessage()]);
      return;
    }

    if (dataError) {
      setStep('entry');
      queueBotMessages([createMessage(dataError, 'system', 'text')]);
      return;
    }

    if (dataLoading) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'I am still loading live Firebase room data. Try again in a moment.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    if (rooms.length === 0) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'I still do not have any room records to search. Check the building selection and the Firestore room-read logs, then try again.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    const nextPreferences: AssistantPreferences = {
      ...preferences,
      requiredFeatures: normalizeFeatures(selectedFeatures),
    };
    if (!datePreference) {
      setStep('date');
      queueBotMessages([createDatePreferencePromptMessage(timeslot)]);
      return;
    }

    const datePreferenceResult = findAssistantRoomMatchesForDatePreference(
      rooms,
      reservations,
      schedules,
      timeslot,
      datePreference,
      nextPreferences
    );

    if (datePreferenceResult.status !== 'resolved' || !datePreferenceResult.resolvedTimeslot) {
      const message =
        datePreferenceResult.status === 'missing-time'
          ? 'Please set a start time and end time in the reservation form before I check room availability.'
          : datePreferenceResult.status === 'missing-date'
            ? 'Please set a specific future date in the reservation form before I check room availability.'
            : datePreferenceResult.status === 'invalid-time'
              ? 'The selected time range is not valid. Please choose a start time before the end time in the reservation form.'
              : datePreferenceResult.status === 'past-date'
                ? 'That date and time has already passed. Please choose a future date and time in the reservation form.'
                : datePreference.kind === 'weekday'
                  ? `I could not find an eligible room on a future ${ASSISTANT_WEEKDAY_LABELS[datePreference.dayOfWeek]} within the next two weeks. Try another day, time, or room requirement.`
                  : 'I could not find a matching room for that future date and time. Try another date or change a room requirement.';

      setStep('date');
      queueBotMessages([
        createMessage(message, 'system', 'text'),
        createDatePreferencePromptMessage(timeslot),
      ]);
      return;
    }

    const resolvedTimeslot = datePreferenceResult.resolvedTimeslot;
    onSelectTimeslot(resolvedTimeslot);

    setPreferences(nextPreferences);
    setStep('results');
    appendUserMessage(formatFeatureSummary(nextPreferences.requiredFeatures));
    setActivePromptId(null);
    setIsBotTyping(true);

    let recommendationCards: AssistantRecommendationCard[] = [];
    try {
      const availableRecommendations = await getServerAvailableRecommendations(
        datePreferenceResult.recommendations,
        resolvedTimeslot
      );
      if (operationGeneration !== flowGenerationRef.current) return;
      recommendationCards = await attachFeedbackSummaries(availableRecommendations);
      if (operationGeneration !== flowGenerationRef.current) return;
    } catch (error) {
      if (operationGeneration !== flowGenerationRef.current) return;
      queueBotMessages([
        createMessage(
          error instanceof Error ? error.message : 'I could not verify room availability right now. Please try again.',
          'system',
          'text'
        ),
      ]);
      setStep('entry');
      return;
    }
    const dateResolutionMessage =
      datePreference.kind === 'weekday'
        ? createMessage(
            `I found the first future ${ASSISTANT_WEEKDAY_LABELS[datePreference.dayOfWeek]} with an eligible room: ${formatAssistantTimeslot(
              resolvedTimeslot
            )}. I updated the reservation form to use it.`,
            'system',
            'text'
          )
        : datePreference.kind === 'chatbot-date-time'
          ? createMessage(
              `I will search for ${formatAssistantTimeslot(
                resolvedTimeslot
              )}. I updated the reservation form to use it.`,
              'system',
              'text'
            )
          : null;
    queueBotMessages([
      ...(dateResolutionMessage ? [dateResolutionMessage] : []),
      createSearchMessage(),
      createRecommendationMessage(
        recommendationCards,
        'Here are the matching rooms I found right now:',
        'I could not find a suitable reservable room right now. Try removing a feature or changing the date and time.'
      ),
    ]);
  }

  async function handleUnavailableAction(value: string) {
    const operationGeneration = flowGenerationRef.current;
    if (!selectedRoom) {
      setStep('entry');
      queueBotMessages([
        createMessage('Pick a room first so I know which availability to check.', 'system', 'text'),
      ]);
      return;
    }

    if (!isCompleteTimeslot(timeslot)) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'I need the date, start time, and end time first before I can suggest alternatives.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    if (dataError) {
      setStep('entry');
      queueBotMessages([createMessage(dataError, 'system', 'text')]);
      return;
    }

    if (value === 'try-another-day-time') {
      appendUserMessage('Try another day/time');
      setStep('timeslot-suggestions');

      if (!campusTimeRange) {
        queueBotMessages([
          createMessage(
            'I could not read this campus time range yet, so I cannot suggest another slot for that room.',
            'system',
            'text'
          ),
        ]);
        return;
      }

      const suggestions = suggestAssistantTimeslotsForRoom(
        selectedRoom,
        reservations,
        timeslot,
        campusTimeRange,
        {},
        schedules
      );

      queueBotMessages([createTimeslotSuggestionMessage(suggestions)]);
      return;
    }

    appendUserMessage('See alternative rooms');
    setStep('results');

    const resolvedPreferences = hasStoredPreferences(preferences)
      ? preferences
      : getFallbackPreferencesFromRoom(selectedRoom);
    const recommendations = findAlternativeAssistantRooms(
      rooms,
      reservations,
      selectedRoom,
      timeslot,
      resolvedPreferences,
      schedules
    );
    setActivePromptId(null);
    setIsBotTyping(true);
    let recommendationCards: AssistantRecommendationCard[] = [];
    try {
      const availableRecommendations = await getServerAvailableRecommendations(
        recommendations,
        timeslot as Required<AssistantTimeslot>
      );
      if (operationGeneration !== flowGenerationRef.current) return;
      recommendationCards = await attachFeedbackSummaries(availableRecommendations);
      if (operationGeneration !== flowGenerationRef.current) return;
    } catch (error) {
      if (operationGeneration !== flowGenerationRef.current) return;
      queueBotMessages([
        createMessage(
          error instanceof Error ? error.message : 'I could not verify alternative room availability right now. Please try again.',
          'system',
          'text'
        ),
      ]);
      setStep('entry');
      return;
    }

    queueBotMessages([
      createSearchMessage(),
      createRecommendationMessage(
        recommendationCards,
        'Here are the alternative rooms available at the same time:',
        'I could not find another room available at that same time. Try another day or a shorter time range.'
      ),
    ]);
  }

  function handleSuggestedTimeslotSelection(suggestion: AssistantTimeslotSuggestion) {
    appendUserMessage(suggestion.label);
    onSelectTimeslot({
      date: suggestion.date ?? '',
      endTime: suggestion.endTime ?? '',
      startTime: suggestion.startTime ?? '',
    });
    setStep('entry');
    queueBotMessages([createEntryFollowUpMessage(selectedRoom)]);
  }

  function handleOptionClick(messageId: string, option: AssistantOption) {
    if (messageId !== activePromptId || isBotTyping) {
      return;
    }

    if (step === 'entry') {
      if (option.value === 'quick-reservation') {
        flowGenerationRef.current += 1;
        setStep('quick-reservation');
        setQuickRoomQuery(selectedRoom?.label || selectedRoom?.roomId || '');
        setQuickRoom(selectedRoom);
        setQuickDate(timeslot.date ?? '');
        setQuickStartTime(timeslot.startTime ?? '');
        setQuickEndTime(timeslot.endTime ?? '');
        setQuickPurpose(existingReservationDraft.purpose);
        setQuickOrganization(existingReservationDraft.organization);
        setQuickIsEvent(existingReservationDraft.isEvent);
        setQuickAvailability(null);
        setQuickError('');
        setQuickBusy(false);
        setMessages((current) => [...current, createMessage('Quick Reservation', 'user', 'text'), createMessage('Select your room and schedule. I will check live availability before collecting the remaining reservation details.', 'system', 'text')]);
        return;
      }
      if (option.value === 'reservation-chat') {
        flowGenerationRef.current += 1;
        setStep('reservation-chat');
        const selectedCampus = selectedRoom ? inferCampusFromBuilding({
          id: selectedRoom.originalRoom.buildingId,
          name: selectedRoom.originalRoom.buildingName,
        }) : null;
        const existingDetails = [
          selectedRoom ? `Already selected room: ${selectedRoom.label || selectedRoom.roomId} (actual room ID ${selectedRoom.roomId})${selectedCampus ? ` at ${getCampusName(selectedCampus)}` : ''}, building ${selectedRoom.building || selectedRoom.originalRoom.buildingName}.` : '',
          timeslot.date && timeslot.startTime && timeslot.endTime ? `Already selected schedule: ${timeslot.date}, ${timeslot.startTime} to ${timeslot.endTime}.` : '',
          existingReservationDraft.program ? `Already entered program/department/organization: ${existingReservationDraft.program}.` : '',
          existingReservationDraft.purpose ? `Already entered purpose: ${existingReservationDraft.purpose}.` : '',
        ].filter(Boolean).join(' ');
        setChatTurns(existingDetails ? [{ role: 'assistant', content: `Existing reservation form details: ${existingDetails} Preserve these unless the user changes them.` }] : []);
        setChatSelectedRoomId('');
        setChatAlternativeRoomIds(null);
        setChatReservationDetailsMinimized(false);
        setChatAvailability(null);
        setChatBusy(false);
        setChatInput('');
        setChatExtraction(null);
        setChatError('');
        setMessages((current) => [...current, createMessage('Reserve with chat', 'user', 'text'), createMessage('Tell me what room and schedule you need. You can name a room or describe a room type and preferences; I can search both campuses.', 'system', 'text')]);
        return;
      }
      if (option.value === 'help-me-choose') {
        startGuidedFlow();
        return;
      }

      handleSelectedRoomCheck();
      return;
    }

    if (step === 'campus') {
      if (isCampusOptionValue(option.value)) {
        handleCampusSelection(option.value);
      }

      return;
    }

    if (step === 'date') {
      handleDatePreferenceSelection(String(option.value));
      return;
    }

    if (step === 'type') {
      handleTypeSelection(String(option.value) as AssistantRoomTypeValue | '');
      return;
    }

    if (step === 'capacity') {
      handleCapacitySelection(option.value as number | string);
      return;
    }

    if (step === 'features') {
      if (option.value === '__done__') {
        void handleFeatureSubmit();
        return;
      }

      handleFeatureToggle(String(option.value));
      return;
    }

    if (step === 'unavailable-actions') {
      void handleUnavailableAction(String(option.value));
      return;
    }

    if (
      step === 'timeslot-suggestions' &&
      typeof option.value === 'object' &&
      option.value !== null
    ) {
      handleSuggestedTimeslotSelection(option.value);
    }
  }

  function handleRecommendationClick(messageId: string, recommendation: AssistantRecommendation) {
    if (messageId !== activePromptId || isBotTyping) {
      return;
    }

    appendUserMessage(`Select ${getRoomDisplayName(recommendation)}`);
    onSelectRoom(recommendation.roomId, true);
    const timeslotToRestore = getAssistantRoomSelectionTimeslot(timeslot);
    if (timeslotToRestore) {
      onSelectTimeslot(timeslotToRestore);
    }
    setIsOpen(false);
  }

  useEffect(() => {
    return () => {
      replyTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      replyTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !messageListRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [isBotTyping, isOpen, messages]);

  useEffect(() => {
    if (!roomSuggestionsOpen || activeRoomSuggestionIndex < 0) {
      return;
    }

    roomSuggestionsRef.current
      ?.querySelector<HTMLElement>(`#assistant-room-option-${activeRoomSuggestionIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeRoomSuggestionIndex, roomSuggestionsOpen]);

  useEffect(() => {
    if (
      !isOpen ||
      step !== 'entry' ||
      !roomSuggestionsOpen ||
      !roomSuggestionAvailabilityKnown ||
      roomSuggestions.length === 0
    ) {
      return;
    }
    let cancelled = false;
    const eligibleRooms = roomSuggestions.slice(0, 4).filter((room) => {
      const campus = inferCampusFromBuilding({ id: room.originalRoom.buildingId, name: room.originalRoom.buildingName });
      return isQuickReservationTimeRangeValid(campus, timeslot.startTime ?? '', timeslot.endTime ?? '', quickTimeRanges);
    });
    const roomIds = eligibleRooms.map((room) => room.roomId);
    if (roomIds.length === 0) return;
    const timerId = window.setTimeout(() => {
      void apiRequest<{ checks: Array<{ available: boolean; message: string; roomId: string }> }>('/api/ai/room-reservation', {
        body: {
          action: 'check-availability',
          date: timeslot.date,
          startTime: timeslot.startTime,
          endTime: timeslot.endTime,
          roomIds,
        },
      }).then((result) => {
        if (cancelled) return;
        setRoomSuggestionChecks((current) => ({
          ...current,
          ...Object.fromEntries(result.checks.map((check) => [check.roomId, {
            available: check.available,
            date: timeslot.date ?? '',
            startTime: timeslot.startTime ?? '',
            endTime: timeslot.endTime ?? '',
          }])),
        }));
      }).catch(() => {
        if (cancelled) return;
        setRoomSuggestionChecks((current) => ({
          ...current,
          ...Object.fromEntries(roomIds.map((roomId) => [roomId, {
            available: null,
            date: timeslot.date ?? '',
            startTime: timeslot.startTime ?? '',
            endTime: timeslot.endTime ?? '',
            error: true,
          }])),
        }));
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [isOpen, quickTimeRanges, roomSuggestionAvailabilityKnown, roomSuggestions, roomSuggestionsOpen, step, timeslot.date, timeslot.endTime, timeslot.startTime]);

  useEffect(() => {
    if (!isOpen || panelBounds) {
      return;
    }

    const width = Math.min(600, window.innerWidth - 32);
    const height = Math.min(560, window.innerHeight - 96);
    setPanelBounds({
      height,
      left: Math.max(16, window.innerWidth - width - 24),
      top: Math.max(80, window.innerHeight - height - 24),
      width,
    });
  }, [isOpen, panelBounds]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragStart = dragStartRef.current;
      const resizeStart = resizeStartRef.current;
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      if (dragStart) {
        const { height, width } = panel.getBoundingClientRect();
        setPanelBounds((current) => {
          if (!current) return current;
          return {
            ...current,
            left: Math.min(
              Math.max(0, dragStart.startLeft + event.clientX - dragStart.pointerX),
              Math.max(0, window.innerWidth - width)
            ),
            top: Math.min(
              Math.max(0, dragStart.startTop + event.clientY - dragStart.pointerY),
              Math.max(0, window.innerHeight - height)
            ),
          };
        });
        return;
      }

      if (resizeStart) {
        setPanelBounds((current) => {
          if (!current) return current;
          return {
            ...current,
            height: Math.min(
              Math.max(352, resizeStart.height + event.clientY - resizeStart.pointerY),
              window.innerHeight - current.top
            ),
            width: Math.min(
              Math.max(Math.min(320, window.innerWidth - 16), resizeStart.width + event.clientX - resizeStart.pointerX),
              window.innerWidth - current.left
            ),
          };
        });
      }
    };
    const handlePointerUp = () => {
      dragStartRef.current = null;
      resizeStartRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  function startPanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startLeft: panelRect.left,
      startTop: panelRect.top,
    };
  }

  function startPanelResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const panel = panelRef.current;
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    resizeStartRef.current = {
      height: panelRect.height,
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: panelRect.width,
    };
  }

  return (
    <>
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Room Recommendation Assistant"
          className="assistant-chat-shell assistant-pop fixed z-40 flex flex-col overflow-hidden rounded-[28px] border border-[var(--assistant-outline)]"
          style={panelBounds ? {
            height: panelBounds.height,
            left: panelBounds.left,
            maxHeight: 'calc(100dvh - 1rem)',
            maxWidth: 'calc(100vw - 1rem)',
            minHeight: 'min(22rem, calc(100dvh - 6rem))',
            minWidth: 'min(20rem, calc(100vw - 1rem))',
            top: panelBounds.top,
            width: panelBounds.width,
          } : undefined}
        >
          <div
            className="cursor-move touch-none border-b border-black/8 bg-[linear-gradient(135deg,#a12124_0%,#7a191c_100%)] px-4 py-3 text-white"
            onPointerDown={startPanelDrag}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-bold">Room Recommendation Assistant</p>
                <p className="mt-1 text-xs leading-relaxed text-white/78">
                  Manual room checks and live Firebase recommendations
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={resetConversation}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/20"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
                  aria-label="Minimize room assistant"
                  title="Minimize room assistant"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M6 12h12" strokeLinecap="round" strokeWidth="2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onPointerDown={startPanelResize}
            className="absolute bottom-0 right-0 z-10 flex h-7 w-7 cursor-se-resize items-end justify-end p-1 text-black/35 transition-colors hover:text-[#a12124]"
            aria-label="Resize room assistant"
            title="Drag to resize"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 13h8M9 9h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
            </svg>
          </button>

          <div
            ref={messageListRef}
            className="assistant-scroll flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3.5"
          >
            {messages.map((message) => {
              const isCurrentPrompt = message.id === activePromptId && !isBotTyping;

              return (
                <div
                  key={message.id}
                  className={`assistant-pop flex items-end gap-2 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'system' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f1d7c8] text-[10px] font-bold text-[#7a191c] shadow-sm">
                      AI
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-[24px] px-4 py-3 text-base shadow-sm ${
                      message.role === 'user'
                        ? 'rounded-br-md bg-[linear-gradient(135deg,#a12124_0%,#7a191c_100%)] text-white'
                        : 'rounded-bl-md border border-black/8 bg-[rgba(255,255,255,0.92)] text-black'
                    }`}
                  >
                    <p className="leading-relaxed">{message.text}</p>

                    {message.type === 'buttons' && message.options && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.options.map((option) => (
                          <button
                            key={`${message.id}-${option.label}`}
                            type="button"
                            onClick={() => handleOptionClick(message.id, option)}
                            disabled={!isCurrentPrompt}
                            className="rounded-full border border-[#a12124]/18 bg-[#a12124]/8 px-3.5 py-2.5 text-left text-sm font-bold text-[#8f1d20] transition-all hover:-translate-y-0.5 hover:bg-[#a12124]/14 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {message.type === 'date-time-picker' && (
                      <form
                        className="mt-3 space-y-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          handleDateTimeSubmit(message.id);
                        }}
                      >
                        <div>
                          <p className="text-xs font-semibold text-black/75">Date</p>
                          <RoomAvailabilityPicker
                            bookedSlots={[]}
                            value={dateTimeDraft.date ?? ''}
                            onChange={handleDateTimeDateChange}
                            disabled={!isCurrentPrompt}
                            hideLegend
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-black/75">Time</p>
                          <div className="mt-1 max-h-52 space-y-2 overflow-y-auto pr-1">
                            {reservationTimeSlots.length === 0 ? (
                              <p className="rounded-xl border border-black/8 bg-black/5 px-3 py-2 text-xs text-black/60">
                                Choose a campus first to load reservation time slots.
                              </p>
                            ) : (
                              reservationTimeSlots.map((slot) => {
                                const selected =
                                  selectedDateTimeSlots.some(
                                    (selectedSlot) =>
                                      selectedSlot.startTime === slot.startTime &&
                                      selectedSlot.endTime === slot.endTime
                                  );
                                const past = Boolean(
                                  dateTimeDraft.date &&
                                    isAssistantTimeslotInPast({
                                      ...slot,
                                      date: dateTimeDraft.date,
                                    })
                                );

                                return (
                                  <button
                                    key={`${slot.startTime}-${slot.endTime}`}
                                    type="button"
                                    onClick={() => handleDateTimeSlotSelection(slot)}
                                    disabled={!isCurrentPrompt || !dateTimeDraft.date || past}
                                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                                      selected
                                        ? 'border-[#a12124]/35 bg-[#a12124]/12 text-[#8f1d20]'
                                        : 'border-black/8 bg-black/5 text-black hover:bg-[#a12124]/8 hover:text-[#8f1d20]'
                                    }`}
                                  >
                                    <span>{formatReservationTimeSlot(slot)}</span>
                                    <span className="text-[10px]">
                                      {past ? 'Unavailable' : selected ? 'Selected' : 'Select'}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                        {dateTimeError && (
                          <p className="text-xs font-semibold text-[#a12124]" role="alert">
                            {dateTimeError}
                          </p>
                        )}
                        <button
                          type="submit"
                          disabled={!isCurrentPrompt}
                          className="w-full rounded-full bg-[#a12124] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#871d20] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Search availability
                        </button>
                      </form>
                    )}

                    {message.type === 'feature-picker' && message.options && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.options.map((option) => {
                          const isDone = option.value === '__done__';
                          const isSelected =
                            !isDone && selectedFeatures.includes(String(option.value));

                          return (
                            <button
                              key={`${message.id}-${option.label}`}
                              type="button"
                              onClick={() => handleOptionClick(message.id, option)}
                              disabled={!isCurrentPrompt}
                              className={`rounded-full px-3 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                                isDone
                                  ? 'bg-[#a12124] text-white hover:bg-[#8e1d20]'
                                  : isSelected
                                    ? 'border border-[#a12124]/30 bg-[#a12124]/18 text-[#8f1d20]'
                                    : 'border border-black/10 bg-black/5 text-black hover:bg-[#a12124]/10 hover:text-[#8f1d20]'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {message.type === 'recommendations' && message.recommendations && (
                      <div className="mt-3 space-y-3">
                        {message.recommendations.map((recommendation) => (
                          <div
                            key={recommendation.roomId}
                            className="rounded-3xl border border-black/8 bg-[#f8f4ef] p-3 shadow-[0_10px_24px_rgba(37,22,17,0.06)]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-black">
                                  {getRoomDisplayName(recommendation)}
                                </p>
                                <p className="mt-1 text-[11px] text-black/72">
                                  {recommendation.typeLabel}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRecommendationClick(message.id, recommendation)
                                }
                                disabled={!isCurrentPrompt}
                                className="rounded-full bg-[#a12124] px-3 py-2 text-[11px] font-bold text-white transition-colors hover:bg-[#871d20] disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                Select
                              </button>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-black/72">
                              <span className="rounded-full border border-black/8 bg-white px-2.5 py-1">
                                Capacity {recommendation.capacity}
                              </span>
                              <span className="rounded-full border border-black/8 bg-white px-2.5 py-1">
                                {recommendation.building}
                              </span>
                              <span className="rounded-full border border-black/8 bg-white px-2.5 py-1">
                                Floor {recommendation.floor}
                              </span>
                            </div>

                            <p className="mt-2 text-[11px] text-black/70">
                              Features:{' '}
                              {recommendation.features.length > 0
                                ? recommendation.features.join(', ')
                                : 'None listed'}
                            </p>

                            <p className="mt-3 text-[11px] leading-relaxed text-black/78">
                              {recommendation.reason}
                            </p>

                            {recommendation.feedbackSummary && (
                              <div className="mt-3 border-t border-black/8 pt-3 text-[11px] leading-relaxed text-black/70">
                                <p className="font-bold text-black/80">Room feedback</p>
                                {formatFeedbackSummary(recommendation.feedbackSummary).map((line, index) => (
                                  <p key={`${recommendation.roomId}-feedback-${index}`}>{line}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dfd6cc] text-[10px] font-bold text-black/70 shadow-sm">
                      You
                    </div>
                  )}
                </div>
              );
            })}

            {isBotTyping && (
              <div className="assistant-pop flex items-end gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1d7c8] text-[10px] font-bold text-[#7a191c] shadow-sm">
                  AI
                </div>
                <div className="rounded-[22px] rounded-bl-md border border-black/8 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="assistant-typing-dot h-2 w-2 rounded-full bg-[#a12124]/45" />
                    <span className="assistant-typing-dot h-2 w-2 rounded-full bg-[#a12124]/45" />
                    <span className="assistant-typing-dot h-2 w-2 rounded-full bg-[#a12124]/45" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {step === 'quick-reservation' ? (
            <div className="max-h-[48vh] space-y-3 overflow-y-auto border-t border-black/8 bg-white p-4">
              <div>
                <label htmlFor="quick-room-search" className="mb-1 block text-[10px] font-bold text-black/75">Room · campus · building</label>
                <input id="quick-room-search" value={quickRoomQuery} onChange={(event) => { setQuickRoomQuery(event.target.value); setQuickRoom(null); setQuickAvailability(null); setQuickError(''); }} placeholder="Search room name, campus, or building" autoComplete="off" className="w-full rounded-xl border border-black/12 bg-[#f8f4ef] px-3 py-2 text-xs outline-none focus:border-[#a12124]/55" />
                {quickRoomQuery.trim().length >= 2 && !quickRoom && (
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-xl border border-black/10 bg-white p-1">
                    {quickRoomSuggestions.length ? quickRoomSuggestions.map((room) => {
                      const campus = inferCampusFromBuilding({ id: room.originalRoom.buildingId, name: room.originalRoom.buildingName });
                      const administrativelyUnavailable = isRoomAdministrativelyUnavailable(room.status);
                      return <button key={room.roomId} type="button" disabled={administrativelyUnavailable} onClick={() => { if (administrativelyUnavailable) return; setQuickRoom(room); setQuickRoomQuery(room.label || room.roomId); setQuickAvailability(null); setQuickError(''); }} className="block w-full rounded-lg px-2.5 py-2 text-left enabled:hover:bg-[#a12124]/6 disabled:cursor-not-allowed disabled:opacity-65">
                        <span className="block text-xs font-bold">{room.label || room.roomId}</span>
                        <span className="block text-xs text-black/65">{campus ? getCampusName(campus) : 'Campus unavailable'} · {room.building || room.originalRoom.buildingName || room.originalRoom.buildingId}</span>
                        {administrativelyUnavailable && <span className="mt-0.5 block text-xs font-bold text-red-800">Unavailable for reservations</span>}
                      </button>;
                    }) : <p className="px-2.5 py-2 text-[10px] text-black/60">{dataLoading ? 'Loading live rooms…' : 'No matching live rooms. Try another room, campus, or building.'}</p>}
                  </div>
                )}
                {quickRoom && <p className={`mt-1 text-[10px] ${isRoomAdministrativelyUnavailable(quickRoom.status) ? 'font-bold text-red-800' : 'text-black/65'}`}>{isRoomAdministrativelyUnavailable(quickRoom.status) ? 'Unavailable for reservations: ' : 'Selected: '}{getRoomDisplayName(quickRoom)} · {(() => { const campus = inferCampusFromBuilding({ id: quickRoom.originalRoom.buildingId, name: quickRoom.originalRoom.buildingName }); return campus ? getCampusName(campus) : 'Campus unavailable'; })()} · {quickRoom.building || quickRoom.originalRoom.buildingName || quickRoom.originalRoom.buildingId}</p>}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="text-[10px] font-bold text-black/75">Date<input type="date" value={quickDate} onChange={(event) => { setQuickDate(event.target.value); setQuickAvailability(null); setQuickError(''); }} className="mt-1 w-full rounded-lg border border-black/12 bg-[#f8f4ef] px-2 py-2 text-xs font-normal" /></label>
                <label className="text-[10px] font-bold text-black/75">Start time<input type="time" value={quickStartTime} onChange={(event) => { setQuickStartTime(event.target.value); setQuickAvailability(null); setQuickError(''); }} className="mt-1 w-full rounded-lg border border-black/12 bg-[#f8f4ef] px-2 py-2 text-xs font-normal" /></label>
                <label className="text-[10px] font-bold text-black/75">End time<input type="time" value={quickEndTime} onChange={(event) => { setQuickEndTime(event.target.value); setQuickAvailability(null); setQuickError(''); }} className="mt-1 w-full rounded-lg border border-black/12 bg-[#f8f4ef] px-2 py-2 text-xs font-normal" /></label>
              </div>
              <button type="button" disabled={!quickRoom || !quickDate || !quickStartTime || !quickEndTime || quickBusy} onClick={() => void validateQuickReservation()} className="rounded-lg bg-[#a12124] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-45">{quickBusy ? 'Checking…' : 'Validate room and schedule'}</button>
              {quickAvailability && <p className={`text-[10px] ${quickAvailability.available ? 'text-emerald-800' : 'text-rose-800'}`} role="status">{quickAvailability.message}</p>}
              {quickError && <p className="text-[10px] text-rose-700" role="alert">{quickError}</p>}
              {quickAvailability?.available && quickRoom && (
                <div className="space-y-2 border-t border-black/8 pt-3">
                  <p className="text-[10px] font-bold text-black/75">Reservation details</p>
                  <label className="block text-[10px] font-bold text-black/75">Program / department / organization<input value={quickOrganization} onChange={(event) => setQuickOrganization(event.target.value)} maxLength={160} className="mt-1 w-full rounded-lg border border-black/12 bg-[#f8f4ef] px-3 py-2 text-xs font-normal" /></label>
                  <label className="block text-[10px] font-bold text-black/75">{quickIsEvent ? 'Event name' : 'Purpose'}<input value={quickPurpose} onChange={(event) => setQuickPurpose(event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-black/12 bg-[#f8f4ef] px-3 py-2 text-xs font-normal" /></label>
                  <label className="flex items-center gap-2 text-[10px] text-black/75"><input type="checkbox" checked={quickIsEvent} onChange={(event) => setQuickIsEvent(event.target.checked)} />This reservation is for an event</label>
                  <div className="rounded-lg bg-[#f8f4ef] p-3 text-[10px] text-black/70">
                    <p className="mb-1 font-bold text-black/85">Review reservation</p>
                    <p>Room: {getRoomDisplayName(quickRoom)}</p>
                    <p>Campus and building: {(() => { const campus = inferCampusFromBuilding({ id: quickRoom.originalRoom.buildingId, name: quickRoom.originalRoom.buildingName }); return `${campus ? getCampusName(campus) : 'Campus unavailable'} · ${quickRoom.building || quickRoom.originalRoom.buildingName || quickRoom.originalRoom.buildingId}`; })()}</p>
                    <p>Schedule: {quickDate} · {quickStartTime}–{quickEndTime}</p>
                    <p>Organization: {quickOrganization || 'Required'}</p>
                    <p>{quickIsEvent ? 'Event' : 'Purpose'}: {quickPurpose || 'Required'}</p>
                    {getQuickReservationFollowUpRequirements({
                      campus: inferCampusFromBuilding({ id: quickRoom.originalRoom.buildingId, name: quickRoom.originalRoom.buildingName }),
                      isStudent: quickRequiresConceptPaper,
                      isFaculty: !quickRequiresMainCampusApproval,
                    }).map((requirement) => <p key={requirement} className="mt-1">Required in the reservation form: {requirement}.</p>)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setQuickAvailability(null); setQuickError(''); }} className="rounded-lg border border-black/15 px-3 py-2 text-[10px] font-bold text-black/70">Edit room or schedule</button>
                    <button type="button" disabled={getQuickReservationMissingDetails({ organization: quickOrganization, purpose: quickPurpose }).length > 0} onClick={() => {
                      onQuickReservationHandoff({ roomId: quickRoom.roomId, date: quickDate, startTime: quickStartTime, endTime: quickEndTime, organization: quickOrganization.trim(), purpose: quickPurpose.trim(), isEvent: quickIsEvent });
                      setIsOpen(false);
                    }} className="rounded-lg bg-[#a12124] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-45">Continue to reservation form</button>
                  </div>
                </div>
              )}
              <p className="text-[9px] leading-relaxed text-black/55">Availability is checked again by the reservation form when you submit. Required document uploads and approval routing stay in that form.</p>
            </div>
          ) : step === 'reservation-chat' ? (
            <div className="border-t border-black/8 bg-white p-4">
              {chatExtraction && (
                <>
                  {!chatReservationDetailsMinimized && getMissingReservationChatFields(chatExtraction).some(
                    (field) => field !== 'room or room type' || !chatSelectedRoomId
                  ) && (
                    <p className="mb-2 text-[11px] text-black/65">{chatExtraction.assistantMessage}</p>
                  )}
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {visibleChatRoomSuggestions.map((room) => {
                      const campus = inferCampusFromBuilding({ id: room.originalRoom.buildingId, name: room.originalRoom.buildingName });
                      const isSelected = chatSelectedRoomId === room.roomId;
                      const isMinimized = isSelected && chatReservationDetailsMinimized;
                      return (
                        <div key={room.roomId} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${isSelected ? 'border-[#a12124] bg-[#a12124]/8' : 'border-black/10 hover:bg-black/5'}`}>
                          <button type="button" onClick={() => { setChatSelectedRoomId(room.roomId); setChatReservationDetailsMinimized(false); setChatAvailability(isRoomAdministrativelyUnavailable(room.status) ? { available: false, message: `${room.label || room.roomId} is unavailable for reservations. Choose another room.` } : null); setChatError(''); }}
                            className="min-w-0 flex-1 text-left">
                            <span className="flex items-center justify-between gap-2 font-bold">
                              <span>{room.label || room.roomId}{isMinimized ? ' · selected' : ''}</span>
                              {isRoomAdministrativelyUnavailable(room.status) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-800">Unavailable for reservations</span>}
                            </span>
                            {!isMinimized && <span className="mt-0.5 block text-xs text-black/65">{campus ? getCampusName(campus) : 'Campus unavailable'} · {room.building || room.originalRoom.buildingName || room.originalRoom.buildingId}</span>}
                          </button>
                          {isSelected && (
                            <button type="button" onClick={() => setChatReservationDetailsMinimized((current) => !current)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#a12124]/20 bg-white text-[#8f1d20] hover:bg-[#a12124]/10"
                              aria-label={`${isMinimized ? 'Expand' : 'Collapse'} selected room details`}
                              title={isMinimized ? 'Expand selected room details' : 'Collapse selected room details'}>
                              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <path
                                  d={isMinimized ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!chatReservationDetailsMinimized && chatExtraction.date && chatExtraction.startTime && chatExtraction.endTime && (
                    <div className="mt-2 rounded-lg bg-[#f8f4ef] px-3 py-2 text-xs text-black/65">
                      <p className="font-bold text-black/80">Reservation draft</p>
                      {chatSelectedRoomId && (() => {
                        const room = autocompleteRooms.find((candidate) => candidate.roomId === chatSelectedRoomId);
                        if (!room) return null;
                        const campus = inferCampusFromBuilding({ id: room.originalRoom.buildingId, name: room.originalRoom.buildingName });
                        return <p>Room: {room.label || room.roomId} · {campus ? getCampusName(campus) : 'Campus unavailable'} · {room.building || room.originalRoom.buildingName || room.originalRoom.buildingId}</p>;
                      })()}
                      <p>{chatExtraction.date} · {chatExtraction.startTime}–{chatExtraction.endTime}</p>
                      {chatExtraction.program && <p>Program/Course: {chatExtraction.program}</p>}
                      {chatExtraction.purpose && <p>Purpose: {chatExtraction.purpose}</p>}
                      {chatExtraction.organization && <p>Organization: {chatExtraction.organization}</p>}
                    </div>
                  )}
                  {chatAlternativeRoomIds !== null && chatRoomSuggestions.length === 0
                    ? <p className="mt-2 text-xs text-amber-800">No similar rooms are available in the live room list for that schedule. Try another time or room.</p>
                    : chatExtraction.roomQuery && chatRoomSuggestions.length === 0 && <p className="mt-2 text-xs text-amber-800">No live rooms match yet. Try another room name or describe a room type.</p>}
                  {!chatReservationDetailsMinimized && chatAvailability && <p className={`mt-2 text-xs ${chatAvailability.available ? 'text-emerald-800' : 'text-rose-800'}`}>{chatAvailability.message}</p>}
                  {!chatReservationDetailsMinimized && chatSelectedRoomId && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={chatBusy} onClick={() => void previewChatAvailability()} className="rounded-lg border border-[#a12124]/25 px-3.5 py-2.5 text-xs font-bold text-[#8f1d20] disabled:opacity-50">Preview availability</button>
                      <button type="button" disabled={!chatAvailability?.available || chatBusy || !canCheckReservationChatAvailability(chatExtraction, Boolean(chatSelectedRoomId))} onClick={() => {
                        if (!chatExtraction) return;
                        onChatReservationHandoff({ ...chatExtraction, roomId: chatSelectedRoomId });
                        setIsOpen(false);
                      }} className="rounded-lg bg-[#a12124] px-3.5 py-2.5 text-xs font-bold text-white disabled:opacity-45">Continue to reservation form</button>
                    </div>
                  )}
                </>
              )}
              {chatError && <p className="mb-2 text-xs text-rose-700" role="alert">{chatError}</p>}
              <form className="mt-2 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void submitReservationChat(); }}>
                <label htmlFor="assistant-reservation-chat" className="sr-only">Describe your reservation</label>
                <textarea id="assistant-reservation-chat" value={chatInput} onChange={(event) => setChatInput(event.target.value)} maxLength={300} rows={2} placeholder="e.g. I need a classroom at Digital Campus tomorrow from 2 to 4 pm" className="min-w-0 flex-1 resize-none rounded-xl border border-black/12 bg-[#f8f4ef] px-3 py-2 text-sm outline-none focus:border-[#a12124]/55" />
                <button type="submit" disabled={!chatInput.trim() || chatBusy} className="rounded-xl bg-[#a12124] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{chatBusy ? 'Working…' : 'Send'}</button>
              </form>
              <p className="mt-1 text-right text-[11px] text-black/45" aria-live="polite">{chatInput.length}/300</p>
              <p className="mt-1.5 text-[11px] text-black/55">Availability is preliminary; the reservation form checks everything again when you submit.</p>
            </div>
          ) : <div className="relative border-t border-black/8 bg-white px-4 pt-3">
            <label htmlFor="assistant-room-search" className="sr-only">
              Search rooms by name
            </label>
            <div className="flex items-center gap-2">
              <input
                id="assistant-room-search"
                type="text"
                value={roomSearchQuery}
                onChange={(event) => handleRoomSearchChange(event.target.value)}
                onKeyDown={handleRoomSearchKeyDown}
                onFocus={() => {
                  if (roomSearchQuery.trim().length >= 2) {
                    setRoomSuggestionsOpen(true);
                  }
                }}
                placeholder="Type a room name to search"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={roomSuggestionsOpen && roomSearchQuery.trim().length >= 2}
                aria-controls={
                  roomSuggestionsOpen && roomSearchQuery.trim().length >= 2
                    ? 'assistant-room-suggestions'
                    : undefined
                }
                aria-activedescendant={
                  activeRoomSuggestionIndex >= 0
                    ? `assistant-room-option-${activeRoomSuggestionIndex}`
                    : undefined
                }
                className="min-w-0 flex-1 rounded-xl border border-black/12 bg-[#f8f4ef] px-3 py-2.5 text-xs text-black outline-none transition focus:border-[#a12124]/55 focus:ring-2 focus:ring-[#a12124]/15"
              />
              {roomSuggestionsOpen && roomSearchQuery.trim().length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setRoomSuggestionsOpen(false);
                    setActiveRoomSuggestionIndex(-1);
                  }}
                  className="shrink-0 rounded-lg px-2 py-2 text-[10px] font-bold text-[#8f1d20] hover:bg-[#a12124]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a12124]"
                  aria-label="Dismiss room suggestions"
                >
                  Hide
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-[9px] leading-relaxed text-black/55">
              Availability is a live preview and is checked again when you submit the reservation.
            </p>

            {roomSuggestionsOpen && roomSearchQuery.trim().length >= 2 && (
              <div
                ref={roomSuggestionsRef}
                id="assistant-room-suggestions"
                role="listbox"
                aria-label="Matching rooms"
                className="absolute bottom-[calc(100%+0.5rem)] left-4 right-4 z-20 max-h-56 overflow-y-auto rounded-2xl border border-black/10 bg-white p-1.5 shadow-[0_16px_40px_rgba(37,22,17,0.2)]"
              >
                {roomSuggestions.length > 0 ? (
                  roomSuggestions.map((room, index) => {
                    const campus = inferCampusFromBuilding({
                      id: room.originalRoom.buildingId,
                      name: room.originalRoom.buildingName,
                    });
                    const serverCheck = roomSuggestionChecks[room.roomId];
                    const availability = serverCheck &&
                      serverCheck.date === timeslot.date &&
                      serverCheck.startTime === timeslot.startTime &&
                      serverCheck.endTime === timeslot.endTime
                        ? serverCheck.available
                        : null;
                    const availabilityCheckError = availability === null && serverCheck?.error &&
                      serverCheck.date === timeslot.date &&
                      serverCheck.startTime === timeslot.startTime &&
                      serverCheck.endTime === timeslot.endTime;
                    const campusTimeIsValid = isQuickReservationTimeRangeValid(
                      campus,
                      timeslot.startTime ?? '',
                      timeslot.endTime ?? '',
                      quickTimeRanges
                    );
                    const administrativelyUnavailable = isRoomAdministrativelyUnavailable(room.status);
                    const isActive = index === activeRoomSuggestionIndex;
                    const availabilityBadgeClass = administrativelyUnavailable
                      ? 'bg-red-100 text-red-800'
                      : availability === true
                        ? 'bg-emerald-100 text-emerald-800'
                        : availability === false
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-black/6 text-black/65';

                    return (
                      <button
                        id={`assistant-room-option-${index}`}
                        key={room.roomId}
                        type="button"
                        disabled={administrativelyUnavailable}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => { if (!administrativelyUnavailable) setActiveRoomSuggestionIndex(index); }}
                        onClick={() => selectAutocompleteRoom(room)}
                        className={`block w-full rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a12124] ${
                          administrativelyUnavailable
                            ? 'cursor-not-allowed opacity-70'
                            : isActive ? 'bg-[#a12124]/10' : 'hover:bg-[#a12124]/6'
                        }`}
                      >
                        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <span className="text-xs font-bold text-black">
                            {getRoomDisplayName(room)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${availabilityBadgeClass}`}
                          >
                            {administrativelyUnavailable
                              ? 'Unavailable for reservations'
                              : availability === true
                              ? 'Available · checked'
                              : availability === false
                                ? 'Unavailable'
                                : roomSuggestionAvailabilityKnown && !campusTimeIsValid
                                  ? 'Invalid campus timeslot'
                                : availabilityCheckError
                                  ? 'Availability check failed'
                                  : roomSuggestionAvailabilityKnown && index < 4
                                    ? 'Checking availability…'
                                    : roomSuggestionAvailabilityKnown
                                      ? 'Check availability on selection'
                                      : 'Availability unknown'}
                          </span>
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-black/65">
                          {[
                            campus ? getCampusName(campus) : 'Campus not available',
                            room.building || room.originalRoom.buildingId || 'Building not available',
                            room.type !== 'unknown' ? room.typeLabel : null,
                            room.capacity > 0 ? `Capacity ${room.capacity}` : null,
                            room.features.length > 0
                              ? `Facilities: ${room.features.join(', ')}`
                              : null,
                          ]
                            .filter((detail): detail is string => Boolean(detail))
                            .join(' · ')}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-3 text-xs text-black/65" aria-live="polite">
                    {dataLoading
                      ? 'Loading rooms…'
                      : dataError
                        ? 'Room suggestions are unavailable right now.'
                        : autocompleteRooms.length === 0 && !activeCampus
                          ? 'No rooms are available in the current live room data.'
                          : `No rooms match “${roomSearchQuery.trim()}”. Try another spelling.`}
                  </p>
                )}
              </div>
            )}
          </div>}

          <div className="border-t border-black/8 bg-white px-4 py-3 text-[10px] leading-relaxed text-black/62">
            {dataError
              ? dataError
              : dataLoading
              ? 'Loading live room and reservation data from Firebase...'
              : isBotTyping
                ? 'Reviewing room availability for you...'
                : step === 'entry'
                  ? selectedRoom
                    ? 'Use Check availability after you set the date and time.'
                    : 'Pick a room first, or start the guided preference flow.'
                  : step === 'campus'
                    ? 'Choose a campus so I can load the right rooms.'
                  : step === 'date'
                    ? 'Use the reservation form or Choose date & time for a specific date and time, or choose a future weekday.'
                    : step === 'date-time'
                      ? 'Choose a date and a 1-hour time slot, then search availability.'
                  : step === 'features'
                    ? 'Choose any features you want, then press Done.'
                    : step === 'timeslot-suggestions'
                      ? 'Pick a suggested slot to update the reservation form.'
                      : step === 'unavailable-actions'
                        ? 'Choose whether to try another slot or see other rooms.'
                        : 'Use Select to jump straight to a suggested room.'}
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            if (!activeCampus) {
              onOpenWithoutCampus();
            }

            setIsOpen(true);
          }}
          className="assistant-bubble-button assistant-float fixed bottom-5 right-5 z-40 flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full border border-white/55 shadow-[0_18px_38px_rgba(122,25,28,0.34)] transition-all hover:-translate-y-1 md:bottom-6 md:right-6"
          aria-label="Open room assistant"
        >
          <svg
            aria-hidden="true"
            className="h-8 w-8 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M7.75 5.75h8.5A3.75 3.75 0 0 1 20 9.5v4a3.75 3.75 0 0 1-3.75 3.75h-3.92l-3.58 2.9v-2.9h-1A3.75 3.75 0 0 1 4 13.5v-4a3.75 3.75 0 0 1 3.75-3.75Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M8.4 10.15h7.2"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
            <path
              d="M8.4 13.3h4.6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      )}
    </>
  );
}
