import {
  createRoomRecommendationEngine,
  exampleRooms,
  exampleTimeslot,
  findBestRooms,
  recommendRooms,
} from './roomRecommendations.js';

export const CHAT_STEPS = {
  ASK_CAPACITY: 'ask-capacity',
  ASK_FEATURES: 'ask-features',
  ASK_TYPE: 'ask-type',
  COMPLETED: 'completed',
  IDLE: 'idle',
  SHOW_RECOMMENDATIONS: 'show-recommendations',
};

const DEFAULT_AVAILABILITY_CHECKER = () => true;
const DEFAULT_PREFERENCES = {
  minCapacity: undefined,
  preferredBuilding: '',
  preferredType: '',
  requiredFeatures: [],
};

let messageCounter = 0;

function createMessageId() {
  messageCounter += 1;
  return `room-assistant-message-${messageCounter}`;
}

function normalizeFeatures(features) {
  if (!Array.isArray(features)) {
    return [];
  }

  return [
    ...new Set(
      features
        .filter((feature) => typeof feature === 'string' && feature.trim().length > 0)
        .map((feature) => feature.trim())
    ),
  ];
}

function createButton(label, value) {
  return {
    label,
    value
  };
}

function createSystemMessage(text, overrides = {}) {
  return {
    id: createMessageId(),
    role: 'system',
    text,
    type: 'text',
    ...overrides,
  };
}

function createUserSelectionMessage(text, overrides = {}) {
  return {
    id: createMessageId(),
    role: 'user',
    selectionType: 'button',
    text,
    type: 'selection',
    ...overrides,
  };
}

function createButtonMessage(text, options, overrides = {}) {
  return createSystemMessage(text, {
    options,
    type: 'buttons',
    ...overrides,
  });
}

function getAvailabilityChecker(availabilityChecker) {
  return typeof availabilityChecker === 'function'
    ? availabilityChecker
    : DEFAULT_AVAILABILITY_CHECKER;
}

function getTypeButtons() {
  return [
    createButton('Glass', 'glass'),
    createButton('Lecture', 'lecture'),
    createButton('Lab', 'lab'),
    createButton('No preference', ''),
  ];
}

function getCapacityButtons(rooms) {
  const sortedCapacities = [
    ...new Set(
      (Array.isArray(rooms) ? rooms : [])
        .map((room) => room.capacity)
        .filter((capacity) => typeof capacity === 'number' && Number.isFinite(capacity))
    ),
  ].sort((left, right) => left - right);

  return [
    ...sortedCapacities.slice(0, 6).map((capacity) => createButton(`${capacity} people`, capacity)),
    createButton('Any size', ''),
  ];
}

function getFeatureButtons(rooms) {
  const features = [
    ...new Set(
      (Array.isArray(rooms) ? rooms : []).flatMap((room) => normalizeFeatures(room.features))
    ),
  ].sort((left, right) => left.localeCompare(right));

  return features.map((feature) => createButton(feature, feature));
}

function formatSelectedType(preferredType) {
  return preferredType ? `${preferredType} room` : 'No preference';
}

function formatSelectedCapacity(minCapacity) {
  return minCapacity ? `${minCapacity} people` : 'Any size';
}

function formatSelectedFeatures(features) {
  const normalizedFeatures = normalizeFeatures(features);

  if (normalizedFeatures.length === 0) {
    return 'No specific features';
  }

  if (normalizedFeatures.length === 1) {
    return normalizedFeatures[0];
  }

  if (normalizedFeatures.length === 2) {
    return `${normalizedFeatures[0]} and ${normalizedFeatures[1]}`;
  }

  return `${normalizedFeatures.slice(0, -1).join(', ')}, and ${normalizedFeatures[normalizedFeatures.length - 1]}`;
}

function buildRecommendationCards(recommendations) {
  return (Array.isArray(recommendations) ? recommendations : []).map((recommendation) => ({
    building: recommendation.building,
    capacity: recommendation.capacity,
    explanation: recommendation.reason,
    features: normalizeFeatures(recommendation.features),
    label: recommendation.label,
    roomId: recommendation.roomId,
    score: recommendation.score,
    type: recommendation.type,
  }));
}

function createRecommendationMessages(recommendations, introText, emptyText) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return [
      createSystemMessage(
        emptyText ||
          'I could not find any available rooms for that request. Try another time slot or loosen one preference.'
      ),
    ];
  }

  return [
    createSystemMessage(introText, {
      recommendations: buildRecommendationCards(recommendations),
      type: 'recommendations',
    }),
  ];
}

function createFeaturePromptMessage(rooms) {
  return createButtonMessage('Any features I should prioritize?', [
    ...getFeatureButtons(rooms),
    createButton('Done', '__done__'),
  ], {
    allowMultiple: true,
  });
}

function createTypeAcknowledgement(preferredType) {
  if (!preferredType) {
    return 'Got it \u{1F44D} no specific room type. How many people?';
  }

  return `Got it \u{1F44D} a ${preferredType} room. How many people?`;
}

function createCapacityAcknowledgement(minCapacity) {
  if (typeof minCapacity === 'number' && Number.isFinite(minCapacity)) {
    return `Nice, around ${minCapacity} people.`;
  }

  return 'Nice, keeping the group size flexible.';
}

export function createInitialRoomAssistantState() {
  return {
    messages: [],
    preferences: {
      ...DEFAULT_PREFERENCES,
      requiredFeatures: [],
    },
    recommendations: [],
    step: CHAT_STEPS.IDLE,
    timeslot: null,
  };
}

export function handleUnavailableRoom(
  selectedRoom,
  timeslot,
  rooms,
  availabilityChecker
) {
  const isAvailable = getAvailabilityChecker(availabilityChecker);

  if (!selectedRoom) {
    return {
      messages: [createSystemMessage('Pick a room first and I can check whether it is free.')],
      recommendations: [],
      step: CHAT_STEPS.COMPLETED,
    };
  }

  if (isAvailable(selectedRoom.roomId, timeslot)) {
    return {
      messages: [
        createSystemMessage(
          `Good news \u{1F44D} Room ${selectedRoom.label || selectedRoom.roomId} is still available for that time.`
        ),
      ],
      recommendations: [selectedRoom],
      step: CHAT_STEPS.COMPLETED,
    };
  }

  const alternatives = recommendRooms(selectedRoom, timeslot, rooms, isAvailable);
  const recommendations = Array.isArray(alternatives) ? alternatives : [];

  return {
    messages: [
      createSystemMessage(
        `Ahh, Room ${selectedRoom.label || selectedRoom.roomId} is already reserved at that time \u{1F615}`
      ),
      ...createRecommendationMessages(
        recommendations,
        'Here are the top 3 available alternatives I found for you.',
        'I could not find another available room for that time. Try a different slot and I will check again.'
      ),
    ],
    recommendations,
    step: CHAT_STEPS.SHOW_RECOMMENDATIONS,
  };
}

export function startHelpMeChooseChat(timeslot) {
  return {
    messages: [
      createButtonMessage(
        'Sure \u{1F44D} What kind of room are you looking for?',
        getTypeButtons()
      ),
    ],
    preferences: {
      ...DEFAULT_PREFERENCES,
      requiredFeatures: [],
    },
    recommendations: [],
    step: CHAT_STEPS.ASK_TYPE,
    timeslot,
  };
}

export function createRoomAssistantChat(rooms, availabilityChecker) {
  const isAvailable = getAvailabilityChecker(availabilityChecker);
  const recommendationEngine = createRoomRecommendationEngine(isAvailable);
  let state = createInitialRoomAssistantState();

  function setState(nextState) {
    state = nextState;
    return state;
  }

  function getState() {
    return state;
  }

  function reset() {
    return setState(createInitialRoomAssistantState());
  }

  function handleUnavailable(selectedRoom, timeslot) {
    const result = handleUnavailableRoom(selectedRoom, timeslot, rooms, isAvailable);

    return setState({
      ...state,
      messages: [...state.messages, ...result.messages],
      recommendations: result.recommendations,
      step: result.step,
      timeslot,
    });
  }

  function startHelpMeChoose(timeslot) {
    return setState(startHelpMeChooseChat(timeslot));
  }

  function selectType(preferredType) {
    const nextPreferences = {
      ...state.preferences,
      preferredType,
    };

    return setState({
      ...state,
      messages: [
        ...state.messages,
        createUserSelectionMessage(formatSelectedType(preferredType)),
        createButtonMessage(
          createTypeAcknowledgement(preferredType),
          getCapacityButtons(rooms)
        ),
      ],
      preferences: nextPreferences,
      step: CHAT_STEPS.ASK_CAPACITY,
    });
  }

  function selectCapacity(minCapacity) {
    const normalizedCapacity =
      typeof minCapacity === 'number'
        ? minCapacity
        : typeof minCapacity === 'string' && minCapacity !== ''
          ? Number(minCapacity)
          : undefined;
    const nextPreferences = {
      ...state.preferences,
      minCapacity: Number.isFinite(normalizedCapacity) ? normalizedCapacity : undefined,
    };

    return setState({
      ...state,
      messages: [
        ...state.messages,
        createUserSelectionMessage(formatSelectedCapacity(nextPreferences.minCapacity)),
        createSystemMessage(createCapacityAcknowledgement(nextPreferences.minCapacity)),
        createFeaturePromptMessage(rooms),
      ],
      preferences: nextPreferences,
      step: CHAT_STEPS.ASK_FEATURES,
    });
  }

  function finishFeatureSelection(features = []) {
    const nextPreferences = {
      ...state.preferences,
      requiredFeatures: normalizeFeatures(features),
    };
    const recommendations = recommendationEngine.findBestRooms(
      nextPreferences,
      state.timeslot,
      rooms
    );

    return setState({
      ...state,
      messages: [
        ...state.messages,
        createUserSelectionMessage(formatSelectedFeatures(nextPreferences.requiredFeatures)),
        createSystemMessage('Perfect \u{1F44D} Let me find the best rooms for you...'),
        ...createRecommendationMessages(
          recommendations,
          'Here are the top 3 rooms I found for you.',
          'I could not find an available room that matched those preferences. Try removing a feature or changing the time.'
        ),
      ],
      preferences: nextPreferences,
      recommendations,
      step: CHAT_STEPS.SHOW_RECOMMENDATIONS,
    });
  }

  return {
    finishFeatureSelection,
    getState,
    handleUnavailableRoom(selectedRoom, timeslot) {
      return handleUnavailable(selectedRoom, timeslot);
    },
    reset,
    selectCapacity,
    selectType,
    startHelpMeChoose,
  };
}

export const sampleRooms = exampleRooms;
export const sampleTimeslot = exampleTimeslot;

export function runRoomAssistantExamples() {
  const availabilityByRoomId = {
    'glass-101': false,
    'glass-102': true,
    'lecture-105': true,
    'lecture-201': true,
    'lab-301': true,
  };
  const isAvailable = (roomId) => availabilityByRoomId[roomId] ?? true;
  const assistant = createRoomAssistantChat(sampleRooms, isAvailable);

  const unavailableConversation = assistant.handleUnavailableRoom(
    sampleRooms[0],
    sampleTimeslot
  ).messages;

  assistant.reset();
  assistant.startHelpMeChoose(sampleTimeslot);
  assistant.selectType('lecture');
  assistant.selectCapacity(30);
  const helpConversation = assistant.finishFeatureSelection(['AC', 'Projector']).messages;

  return {
    helpMeChooseConversation: helpConversation,
    unavailableRoomConversation: unavailableConversation,
  };
}

export function runDirectFindBestRoomsExample(preferences, timeslot, rooms, availabilityChecker) {
  return findBestRooms(preferences, timeslot, rooms, availabilityChecker);
}
