'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { handleUnavailableRoom } from '@/lib/roomAssistantChat';
import { findBestRooms } from '@/lib/roomRecommendations';

type AssistantOption = {
  label: string;
  value: number | string;
};

type RecommendationRoom = {
  building: string;
  capacity: number;
  features: string[];
  label?: string;
  roomId: string;
  sentimentScore: number;
  type: string;
};

type RecommendationResult = RecommendationRoom & {
  explanation?: string;
  reason?: string;
  score: number;
};

type AssistantMessage = {
  allowMultiple?: boolean;
  id: string;
  options?: AssistantOption[];
  recommendations?: RecommendationResult[];
  role: 'system' | 'user';
  text: string;
  type: 'buttons' | 'feature-picker' | 'recommendations' | 'text';
};

type RoomAssistantPreferences = {
  minCapacity?: number;
  preferredType?: string;
  requiredFeatures: string[];
};

type RoomAssistantStep = 'capacity' | 'entry' | 'features' | 'results' | 'type';

type RoomAssistantTimeslot = {
  date?: string;
  endTime?: string;
  startTime?: string;
};

type ExternalAssistantMessage = {
  allowMultiple?: boolean;
  options?: AssistantOption[];
  recommendations?: RecommendationResult[];
  role: 'system' | 'user';
  text: string;
  type?: string;
};

interface RoomAssistantWidgetProps {
  isAvailable?: (roomId: string, timeslot: RoomAssistantTimeslot) => boolean;
  onSelectRoom: (roomId: string) => void;
  rooms: RecommendationRoom[];
  selectedRoom?: RecommendationRoom | null;
  selectedRoomAvailable?: boolean | null;
  timeslot: RoomAssistantTimeslot;
}

const BOT_REPLY_DELAY_MS = 620;
const BOT_REPLY_GAP_MS = 760;
const DEFAULT_CAPACITY_CHOICES = [8, 12, 20, 40, 60];
const DEFAULT_FEATURE_OPTIONS = ['AC', 'Projector', 'Whiteboard'];
const ENTRY_OPTIONS: AssistantOption[] = [
  { label: 'Help me choose', value: 'help-me-choose' },
  { label: 'Check this room', value: 'check-selected-room' },
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

function createWelcomeMessage() {
  return createMessage(
    'Hi! I can help you choose a room through chat or check whether the room you picked is still free.',
    'system',
    'buttons',
    {
      options: ENTRY_OPTIONS,
    }
  );
}

function createTypePromptMessage() {
  return createMessage(
    'Sure \u{1F44D} What kind of room are you looking for?',
    'system',
    'buttons',
    {
      options: [
        { label: 'Glass', value: 'glass' },
        { label: 'Lecture', value: 'lecture' },
        { label: 'Lab', value: 'lab' },
        { label: 'No preference', value: '' },
      ],
    }
  );
}

function createCapacityPromptMessage(selectedType: string, options: AssistantOption[]) {
  if (!selectedType) {
    return createMessage(
      'Got it \u{1F44D} no specific room type. How many people?',
      'system',
      'buttons',
      {
        options,
      }
    );
  }

  return createMessage(
    `Got it \u{1F44D} a ${selectedType} room. How many people?`,
    'system',
    'buttons',
    {
      options,
    }
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
    options: [...options, { label: 'Done', value: '__done__' }],
  });
}

function createSearchMessage() {
  return createMessage(
    'Perfect \u{1F44D} Let me find the best rooms for you...',
    'system',
    'text'
  );
}

function createRecommendationMessage(
  recommendations: RecommendationResult[],
  introText: string
) {
  if (recommendations.length === 0) {
    return createMessage(
      'I could not find an available room that matches that just yet. Try another time slot or remove one feature.',
      'system',
      'text'
    );
  }

  return createMessage(introText, 'system', 'recommendations', {
    recommendations,
  });
}

function normalizeMessageType(type?: string): AssistantMessage['type'] {
  if (type === 'buttons' || type === 'feature-picker' || type === 'recommendations') {
    return type;
  }

  return 'text';
}

function normalizeExternalMessage(message: ExternalAssistantMessage): AssistantMessage {
  return createMessage(message.text, message.role, normalizeMessageType(message.type), {
    allowMultiple: message.allowMultiple,
    options: message.options,
    recommendations: message.recommendations,
  });
}

function toSentenceCaseType(type: string) {
  if (!type) {
    return 'Room';
  }

  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function getRoomDisplayName(room: { label?: string; roomId: string }) {
  return room.label || room.roomId;
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

function normalizeFeatures(features: string[]) {
  return [
    ...new Set(
      features
        .filter((feature) => typeof feature === 'string' && feature.trim().length > 0)
        .map((feature) => feature.trim())
    ),
  ];
}

function buildCapacityOptions(rooms: RecommendationRoom[]): AssistantOption[] {
  const uniqueCapacities = [
    ...new Set(
      rooms
        .map((room) => room.capacity)
        .filter((capacity) => typeof capacity === 'number' && Number.isFinite(capacity))
    ),
  ].sort((left, right) => left - right);
  const capacities =
    uniqueCapacities.length > 0
      ? uniqueCapacities.slice(0, 6)
      : DEFAULT_CAPACITY_CHOICES;

  return [
    ...capacities.map((capacity) => ({
      label: `${capacity} people`,
      value: capacity,
    })),
    { label: 'Any size', value: '' },
  ];
}

function buildFeatureOptions(rooms: RecommendationRoom[]): AssistantOption[] {
  const uniqueFeatures = [
    ...new Set(rooms.flatMap((room) => normalizeFeatures(room.features))),
  ].sort((left, right) => left.localeCompare(right));
  const features =
    uniqueFeatures.length > 0 ? uniqueFeatures : DEFAULT_FEATURE_OPTIONS;

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

export default function RoomAssistantWidget({
  isAvailable,
  onSelectRoom,
  rooms,
  selectedRoom = null,
  selectedRoomAvailable = null,
  timeslot,
}: Readonly<RoomAssistantWidgetProps>) {
  const welcomeMessage = useMemo(() => createWelcomeMessage(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([welcomeMessage]);
  const [preferences, setPreferences] = useState<RoomAssistantPreferences>({
    requiredFeatures: [],
  });
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [step, setStep] = useState<RoomAssistantStep>('entry');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(welcomeMessage.id);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const replyTimeoutsRef = useRef<number[]>([]);
  const lastAutoOpenKeyRef = useRef('');

  const capacityOptions = useMemo(() => buildCapacityOptions(rooms), [rooms]);
  const featureOptions = useMemo(() => buildFeatureOptions(rooms), [rooms]);
  const availabilityChecker = useMemo(
    () => (typeof isAvailable === 'function' ? isAvailable : () => true),
    [isAvailable]
  );
  const selectedRoomIsAvailable = useMemo(() => {
    if (!selectedRoom) {
      return false;
    }

    if (selectedRoomAvailable === false) {
      return false;
    }

    return availabilityChecker(selectedRoom.roomId, timeslot);
  }, [availabilityChecker, selectedRoom, selectedRoomAvailable, timeslot]);

  function clearReplyTimers() {
    replyTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    replyTimeoutsRef.current = [];
    setIsBotTyping(false);
  }

  function resetConversation() {
    const nextWelcomeMessage = createWelcomeMessage();

    clearReplyTimers();
    setMessages([nextWelcomeMessage]);
    setPreferences({ requiredFeatures: [] });
    setSelectedFeatures([]);
    setStep('entry');
    setActivePromptId(nextWelcomeMessage.id);
  }

  function appendUserMessage(text: string) {
    const message = createMessage(text, 'user', 'text');
    setMessages((currentMessages) => [...currentMessages, message]);
  }

  // Queue bot replies with a small gap so the chat feels conversational.
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
    setPreferences({ requiredFeatures: [] });
    setSelectedFeatures([]);
    setStep('type');
    appendUserMessage('Help me choose');
    queueBotMessages([createTypePromptMessage()]);
  }

  function handleSelectedRoomEntry() {
    appendUserMessage(
      selectedRoom ? `Check ${getRoomDisplayName(selectedRoom)}` : 'Check this room'
    );

    if (!selectedRoom) {
      setStep('entry');
      queueBotMessages([
        createMessage(
          'Pick a room from the list first, then I can check whether it is still available.',
          'system',
          'text'
        ),
      ]);
      return;
    }

    if (!selectedRoomIsAvailable) {
      setStep('results');
      const unavailableState = handleUnavailableRoom(
        selectedRoom,
        timeslot,
        rooms,
        availabilityChecker
      ) as {
        messages: ExternalAssistantMessage[];
      };

      queueBotMessages(unavailableState.messages.map(normalizeExternalMessage));
      return;
    }

    setStep('results');
    queueBotMessages([
      createMessage(
        `Good news \u{1F44D} ${getRoomDisplayName(selectedRoom)} looks available for that time.`,
        'system',
        'text'
      ),
    ]);
  }

  function handleTypeSelection(value: string) {
    const nextPreferences = {
      ...preferences,
      preferredType: value || undefined,
      requiredFeatures: [],
    };

    setPreferences(nextPreferences);
    setSelectedFeatures([]);
    setStep('capacity');
    appendUserMessage(value ? `${toSentenceCaseType(value)} room` : 'No preference');
    queueBotMessages([createCapacityPromptMessage(value, capacityOptions)]);
  }

  function handleCapacitySelection(value: number | string) {
    const minCapacity =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value !== ''
          ? Number(value)
          : undefined;
    const nextPreferences = {
      ...preferences,
      minCapacity: Number.isFinite(minCapacity) ? minCapacity : undefined,
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
    const normalizedSelectedFeatures = normalizeFeatures(selectedFeatures);
    const nextPreferences = {
      ...preferences,
      requiredFeatures: normalizedSelectedFeatures,
    };
    const recommendations = findBestRooms(
      nextPreferences,
      timeslot,
      rooms,
      availabilityChecker
    ) as RecommendationResult[];

    setPreferences(nextPreferences);
    setStep('results');
    appendUserMessage(formatFeatureSummary(normalizedSelectedFeatures));
    queueBotMessages([
      createSearchMessage(),
      createRecommendationMessage(
        recommendations,
        'Here are the top 3 rooms I recommend right now:'
      ),
    ]);
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

      handleSelectedRoomEntry();
      return;
    }

    if (step === 'type') {
      handleTypeSelection(String(option.value));
      return;
    }

    if (step === 'capacity') {
      handleCapacitySelection(option.value);
      return;
    }

    if (step === 'features') {
      if (option.value === '__done__') {
        handleFeatureSubmit();
        return;
      }

      handleFeatureToggle(String(option.value));
    }
  }

  function handleRecommendationClick(messageId: string, recommendation: RecommendationResult) {
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

  useEffect(() => {
    if (!selectedRoom || selectedRoomIsAvailable) {
      return;
    }

    const autoOpenKey = [
      selectedRoom.roomId,
      timeslot.date ?? '',
      timeslot.startTime ?? '',
      timeslot.endTime ?? '',
    ].join('|');

    if (lastAutoOpenKeyRef.current === autoOpenKey) {
      return;
    }

    lastAutoOpenKeyRef.current = autoOpenKey;
    const unavailableState = handleUnavailableRoom(
      selectedRoom,
      timeslot,
      rooms,
      availabilityChecker
    ) as {
      messages: ExternalAssistantMessage[];
    };
    const normalizedMessages = unavailableState.messages.map(normalizeExternalMessage);
    const [firstMessage, ...remainingMessages] = normalizedMessages;

    const frameId = window.requestAnimationFrame(() => {
      clearReplyTimers();
      setPreferences({ requiredFeatures: [] });
      setSelectedFeatures([]);
      setStep('results');
      setIsOpen(true);

      if (!firstMessage) {
        setMessages([]);
        setActivePromptId(null);
        return;
      }

      setMessages([firstMessage]);
      setActivePromptId(isInteractiveMessage(firstMessage) ? firstMessage.id : null);

      if (remainingMessages.length > 0) {
        setIsBotTyping(true);
        setActivePromptId(null);

        const nextInteractiveId = getLastInteractiveMessageId(remainingMessages);

        remainingMessages.forEach((message, index) => {
          const timeoutId = window.setTimeout(() => {
            setMessages((currentMessages) => [...currentMessages, message]);

            if (index === remainingMessages.length - 1) {
              setIsBotTyping(false);
              setActivePromptId(nextInteractiveId);
            }
          }, 780 + (index * BOT_REPLY_GAP_MS));

          replyTimeoutsRef.current.push(timeoutId);
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [availabilityChecker, rooms, selectedRoom, selectedRoomIsAvailable, timeslot]);

  return (
    <>
      {isOpen && (
        <div className="assistant-chat-shell assistant-pop fixed bottom-4 right-4 z-40 flex h-[min(31rem,calc(100dvh-7rem))] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[28px] border border-[var(--assistant-outline)] md:bottom-6 md:right-6 md:h-[min(32rem,calc(100dvh-8.5rem))] md:w-[22.5rem]">
          <div className="border-b border-black/8 bg-[linear-gradient(135deg,#a12124_0%,#7a191c_100%)] px-4 py-3 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold">Room Reservation Assistant</p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/78">
                  Quick chat help for room selection and backup suggestions
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
                            className="rounded-full border border-[#a12124]/18 bg-[#a12124]/8 px-3 py-2 text-xs font-bold text-[#8f1d20] transition-all hover:-translate-y-0.5 hover:bg-[#a12124]/14 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
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
                                  {toSentenceCaseType(recommendation.type)} room
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
                            </div>

                            <p className="mt-3 text-[11px] leading-relaxed text-black/78">
                              {recommendation.explanation || recommendation.reason}
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
            {isBotTyping
              ? 'Checking room matches for you...'
              : step === 'entry'
                ? 'Start with Help me choose or Check this room.'
                : step === 'features'
                  ? 'Tap any features you care about, then press Done.'
                  : step === 'results'
                    ? 'Use Select to jump straight to a recommended room.'
                    : 'Reply with the chat buttons to keep going.'}
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            if (messages.length === 0) {
              resetConversation();
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
