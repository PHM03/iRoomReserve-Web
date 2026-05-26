'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  ASSISTANT_FEATURE_OPTIONS,
  ASSISTANT_ROOM_TYPE_OPTIONS,
  checkAssistantRoomAvailability,
  findAlternativeAssistantRooms,
  findAssistantRoomMatches,
  formatAssistantTimeslot,
  getAssistantRoomTypeLabel,
  getFallbackPreferencesFromRoom,
  isCompleteTimeslot,
  suggestAssistantTimeslotsForRoom,
  type AssistantAvailabilityResult,
  type AssistantPreferences,
  type AssistantRecommendation,
  type AssistantRoomRecord,
  type AssistantTimeslot,
  type AssistantTimeslotSuggestion,
  type AssistantRoomTypeValue,
} from '@/lib/ai/roomAssistantRealtime';
import { getCampusName } from '@/lib/buildings/campusAssignments';
import type { ReservationCampus } from '@/lib/buildings/campuses';

type AssistantOptionValue =
  | number
  | string
  | AssistantTimeslotSuggestion;

type AssistantOption = {
  label: string;
  value: AssistantOptionValue;
};

type AssistantMessage = {
  allowMultiple?: boolean;
  id: string;
  options?: AssistantOption[];
  recommendations?: AssistantRecommendation[];
  role: 'system' | 'user';
  text: string;
  type: 'buttons' | 'feature-picker' | 'recommendations' | 'text';
};

type AssistantStep =
  | 'campus'
  | 'capacity'
  | 'entry'
  | 'features'
  | 'results'
  | 'timeslot-suggestions'
  | 'type'
  | 'unavailable-actions';

interface RoomAssistantWidgetProps {
  activeCampus?: ReservationCampus | null;
  campusTimeRange?: { endMinutes: number; startMinutes: number } | null;
  dataLoading?: boolean;
  onOpenWithoutCampus: () => void;
  onSelectCampus: (campus: ReservationCampus) => void;
  onSelectRoom: (roomId: string) => void;
  onSelectTimeslot: (timeslot: Required<AssistantTimeslot>) => void;
  reservations: ReadonlyArray<{
    date: string;
    endTime: string;
    id: string;
    roomId: string;
    roomName: string;
    startTime: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  }>;
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
    label: 'SDCA Digi Campus',
    value: 'digi'
  },
];

const ENTRY_OPTIONS: AssistantOption[] = [
  {
    label: 'Check availability',
    value: 'check-selected-room'
  },
  {
    label: 'Help me choose',
    value: 'help-me-choose'
  },
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
    'Which campus are you looking for? SDCA Main Campus or SDCA Digi Campus?',
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
  return createMessage('Checking live Firebase room data for you...', 'system', 'text');
}

function createRecommendationMessage(
  recommendations: AssistantRecommendation[],
  introText: string,
  emptyText: string
) {
  if (recommendations.length === 0) {
    return createMessage(emptyText, 'system', 'text');
  }

  return createMessage(introText, 'system', 'recommendations', { recommendations });
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
  onOpenWithoutCampus,
  onSelectCampus,
  onSelectRoom,
  onSelectTimeslot,
  reservations,
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
  const [messages, setMessages] = useState<AssistantMessage[]>([
    initialConversation.initialMessage,
  ]);
  const [preferences, setPreferences] = useState<AssistantPreferences>({ requiredFeatures: [] });
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [step, setStep] = useState<AssistantStep>('entry');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(
    initialConversation.activePromptId
  );
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const replyTimeoutsRef = useRef<number[]>([]);

  const capacityOptions = useMemo(() => buildCapacityOptions(rooms), [rooms]);
  const featureOptions = useMemo(() => buildFeatureOptions(rooms), [rooms]);

  function clearReplyTimers() {
    replyTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    replyTimeoutsRef.current = [];
    setIsBotTyping(false);
  }

  function resetConversation() {
    const nextEntryMessage = createEntryPromptMessage(selectedRoom, timeslot);

    clearReplyTimers();
    setMessages([nextEntryMessage]);
    setPreferences({ requiredFeatures: [] });
    setSelectedFeatures([]);
    setStep('entry');
    setActivePromptId(nextEntryMessage.id);
  }

  function appendUserMessage(text: string) {
    const message = createMessage(text, 'user', 'text');
    setMessages((currentMessages) => [...currentMessages, message]);
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
    appendUserMessage('Help me choose');

    if (!activeCampus) {
      setStep('campus');
      queueBotMessages([createCampusPromptMessage()]);
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
    setStep('type');
    queueBotMessages([createTypePromptMessage()]);
  }

  function handleCampusSelection(value: ReservationCampus) {
    onSelectCampus(value);
    setPreferences({ requiredFeatures: [] });
    setSelectedFeatures([]);
    setStep('type');
    appendUserMessage(getCampusName(value));
    queueBotMessages([
      createMessage(
        `Got it, I will look in ${getCampusName(value)}.`,
        'system',
        'text'
      ),
      createTypePromptMessage(),
    ]);
  }

  function handleSelectedRoomCheck() {
    appendUserMessage('Check availability');

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
      reservations
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

  function handleFeatureSubmit() {
    if (!activeCampus) {
      setStep('campus');
      queueBotMessages([createCampusPromptMessage()]);
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
    const recommendations = findAssistantRoomMatches(
      rooms,
      reservations,
      timeslot,
      nextPreferences
    );

    setPreferences(nextPreferences);
    setStep('results');
    appendUserMessage(formatFeatureSummary(nextPreferences.requiredFeatures));
    queueBotMessages([
      createSearchMessage(),
      createRecommendationMessage(
        recommendations,
        'Here are the matching rooms I found right now:',
        'I could not find a matching room right now. Try removing one feature or changing the date and time.'
      ),
    ]);
  }

  function handleUnavailableAction(value: string) {
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
        campusTimeRange
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
      resolvedPreferences
    );

    queueBotMessages([
      createSearchMessage(),
      createRecommendationMessage(
        recommendations,
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
        handleFeatureSubmit();
        return;
      }

      handleFeatureToggle(String(option.value));
      return;
    }

    if (step === 'unavailable-actions') {
      handleUnavailableAction(String(option.value));
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
    onSelectRoom(recommendation.roomId);
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

  return (
    <>
      {isOpen && (
        <div className="assistant-chat-shell assistant-pop fixed bottom-4 right-4 z-40 flex h-[min(31rem,calc(100dvh-7rem))] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[28px] border border-[var(--assistant-outline)] md:bottom-6 md:right-6 md:h-[min(32rem,calc(100dvh-8.5rem))] md:w-[22.5rem]">
          <div className="border-b border-black/8 bg-[linear-gradient(135deg,#a12124_0%,#7a191c_100%)] px-4 py-3 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">Room Recommendation Assistant</p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/78">
                  Manual room checks and live Firebase recommendations
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={resetConversation}
                  className="rounded-full border border-white/18 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-white/18"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/18 bg-white/10 text-white transition-colors hover:bg-white/18"
                  aria-label="Close room assistant"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

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
                    className={`max-w-[85%] rounded-[24px] px-4 py-3 text-sm shadow-sm ${
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
                            className="rounded-full border border-[#a12124]/18 bg-[#a12124]/8 px-3 py-2 text-left text-xs font-bold text-[#8f1d20] transition-all hover:-translate-y-0.5 hover:bg-[#a12124]/14 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
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
                              <span className="rounded-full border border-black/8 bg-white/85 px-2.5 py-1">
                                Capacity {recommendation.capacity}
                              </span>
                              <span className="rounded-full border border-black/8 bg-white/85 px-2.5 py-1">
                                {recommendation.building}
                              </span>
                              <span className="rounded-full border border-black/8 bg-white/85 px-2.5 py-1">
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

          <div className="border-t border-black/8 bg-white/65 px-4 py-3 text-[10px] leading-relaxed text-black/62">
            {dataLoading
              ? 'Loading live room and reservation data from Firebase...'
              : isBotTyping
                ? 'Reviewing room availability for you...'
                : step === 'entry'
                  ? selectedRoom
                    ? 'Use Check availability after you set the date and time.'
                    : 'Pick a room first, or start the guided preference flow.'
                  : step === 'campus'
                    ? 'Choose a campus so I can load the right rooms.'
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

            resetConversation();
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
