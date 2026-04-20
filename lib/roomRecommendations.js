/**
 * @typedef {Object} RecommendationRoom
 * @property {string} roomId
 * @property {string} type
 * @property {number} capacity
 * @property {string} building
 * @property {string[]} features
 * @property {number} sentimentScore
 * @property {string=} label
 * @property {unknown=} originalRoom
 */

/**
 * @typedef {Object} RoomPreferences
 * @property {string=} preferredType
 * @property {number=} minCapacity
 * @property {string[]=} requiredFeatures
 * @property {string=} preferredBuilding
 */

const DEFAULT_SENTIMENT_SCORE = 0;
const MAX_RESULTS = 3;
const DEFAULT_AVAILABILITY_CHECKER = () => true;

let sharedAvailabilityChecker = DEFAULT_AVAILABILITY_CHECKER;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function clampSentimentScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return DEFAULT_SENTIMENT_SCORE;
  }

  return Math.max(-1, Math.min(1, score));
}

function normalizeFeatures(features) {
  if (!Array.isArray(features)) {
    return [];
  }

  return [...new Set(features
    .filter((feature) => typeof feature === 'string' && feature.trim().length > 0)
    .map((feature) => feature.trim()))];
}

function getUniqueRooms(rooms) {
  const uniqueRooms = [];
  const seenRoomIds = new Set();

  for (const room of Array.isArray(rooms) ? rooms : []) {
    if (!room || typeof room.roomId !== 'string') {
      continue;
    }

    const normalizedRoomId = room.roomId.trim();

    if (!normalizedRoomId || seenRoomIds.has(normalizedRoomId)) {
      continue;
    }

    seenRoomIds.add(normalizedRoomId);
    uniqueRooms.push({
      ...room,
      roomId: normalizedRoomId,
    });
  }

  return uniqueRooms;
}

function getMatchingFeatures(referenceFeatures, candidateFeatures) {
  const candidateFeatureMap = new Map(
    normalizeFeatures(candidateFeatures).map((feature) => [normalizeText(feature), feature])
  );

  return normalizeFeatures(referenceFeatures).filter((feature) =>
    candidateFeatureMap.has(normalizeText(feature))
  );
}

function sortByScore(left, right) {
  const scoreDifference = right.score - left.score;

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const sentimentDifference =
    clampSentimentScore(right.sentimentScore) - clampSentimentScore(left.sentimentScore);

  if (sentimentDifference !== 0) {
    return sentimentDifference;
  }

  return left.roomId.localeCompare(right.roomId);
}

function toTypeLabel(type) {
  return typeof type === 'string' && type.trim().length > 0 ? type.trim() : 'room';
}

function joinReasons(reasons) {
  if (reasons.length === 0) {
    return '';
  }

  if (reasons.length === 1) {
    return reasons[0];
  }

  if (reasons.length === 2) {
    return `${reasons[0]} and ${reasons[1]}`;
  }

  return `${reasons.slice(0, -1).join(', ')}, and ${reasons[reasons.length - 1]}`;
}

function buildReasonText(reasons) {
  const details = joinReasons(reasons.filter(Boolean));

  if (!details) {
    return 'Recommended because it is available at your selected time.';
  }

  return `Recommended because ${details}. It is available at your selected time.`;
}

function hasPreferenceShape(input) {
  if (!input || typeof input !== 'object') {
    return false;
  }

  return (
    'preferredType' in input ||
    'minCapacity' in input ||
    'requiredFeatures' in input ||
    'preferredBuilding' in input
  );
}

function getAvailabilityChecker(customChecker) {
  return typeof customChecker === 'function' ? customChecker : sharedAvailabilityChecker;
}

function scoreAutoRecommendation(selectedRoom, room) {
  let score = 0;

  if (normalizeText(room.type) === normalizeText(selectedRoom.type)) {
    score += 3;
  }

  if (room.capacity >= selectedRoom.capacity) {
    score += 2;
  }

  if (normalizeText(room.building) === normalizeText(selectedRoom.building)) {
    score += 1;
  }

  score += getMatchingFeatures(selectedRoom.features, room.features).length;
  score += clampSentimentScore(room.sentimentScore) * 2;

  return score;
}

function scorePreferenceRecommendation(preferences, room) {
  let score = 0;

  if (
    preferences.preferredType &&
    normalizeText(room.type) === normalizeText(preferences.preferredType)
  ) {
    score += 3;
  }

  if (
    typeof preferences.minCapacity === 'number' &&
    room.capacity >= preferences.minCapacity
  ) {
    score += 2;
  }

  if (
    preferences.preferredBuilding &&
    normalizeText(room.building) === normalizeText(preferences.preferredBuilding)
  ) {
    score += 1;
  }

  score += getMatchingFeatures(preferences.requiredFeatures, room.features).length;
  score += clampSentimentScore(room.sentimentScore) * 2;

  return score;
}

function buildAutoRecommendationReason(selectedRoom, recommendedRoom) {
  const reasons = [];
  const matchingFeatures = getMatchingFeatures(selectedRoom.features, recommendedRoom.features);

  if (normalizeText(selectedRoom.type) === normalizeText(recommendedRoom.type)) {
    reasons.push(`it is also a ${toTypeLabel(recommendedRoom.type)} room`);
  }

  if (recommendedRoom.capacity >= selectedRoom.capacity) {
    reasons.push('it matches your preferred capacity');
  }

  if (normalizeText(selectedRoom.building) === normalizeText(recommendedRoom.building)) {
    reasons.push('it is in the same building');
  }

  if (matchingFeatures.length > 0) {
    reasons.push(`it includes ${joinReasons(matchingFeatures)}`);
  }

  if (reasons.length === 0 && clampSentimentScore(recommendedRoom.sentimentScore) > 0) {
    reasons.push('it has strong recent feedback');
  }

  return buildReasonText(reasons);
}

function buildPreferenceReason(preferences, recommendedRoom) {
  const reasons = [];
  const matchingFeatures = getMatchingFeatures(
    preferences.requiredFeatures,
    recommendedRoom.features
  );

  if (
    preferences.preferredType &&
    normalizeText(preferences.preferredType) === normalizeText(recommendedRoom.type)
  ) {
    reasons.push(`it matches your preferred ${toTypeLabel(recommendedRoom.type)} room type`);
  }

  if (
    typeof preferences.minCapacity === 'number' &&
    recommendedRoom.capacity >= preferences.minCapacity
  ) {
    reasons.push('it meets your preferred capacity');
  }

  if (
    preferences.preferredBuilding &&
    normalizeText(preferences.preferredBuilding) === normalizeText(recommendedRoom.building)
  ) {
    reasons.push(`it is in ${recommendedRoom.building}`);
  }

  if (matchingFeatures.length > 0) {
    reasons.push(`it includes ${joinReasons(matchingFeatures)}`);
  }

  if (reasons.length === 0 && clampSentimentScore(recommendedRoom.sentimentScore) > 0) {
    reasons.push('it has strong recent feedback');
  }

  return buildReasonText(reasons);
}

function createRecommendationResult(room, score, reason) {
  return {
    ...room,
    score,
    reason,
  };
}

export function setRoomAvailabilityChecker(checker) {
  sharedAvailabilityChecker =
    typeof checker === 'function' ? checker : DEFAULT_AVAILABILITY_CHECKER;
}

export function resetRoomAvailabilityChecker() {
  sharedAvailabilityChecker = DEFAULT_AVAILABILITY_CHECKER;
}

export function generateReason(reference, recommendedRoom) {
  if (!recommendedRoom) {
    return 'Recommended because it is available at your selected time.';
  }

  if (hasPreferenceShape(reference)) {
    return buildPreferenceReason(reference, recommendedRoom);
  }

  return buildAutoRecommendationReason(reference, recommendedRoom);
}

export function recommendRooms(
  selectedRoom,
  timeslot,
  rooms,
  availabilityChecker
) {
  if (!selectedRoom) {
    return [];
  }

  const isAvailable = getAvailabilityChecker(availabilityChecker);

  if (isAvailable(selectedRoom.roomId, timeslot)) {
    return selectedRoom;
  }

  return getUniqueRooms(rooms)
    .filter((room) => room.roomId !== selectedRoom.roomId)
    .filter((room) => isAvailable(room.roomId, timeslot))
    .map((room) =>
      createRecommendationResult(
        room,
        scoreAutoRecommendation(selectedRoom, room),
        generateReason(selectedRoom, room)
      )
    )
    .sort(sortByScore)
    .slice(0, MAX_RESULTS);
}

export function findBestRooms(
  preferences,
  timeslot,
  rooms,
  availabilityChecker
) {
  const isAvailable = getAvailabilityChecker(availabilityChecker);
  const normalizedPreferences = {
    preferredType: preferences?.preferredType,
    minCapacity: preferences?.minCapacity,
    preferredBuilding: preferences?.preferredBuilding,
    requiredFeatures: normalizeFeatures(preferences?.requiredFeatures),
  };

  return getUniqueRooms(rooms)
    .filter((room) => isAvailable(room.roomId, timeslot))
    .map((room) =>
      createRecommendationResult(
        room,
        scorePreferenceRecommendation(normalizedPreferences, room),
        generateReason(normalizedPreferences, room)
      )
    )
    .sort(sortByScore)
    .slice(0, MAX_RESULTS);
}

export function createRoomRecommendationEngine(availabilityChecker) {
  return {
    findBestRooms(preferences, timeslot, rooms) {
      return findBestRooms(preferences, timeslot, rooms, availabilityChecker);
    },
    recommendRooms(selectedRoom, timeslot, rooms) {
      return recommendRooms(selectedRoom, timeslot, rooms, availabilityChecker);
    },
  };
}

export const exampleRooms = [
  {
    roomId: 'glass-101',
    type: 'glass',
    capacity: 8,
    building: 'Innovation Hub',
    features: ['AC', 'Projector', 'Whiteboard'],
    sentimentScore: 0.7,
    label: 'Glass Room 101',
  },
  {
    roomId: 'glass-102',
    type: 'glass',
    capacity: 10,
    building: 'Innovation Hub',
    features: ['AC', 'Projector'],
    sentimentScore: 0.65,
    label: 'Glass Room 102',
  },
  {
    roomId: 'lecture-201',
    type: 'lecture',
    capacity: 40,
    building: 'Main Building',
    features: ['AC', 'Projector', 'Sound System'],
    sentimentScore: 0.45,
    label: 'Lecture Room 201',
  },
  {
    roomId: 'lab-301',
    type: 'lab',
    capacity: 24,
    building: 'Engineering Annex',
    features: ['AC', 'Projector', 'Computers'],
    sentimentScore: 0.8,
    label: 'Computer Lab 301',
  },
  {
    roomId: 'lecture-105',
    type: 'lecture',
    capacity: 30,
    building: 'Innovation Hub',
    features: ['AC', 'Whiteboard'],
    sentimentScore: 0.2,
    label: 'Lecture Room 105',
  },
];

export const exampleTimeslot = {
  date: '2026-04-21',
  startTime: '09:00',
  endTime: '10:00',
};

export const examplePreferences = {
  preferredType: 'lecture',
  minCapacity: 25,
  requiredFeatures: ['AC', 'Projector'],
  preferredBuilding: 'Main Building',
};

export function runRecommendationExamples() {
  const availabilityByRoomId = {
    'glass-101': false,
    'glass-102': true,
    'lecture-201': true,
    'lab-301': true,
    'lecture-105': true,
  };

  const isAvailable = (roomId) => availabilityByRoomId[roomId] ?? true;
  const recommendationEngine = createRoomRecommendationEngine(isAvailable);

  return {
    autoRecommendationExample: recommendationEngine.recommendRooms(
      exampleRooms[0],
      exampleTimeslot,
      exampleRooms
    ),
    helpMeChooseExample: recommendationEngine.findBestRooms(
      examplePreferences,
      exampleTimeslot,
      exampleRooms
    ),
  };
}
