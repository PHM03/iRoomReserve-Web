import type { Reservation } from '../reservations/reservations';
import type { Room } from '../rooms/rooms';
import { formatDate, formatTimeRange } from '../utils/dateTime';

export type AssistantRoomTypeValue =
  | 'conference-room'
  | 'glass-room'
  | 'class-room'
  | 'specialized-room'
  | 'gymnasium'
  | 'open-area';

export interface AssistantTimeslot {
  date?: string;
  endTime?: string;
  startTime?: string;
}

export interface AssistantRoomFeatureRoom extends Room {
  features?: string[] | null;
  whiteboardStatus?: string | null;
}

export interface AssistantRoomRecord {
  building: string;
  capacity: number;
  features: string[];
  floor: string;
  label: string;
  roomId: string;
  sentimentScore: number;
  status: Room['status'];
  type: AssistantRoomTypeValue;
  typeLabel: string;
  originalRoom: AssistantRoomFeatureRoom;
}

export interface AssistantReservationRecord {
  date: string;
  endTime: string;
  id: string;
  roomId: string;
  roomName: string;
  startTime: string;
  status: Reservation['status'];
}

export interface AssistantPreferences {
  minCapacity?: number;
  preferredBuilding?: string;
  preferredType?: AssistantRoomTypeValue;
  requiredFeatures: string[];
}

export interface AssistantAvailabilityResult {
  availabilityLabel: 'available' | 'taken' | 'unavailable';
  available: boolean;
  conflictingReservations: AssistantReservationRecord[];
  roomStatus: Room['status'];
}

export interface AssistantRecommendation extends AssistantRoomRecord {
  reason: string;
  score: number;
}

export interface AssistantTimeslotSuggestion extends AssistantTimeslot {
  label: string;
}

export const ASSISTANT_ROOM_TYPE_OPTIONS: Array<{
  label: string;
  value: AssistantRoomTypeValue;
}> = [
  {
    label: 'Conference Room',
    value: 'conference-room'
  },
  {
    label: 'Glass Room',
    value: 'glass-room'
  },
  {
    label: 'Class Room',
    value: 'class-room'
  },
  {
    label: 'Specialized Room',
    value: 'specialized-room'
  },
  {
    label: 'Gymnasium',
    value: 'gymnasium'
  },
  {
    label: 'Open Area',
    value: 'open-area'
  },
];

export const ASSISTANT_FEATURE_OPTIONS = ['AC', 'Projector', 'Whiteboard'];
export const ASSISTANT_ROOMS_COLLECTION_PATH = 'rooms';
export const ASSISTANT_RESERVATIONS_COLLECTION_PATH = 'reservations';

const BLOCKING_RESERVATION_STATUSES: Reservation['status'][] = ['approved'];
const SCORE_LIMIT = 3;
const ASSISTANT_DEBUG_PREFIX = '[room-assistant]';

type AssistantFirestoreCollection =
  | typeof ASSISTANT_RESERVATIONS_COLLECTION_PATH
  | typeof ASSISTANT_ROOMS_COLLECTION_PATH;

interface AssistantResolvedField<T> {
  key: string | null;
  value: T | undefined;
}

function logAssistantDebug(label: string, payload: unknown) {
  console.log(`${ASSISTANT_DEBUG_PREFIX} ${label}`, payload);
}

function resolveRawField<T>(
  source: Record<string, unknown>,
  keys: readonly string[]
): AssistantResolvedField<T> {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) {
      return {
        key,
        value: value as T,
      };
    }
  }

  return {
    key: null,
    value: undefined,
  };
}

function resolveRawStringField(
  source: Record<string, unknown>,
  keys: readonly string[]
): AssistantResolvedField<string> {
  const resolvedField = resolveRawField<unknown>(source, keys);

  return {
    key: resolvedField.key,
    value:
      typeof resolvedField.value === 'string' && resolvedField.value.trim().length > 0
        ? resolvedField.value.trim()
        : undefined,
  };
}

function resolveRawNumberField(
  source: Record<string, unknown>,
  keys: readonly string[]
): AssistantResolvedField<number> {
  const resolvedField = resolveRawField<unknown>(source, keys);
  const resolvedValue = resolvedField.value;

  if (typeof resolvedValue === 'number' && Number.isFinite(resolvedValue)) {
    return {
      key: resolvedField.key,
      value: resolvedValue,
    };
  }

  if (typeof resolvedValue === 'string') {
    const parsedValue = Number(resolvedValue);
    if (Number.isFinite(parsedValue)) {
      return {
        key: resolvedField.key,
        value: parsedValue,
      };
    }
  }

  return {
    key: resolvedField.key,
    value: undefined,
  };
}

function resolveRawStringArrayField(
  source: Record<string, unknown>,
  keys: readonly string[]
): AssistantResolvedField<string[]> {
  const resolvedField = resolveRawField<unknown>(source, keys);

  return {
    key: resolvedField.key,
    value: Array.isArray(resolvedField.value)
      ? resolvedField.value.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0
        )
      : undefined,
  };
}

function summarizeRoomLike(room: {
  building?: string;
  capacity?: number;
  features?: readonly string[];
  label?: string;
  roomId?: string;
  status?: string;
  type?: string;
}) {
  return {
    building: room.building ?? '',
    capacity: room.capacity ?? 0,
    features: [...(room.features ?? [])],
    label: room.label ?? '',
    roomId: room.roomId ?? '',
    status: room.status ?? '',
    type: room.type ?? '',
  };
}

function summarizeReservationLike(reservation: {
  date?: string;
  endTime?: string;
  id?: string;
  roomId?: string;
  roomName?: string;
  startTime?: string;
  status?: string;
}) {
  return {
    date: reservation.date ?? '',
    endTime: reservation.endTime ?? '',
    id: reservation.id ?? '',
    roomId: reservation.roomId ?? '',
    roomName: reservation.roomName ?? '',
    startTime: reservation.startTime ?? '',
    status: reservation.status ?? '',
  };
}

function getResolvedRoomFields(room: AssistantRoomFeatureRoom) {
  const rawRoom = room as unknown as Record<string, unknown>;

  return {
    rawRoom,
    acStatus: resolveRawStringField(rawRoom, ['acStatus', 'ac_status']),
    buildingId: resolveRawStringField(rawRoom, ['buildingId', 'building_id']),
    buildingName: resolveRawStringField(rawRoom, ['buildingName', 'building_name']),
    capacity: resolveRawNumberField(rawRoom, ['capacity', 'maxCapacity', 'max_capacity']),
    features: resolveRawStringArrayField(rawRoom, ['features', 'roomFeatures', 'room_features']),
    floor: resolveRawStringField(rawRoom, ['floor', 'floorLabel', 'floor_label']),
    label: resolveRawStringField(rawRoom, ['name', 'roomName', 'room_name', 'label']),
    roomId: resolveRawStringField(rawRoom, ['id', 'roomId', 'room_id']),
    roomType: resolveRawStringField(rawRoom, ['roomType', 'room_type', 'type']),
    status: resolveRawStringField(rawRoom, ['status', 'roomStatus', 'room_status']),
    tvProjectorStatus: resolveRawStringField(rawRoom, ['tvProjectorStatus', 'tv_projector_status']),
    whiteboardStatus: resolveRawStringField(rawRoom, ['whiteboardStatus', 'whiteboard_status']),
  };
}

function getResolvedReservationFields(reservation: Reservation) {
  const rawReservation = reservation as unknown as Record<string, unknown>;

  return {
    rawReservation,
    date: resolveRawStringField(rawReservation, ['date', 'reservationDate', 'reservation_date']),
    endTime: resolveRawStringField(rawReservation, ['endTime', 'end_time']),
    reservationId: resolveRawStringField(rawReservation, ['id', 'reservationId', 'reservation_id']),
    roomId: resolveRawStringField(rawReservation, ['roomId', 'room_id']),
    roomName: resolveRawStringField(rawReservation, ['roomName', 'room_name']),
    startTime: resolveRawStringField(rawReservation, ['startTime', 'start_time']),
    status: resolveRawStringField(rawReservation, ['status', 'reservationStatus', 'reservation_status']),
  };
}

export function logAssistantFirestoreQuery(context: {
  buildingIds: readonly string[];
  collection: AssistantFirestoreCollection;
}) {
  const normalizedBuildingIds = [...new Set(context.buildingIds.filter(Boolean))];

  logAssistantDebug('Firestore query', {
    buildingIds: normalizedBuildingIds,
    collection: context.collection,
    isNestedCollection: false,
    path: context.collection,
    query: `${context.collection} WHERE buildingId IN [${normalizedBuildingIds.join(', ')}]`,
  });
}

export function logAssistantFirestoreSnapshot(context: {
  buildingIds: readonly string[];
  collection: AssistantFirestoreCollection;
  rawDocuments: readonly unknown[];
}) {
  const normalizedBuildingIds = [...new Set(context.buildingIds.filter(Boolean))];

  logAssistantDebug('Raw Firestore snapshot', {
    buildingIds: normalizedBuildingIds,
    collection: context.collection,
    count: context.rawDocuments.length,
    documents: context.rawDocuments,
  });
}

export function logAssistantCampusFilter(context: {
  activeBuilding: { id: string; name: string } | null;
  activeCampus: string | null;
  assistantBuildingIds: readonly string[];
  assistantRoomsCount: number;
  visibleRoomsCount: number;
}) {
  logAssistantDebug('Campus/building scope', {
    activeBuilding: context.activeBuilding,
    activeCampus: context.activeCampus,
    assistantBuildingIds: [...new Set(context.assistantBuildingIds.filter(Boolean))],
    assistantRoomsCount: context.assistantRoomsCount,
    visibleRoomsCount: context.visibleRoomsCount,
  });
}

export function logAssistantAuthState(context: {
  authLoading: boolean;
  firebaseUid: string | null;
  isAuthenticated: boolean;
}) {
  logAssistantDebug('Auth state', context);
}

function normalizeText(value?: string | null) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeFeatures(features: readonly string[] | null | undefined) {
  return [
    ...new Set(
      (features ?? [])
        .filter((feature): feature is string => typeof feature === 'string')
        .map((feature) => feature.trim())
        .filter(Boolean)
    ),
  ];
}

function capitalizeWords(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function hasNegativeFeatureStatus(value?: string | null) {
  const normalizedValue = normalizeText(value);

  return (
    normalizedValue.includes('no ') ||
    normalizedValue.startsWith('no') ||
    normalizedValue.includes('none') ||
    normalizedValue.includes('not available') ||
    normalizedValue.includes('unavailable')
  );
}

function timeStringToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function minutesToTimeString(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatRoomTypeLabelFromUnknown(value: string) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return 'Room';
  }

  return capitalizeWords(normalizedValue.replace(/-/g, ' '));
}

function buildReasonText(reasons: string[]) {
  const filteredReasons = reasons.filter(Boolean);

  if (filteredReasons.length === 0) {
    return 'Recommended because it is available at your selected time.';
  }

  if (filteredReasons.length === 1) {
    return `Recommended because ${filteredReasons[0]}.`;
  }

  if (filteredReasons.length === 2) {
    return `Recommended because ${filteredReasons[0]} and ${filteredReasons[1]}.`;
  }

  return `Recommended because ${filteredReasons.slice(0, -1).join(', ')}, and ${
    filteredReasons[filteredReasons.length - 1]
  }.`;
}

function getMatchingFeatures(
  referenceFeatures: readonly string[],
  candidateFeatures: readonly string[]
) {
  const candidateFeatureSet = new Set(
    normalizeFeatures(candidateFeatures).map((feature) => normalizeText(feature))
  );

  return normalizeFeatures(referenceFeatures).filter((feature) =>
    candidateFeatureSet.has(normalizeText(feature))
  );
}

function slotOverlaps(
  requested: Required<Pick<AssistantTimeslot, 'endTime' | 'startTime'>>,
  reservation: Required<Pick<AssistantReservationRecord, 'endTime' | 'startTime'>>
) {
  return requested.startTime < reservation.endTime && requested.endTime > reservation.startTime;
}

function isCurrentTimeslot(
  timeslot: Required<AssistantTimeslot>,
  now: Date = new Date()
) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();

  return (
    timeslot.date === today &&
    timeStringToMinutes(timeslot.startTime) <= currentMinutes &&
    timeStringToMinutes(timeslot.endTime) > currentMinutes
  );
}

export function getAssistantRoomTypeValue(roomType?: string | null): AssistantRoomTypeValue {
  const normalizedValue = normalizeText(roomType);

  if (normalizedValue.includes('conference')) {
    return 'conference-room';
  }

  if (normalizedValue.includes('glass')) {
    return 'glass-room';
  }

  if (
    normalizedValue.includes('class room') ||
    normalizedValue.includes('classroom') ||
    normalizedValue.includes('lecture')
  ) {
    return 'class-room';
  }

  if (
    normalizedValue.includes('specialized') ||
    normalizedValue.includes('laboratory') ||
    normalizedValue.includes('lab')
  ) {
    return 'specialized-room';
  }

  if (normalizedValue.includes('gymnasium') || normalizedValue.includes('gym')) {
    return 'gymnasium';
  }

  if (normalizedValue.includes('open area') || normalizedValue.includes('open-area')) {
    return 'open-area';
  }

  return 'class-room';
}

export function getAssistantRoomTypeLabel(type: AssistantRoomTypeValue | string) {
  const matchingType = ASSISTANT_ROOM_TYPE_OPTIONS.find((option) => option.value === type);

  if (matchingType) {
    return matchingType.label;
  }

  return formatRoomTypeLabelFromUnknown(type);
}

export function getAssistantRoomFeatures(room: AssistantRoomFeatureRoom) {
  const resolvedRoomFields = getResolvedRoomFields(room);
  const derivedFeatures = normalizeFeatures(resolvedRoomFields.features.value ?? room.features);
  const normalizedDerivedFeatures = new Set(
    derivedFeatures.map((feature) => normalizeText(feature))
  );
  const features = [...derivedFeatures];
  const acStatus = resolvedRoomFields.acStatus.value ?? room.acStatus;
  const tvProjectorStatus =
    resolvedRoomFields.tvProjectorStatus.value ?? room.tvProjectorStatus;
  const whiteboardStatus =
    resolvedRoomFields.whiteboardStatus.value ?? room.whiteboardStatus;

  if (!hasNegativeFeatureStatus(acStatus) && !normalizedDerivedFeatures.has('ac')) {
    features.push('AC');
  }

  if (
    !hasNegativeFeatureStatus(tvProjectorStatus) &&
    !normalizedDerivedFeatures.has('projector')
  ) {
    features.push('Projector');
  }

  if (
    typeof whiteboardStatus === 'string' &&
    !hasNegativeFeatureStatus(whiteboardStatus) &&
    !normalizedDerivedFeatures.has('whiteboard')
  ) {
    features.push('Whiteboard');
  }

  return normalizeFeatures(features);
}

export function toAssistantRoomRecord(room: AssistantRoomFeatureRoom): AssistantRoomRecord {
  const resolvedRoomFields = getResolvedRoomFields(room);
  const resolvedRoomType = resolvedRoomFields.roomType.value ?? room.roomType;
  const resolvedRoomId = resolvedRoomFields.roomId.value ?? room.id;
  const resolvedLabel = resolvedRoomFields.label.value ?? room.name;
  const resolvedFloor = resolvedRoomFields.floor.value ?? room.floor;
  const resolvedBuildingName =
    resolvedRoomFields.buildingName.value ?? room.buildingName;
  const resolvedCapacity = resolvedRoomFields.capacity.value ?? room.capacity ?? 0;
  const resolvedStatus = (
    resolvedRoomFields.status.value ?? room.status ?? 'Available'
  ) as Room['status'];
  const type = getAssistantRoomTypeValue(resolvedRoomType);
  const features = getAssistantRoomFeatures(room);

  logAssistantDebug('Room data structure', {
    rawFirestoreRoom: resolvedRoomFields.rawRoom,
    resolvedFields: {
      acStatus: resolvedRoomFields.acStatus.key,
      buildingId: resolvedRoomFields.buildingId.key,
      buildingName: resolvedRoomFields.buildingName.key,
      capacity: resolvedRoomFields.capacity.key,
      features: resolvedRoomFields.features.key,
      floor: resolvedRoomFields.floor.key,
      label: resolvedRoomFields.label.key,
      roomId: resolvedRoomFields.roomId.key,
      roomType: resolvedRoomFields.roomType.key,
      status: resolvedRoomFields.status.key,
      tvProjectorStatus: resolvedRoomFields.tvProjectorStatus.key,
      whiteboardStatus: resolvedRoomFields.whiteboardStatus.key,
    },
    normalizedRoom: summarizeRoomLike({
      building: resolvedBuildingName,
      capacity: resolvedCapacity,
      features,
      label: resolvedLabel,
      roomId: resolvedRoomId,
      status: resolvedStatus,
      type,
    }),
  });

  return {
    building: resolvedBuildingName,
    capacity: resolvedCapacity,
    features,
    floor: resolvedFloor,
    label: resolvedLabel,
    roomId: resolvedRoomId,
    sentimentScore: 0,
    status: resolvedStatus,
    type,
    typeLabel: getAssistantRoomTypeLabel(type),
    originalRoom: room,
  };
}

export function toAssistantReservationRecords(
  reservations: readonly Reservation[]
): AssistantReservationRecord[] {
  return reservations
    .map((reservation) => {
      const resolvedReservationFields = getResolvedReservationFields(reservation);
      const resolvedRecord = {
        date: resolvedReservationFields.date.value ?? reservation.date,
        endTime: resolvedReservationFields.endTime.value ?? reservation.endTime,
        id: resolvedReservationFields.reservationId.value ?? reservation.id,
        roomId: resolvedReservationFields.roomId.value ?? reservation.roomId,
        roomName: resolvedReservationFields.roomName.value ?? reservation.roomName,
        startTime: resolvedReservationFields.startTime.value ?? reservation.startTime,
        status:
          (resolvedReservationFields.status.value ?? reservation.status) as Reservation['status'],
      };

      logAssistantDebug('Reservation data structure', {
        rawFirestoreReservation: resolvedReservationFields.rawReservation,
        resolvedFields: {
          date: resolvedReservationFields.date.key,
          endTime: resolvedReservationFields.endTime.key,
          reservationId: resolvedReservationFields.reservationId.key,
          roomId: resolvedReservationFields.roomId.key,
          roomName: resolvedReservationFields.roomName.key,
          startTime: resolvedReservationFields.startTime.key,
          status: resolvedReservationFields.status.key,
        },
        normalizedReservation: summarizeReservationLike(resolvedRecord),
      });

      return resolvedRecord;
    })
    .filter(
      (reservation) =>
        typeof reservation.roomId === 'string' &&
        typeof reservation.date === 'string' &&
        typeof reservation.startTime === 'string' &&
        typeof reservation.endTime === 'string'
    );
}

export function isCompleteTimeslot(timeslot: AssistantTimeslot) {
  return Boolean(timeslot.date && timeslot.startTime && timeslot.endTime);
}

export function formatAssistantTimeslot(timeslot: Required<AssistantTimeslot>) {
  return `${formatDate(timeslot.date)} at ${formatTimeRange(timeslot.startTime, timeslot.endTime)}`;
}

export function checkAssistantRoomAvailability(
  room: AssistantRoomRecord,
  timeslot: AssistantTimeslot,
  reservations: readonly AssistantReservationRecord[],
  now: Date = new Date()
): AssistantAvailabilityResult {
  if (!isCompleteTimeslot(timeslot)) {
    return {
      availabilityLabel: 'unavailable',
      available: false,
      conflictingReservations: [],
      roomStatus: room.status,
    };
  }

  const requiredTimeslot = timeslot as Required<AssistantTimeslot>;
  const conflictingReservations = reservations.filter(
    (reservation) =>
      reservation.roomId === room.roomId &&
      BLOCKING_RESERVATION_STATUSES.includes(reservation.status) &&
      reservation.date === requiredTimeslot.date &&
      slotOverlaps(requiredTimeslot, reservation)
  );

  if (room.status === 'Unavailable') {
    return {
      availabilityLabel: 'unavailable',
      available: false,
      conflictingReservations,
      roomStatus: room.status,
    };
  }

  if (
    (room.status === 'Reserved' || room.status === 'Occupied') &&
    isCurrentTimeslot(requiredTimeslot, now)
  ) {
    return {
      availabilityLabel: 'taken',
      available: false,
      conflictingReservations,
      roomStatus: room.status,
    };
  }

  if (conflictingReservations.length > 0) {
    return {
      availabilityLabel: 'taken',
      available: false,
      conflictingReservations,
      roomStatus: room.status,
    };
  }

  return {
    availabilityLabel: 'available',
    available: true,
    conflictingReservations: [],
    roomStatus: room.status,
  };
}

function scoreRoomAgainstPreferences(
  room: AssistantRoomRecord,
  preferences: AssistantPreferences
) {
  let score = 0;

  if (preferences.preferredType && room.type === preferences.preferredType) {
    score += 3;
  }

  if (
    typeof preferences.minCapacity === 'number' &&
    Number.isFinite(preferences.minCapacity) &&
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

  return score;
}

function scoreRoomAgainstReference(
  room: AssistantRoomRecord,
  referenceRoom: AssistantRoomRecord
) {
  let score = 0;

  if (room.type === referenceRoom.type) {
    score += 3;
  }

  if (room.capacity >= referenceRoom.capacity) {
    score += 2;
  }

  if (normalizeText(room.building) === normalizeText(referenceRoom.building)) {
    score += 1;
  }

  score += getMatchingFeatures(referenceRoom.features, room.features).length;

  return score;
}

function sortRecommendations(left: AssistantRecommendation, right: AssistantRecommendation) {
  return (
    right.score - left.score ||
    left.label.localeCompare(right.label) ||
    left.roomId.localeCompare(right.roomId)
  );
}

function createPreferenceReason(room: AssistantRoomRecord, preferences: AssistantPreferences) {
  const reasons: string[] = [];
  const matchingFeatures = getMatchingFeatures(preferences.requiredFeatures, room.features);

  if (preferences.preferredType && room.type === preferences.preferredType) {
    reasons.push(`it matches your preferred ${room.typeLabel.toLowerCase()}`);
  }

  if (
    typeof preferences.minCapacity === 'number' &&
    Number.isFinite(preferences.minCapacity) &&
    room.capacity >= preferences.minCapacity
  ) {
    reasons.push('it meets your preferred capacity');
  }

  if (
    preferences.preferredBuilding &&
    normalizeText(room.building) === normalizeText(preferences.preferredBuilding)
  ) {
    reasons.push(`it is in ${room.building}`);
  }

  if (matchingFeatures.length > 0) {
    reasons.push(`it includes ${matchingFeatures.join(', ')}`);
  }

  return buildReasonText(reasons);
}

function createReferenceReason(room: AssistantRoomRecord, referenceRoom: AssistantRoomRecord) {
  const reasons: string[] = [];
  const matchingFeatures = getMatchingFeatures(referenceRoom.features, room.features);

  if (room.type === referenceRoom.type) {
    reasons.push(`it is also a ${room.typeLabel.toLowerCase()}`);
  }

  if (room.capacity >= referenceRoom.capacity) {
    reasons.push('it matches your preferred capacity');
  }

  if (normalizeText(room.building) === normalizeText(referenceRoom.building)) {
    reasons.push('it is in the same building');
  }

  if (matchingFeatures.length > 0) {
    reasons.push(`it includes ${matchingFeatures.join(', ')}`);
  }

  return buildReasonText(reasons);
}

export function getFallbackPreferencesFromRoom(
  room: AssistantRoomRecord
): AssistantPreferences {
  return {
    minCapacity: room.capacity,
    preferredBuilding: room.building,
    preferredType: room.type,
    requiredFeatures: normalizeFeatures(room.features),
  };
}

function isRecommendationAvailable(
  room: AssistantRoomRecord,
  reservations: readonly AssistantReservationRecord[],
  timeslot: AssistantTimeslot
) {
  if (!isCompleteTimeslot(timeslot)) {
    return room.status === 'Available';
  }

  return checkAssistantRoomAvailability(room, timeslot, reservations).available;
}

export function findAssistantRoomMatches(
  rooms: readonly AssistantRoomRecord[],
  reservations: readonly AssistantReservationRecord[],
  timeslot: AssistantTimeslot,
  preferences: AssistantPreferences
) {
  const normalizedPreferences: AssistantPreferences = {
    minCapacity: preferences.minCapacity,
    preferredBuilding: preferences.preferredBuilding,
    preferredType: preferences.preferredType,
    requiredFeatures: normalizeFeatures(preferences.requiredFeatures),
  };

  const roomEvaluations = rooms.map((room) => {
    const availability = isCompleteTimeslot(timeslot)
      ? checkAssistantRoomAvailability(room, timeslot, reservations)
      : null;
    const available = availability ? availability.available : room.status === 'Available';
    const featureMatches = getMatchingFeatures(
      normalizedPreferences.requiredFeatures,
      room.features
    );
    const evaluation = {
      availabilityLabel:
        availability?.availabilityLabel ?? (available ? 'available' : 'unavailable'),
      available,
      buildingMatch: normalizedPreferences.preferredBuilding
        ? normalizeText(room.building) ===
          normalizeText(normalizedPreferences.preferredBuilding)
        : true,
      capacityMatch:
        typeof normalizedPreferences.minCapacity === 'number' &&
        Number.isFinite(normalizedPreferences.minCapacity)
          ? room.capacity >= normalizedPreferences.minCapacity
          : true,
      conflictingReservations:
        availability?.conflictingReservations.map((reservation) =>
          summarizeReservationLike(reservation)
        ) ?? [],
      featureMatches,
      featureRequirementMet:
        featureMatches.length >= normalizedPreferences.requiredFeatures.length,
      room: summarizeRoomLike(room),
      score: scoreRoomAgainstPreferences(room, normalizedPreferences),
      typeMatch: normalizedPreferences.preferredType
        ? room.type === normalizedPreferences.preferredType
        : true,
    };

    return {
      evaluation,
      recommendation: {
        ...room,
        reason: createPreferenceReason(room, normalizedPreferences),
        score: evaluation.score,
      },
    };
  });

  const recommendations = roomEvaluations
    .filter((roomEvaluation) => roomEvaluation.evaluation.available)
    .map((roomEvaluation) => roomEvaluation.recommendation)
    .sort(sortRecommendations)
    .slice(0, SCORE_LIMIT);

  logAssistantDebug('Recommendation filters', {
    preferredBuilding: normalizedPreferences.preferredBuilding ?? null,
    preferredType: normalizedPreferences.preferredType ?? null,
    requiredFeatures: normalizedPreferences.requiredFeatures,
    roomCount: rooms.length,
    timeslot,
    totalReservations: reservations.length,
  });
  logAssistantDebug(
    'Recommendation evaluation',
    roomEvaluations.map((roomEvaluation) => roomEvaluation.evaluation)
  );
  logAssistantDebug(
    'Final filtered recommendations',
    recommendations.map((recommendation) => ({
      ...summarizeRoomLike(recommendation),
      reason: recommendation.reason,
      score: recommendation.score,
    }))
  );

  return recommendations;
}

export function findAlternativeAssistantRooms(
  rooms: readonly AssistantRoomRecord[],
  reservations: readonly AssistantReservationRecord[],
  selectedRoom: AssistantRoomRecord,
  timeslot: AssistantTimeslot,
  preferences?: AssistantPreferences | null
) {
  const resolvedPreferences = (
    preferences?.preferredType ||
    preferences?.minCapacity ||
    preferences?.preferredBuilding ||
    (preferences?.requiredFeatures?.length ?? 0)
  )
    ? {
        minCapacity: preferences?.minCapacity,
        preferredBuilding: preferences?.preferredBuilding,
        preferredType: preferences?.preferredType,
        requiredFeatures: normalizeFeatures(preferences?.requiredFeatures),
      }
    : null;

  return rooms
    .filter((room) => room.roomId !== selectedRoom.roomId)
    .filter((room) => isRecommendationAvailable(room, reservations, timeslot))
    .map((room) => {
      const score = resolvedPreferences
        ? scoreRoomAgainstPreferences(room, resolvedPreferences)
        : scoreRoomAgainstReference(room, selectedRoom);
      const reason = resolvedPreferences
        ? createPreferenceReason(room, resolvedPreferences)
        : createReferenceReason(room, selectedRoom);

      return {
        ...room,
        reason,
        score,
      };
    })
    .sort(sortRecommendations)
    .slice(0, SCORE_LIMIT);
}

export function suggestAssistantTimeslotsForRoom(
  room: AssistantRoomRecord,
  reservations: readonly AssistantReservationRecord[],
  requestedTimeslot: AssistantTimeslot,
  campusTimeRange: { endMinutes: number; startMinutes: number },
  options: {
    daysToSearch?: number;
    maxSuggestions?: number;
  } = {}
) {
  if (!isCompleteTimeslot(requestedTimeslot) || room.status === 'Unavailable') {
    return [];
  }

  const resolvedTimeslot = requestedTimeslot as Required<AssistantTimeslot>;
  const durationMinutes =
    timeStringToMinutes(resolvedTimeslot.endTime) - timeStringToMinutes(resolvedTimeslot.startTime);

  if (durationMinutes <= 0) {
    return [];
  }

  const maxSuggestions = options.maxSuggestions ?? 5;
  const daysToSearch = options.daysToSearch ?? 14;
  const requestedStartMinutes = timeStringToMinutes(resolvedTimeslot.startTime);
  const suggestions: AssistantTimeslotSuggestion[] = [];
  const roomReservations = reservations.filter(
    (reservation) =>
      reservation.roomId === room.roomId &&
      BLOCKING_RESERVATION_STATUSES.includes(reservation.status)
  );

  for (let dayOffset = 0; dayOffset <= daysToSearch; dayOffset += 1) {
    const candidateDate = new Date(`${resolvedTimeslot.date}T00:00:00`);
    candidateDate.setDate(candidateDate.getDate() + dayOffset);
    const nextDate = `${candidateDate.getFullYear()}-${String(candidateDate.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(candidateDate.getDate()).padStart(2, '0')}`;

    const candidateStartMinutes = Array.from(
      new Set([
        requestedStartMinutes,
        ...Array.from(
          {
            length:
              Math.floor(
                (campusTimeRange.endMinutes - campusTimeRange.startMinutes - durationMinutes) / 60
              ) + 1,
          },
          (_, index) => campusTimeRange.startMinutes + (index * 60)
        ),
      ])
    )
      .filter((minutes) => minutes >= campusTimeRange.startMinutes)
      .filter((minutes) => minutes + durationMinutes <= campusTimeRange.endMinutes)
      .sort((left, right) => Math.abs(left - requestedStartMinutes) - Math.abs(right - requestedStartMinutes));

    for (const startMinutes of candidateStartMinutes) {
      const startTime = minutesToTimeString(startMinutes);
      const endTime = minutesToTimeString(startMinutes + durationMinutes);

      if (
        nextDate === resolvedTimeslot.date &&
        startTime === resolvedTimeslot.startTime &&
        endTime === resolvedTimeslot.endTime
      ) {
        continue;
      }

      const isBlocked = roomReservations.some(
        (reservation) =>
          reservation.date === nextDate &&
          slotOverlaps(
            {
              endTime,
              startTime,
            },
            reservation
          )
      );

      if (isBlocked) {
        continue;
      }

      suggestions.push({
        date: nextDate,
        endTime,
        label: `${formatDate(nextDate)} at ${formatTimeRange(startTime, endTime)}`,
        startTime,
      });

      if (suggestions.length >= maxSuggestions) {
        return suggestions;
      }
    }
  }

  return suggestions;
}
