'use client';

import type { SubmitEvent } from 'react';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DaySchedulePanel from '@/components/rooms/schedules/DaySchedulePanel';
import RoomAvailabilityPicker from '@/components/rooms/RoomAvailabilityPicker';
import RoomCard from '@/components/rooms/RoomCard';
import RoomAssistantWidget from '@/components/rooms/RoomAssistantWidget';
import { useAuth } from '@/context/AuthContext';
import {
  getCampusName,
  getManagedBuildingIdsForCampus,
  getManagedBuildingsForCampus,
} from '@/lib/buildings/campusAssignments';
import { inferCampusFromBuilding, type ReservationCampus } from '@/lib/buildings/campuses';
import { normalizeRole, USER_ROLES } from '@/lib/auth/roles';
import {
  logAssistantAuthState,
  logAssistantCampusFilter,
  logAssistantFirestoreQuery,
  logAssistantFirestoreSnapshot,
  toAssistantRoomRecord,
  toAssistantReservationRecords,
} from '@/lib/ai/roomAssistantRealtime';
import {
  createReservation,
  createRecurringReservation,
  onReservationsByBuildingIds,
  type Reservation,
  uploadReservationDocument,
  validateReservationApprover,
} from '@/lib/reservations/reservations';
import {
  hasTimeConflict,
  onBookedDatesByRoom,
  onEnrichedSlotsByRoom,
  onActiveReservationsByUser,
  type BookingSlot,
  type EnrichedBookingSlot,
  type UserActiveSlot,
} from '@/lib/reservations/roomAvailability';
import { getRoomsByBuilding, onRoomsByBuildingIds, type Room } from '@/lib/rooms/rooms';
import { getSchedulesByRoomId, type Schedule } from '@/lib/schedules/schedules';
import { formatDate, formatTime } from '@/lib/utils/dateTime';
import { getFloorDisplayLabel } from '@/lib/buildings/floorLabels';

type DetailsStep = 2 | 3;
type RoomFilterKey =
  | 'available'
  | 'classroom'
  | 'glass-room'
  | 'conference-room'
  | 'specialized-room'
  | 'gymnasium'
  | 'open-area';

const WEEKDAY_OPTIONS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];
const DAY_LABELS_BY_VALUE = new Map(
  WEEKDAY_OPTIONS.map((day) => [day.value, day.label])
);
const WEEKDAY_VALUES = new Set(WEEKDAY_OPTIONS.map((day) => day.value));
const CAMPUS_TIME_RANGES: Record<ReservationCampus, { endMinutes: number; startMinutes: number }> = {
  digi: {
    startMinutes: 7 * 60,
    endMinutes: 17 * 60
  },
  main: {
    startMinutes: 7 * 60,
    endMinutes: 21 * 60
  },
};
const ASSISTANT_CAMPUS_ORDER: ReservationCampus[] = ['main', 'digi'];
const FILTER_CHIPS: Array<{ key: RoomFilterKey; label: string }> = [
  {
    key: 'classroom',
    label: 'Classroom'
  },
  {
    key: 'glass-room',
    label: 'Glass Room'
  },
  {
    key: 'conference-room',
    label: 'Conference Room'
  },
  {
    key: 'specialized-room',
    label: 'Specialized Room'
  },
  {
    key: 'gymnasium',
    label: 'Gymnasium'
  },
  {
    key: 'open-area',
    label: 'Open Area'
  },
  {
    key: 'available',
    label: 'Available'
  },
];
const BUILDING_FLOORS: Record<string, string[]> = {
  // SDCA Digi Campus — single building, use its actual buildingId from getManagedBuildingsForCampus('digi')
  digi: ['Ground Floor', '2nd Floor', '3rd Floor', '4th Floor'],
  // SDCA Main Campus buildings
  gd1: ['Basement', 'Ground Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor', '6th Floor', '7th Floor', '8th Floor'],
  gd2: ['Ground Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor', '6th Floor', '7th Floor', '8th Floor', '9th Floor', '10th Floor'],
  gd3: ['Ground Floor', '2nd Floor', '3rd Floor', '4th Floor', '5th Floor', '6th Floor', '7th Floor', '8th Floor', '9th Floor', '10th Floor', '11th Floor'],
};
const INITIAL_EQUIPMENT = {
  fans: 0,
  speakers: 0,
  televisions: 0,
  hdmiCables: 0,
  monoblockChairs: 0,
  tables: 0,
};
const TIME_CONFLICT_MESSAGE =
  'This room is already reserved for the selected time. Please choose a different time or date.';
const USER_CONFLICT_MESSAGE =
  'Only one reservation at a time. You already have a booking at another room during this time.';
const PAST_TIME_MESSAGE =
  'That timeslot has already started or passed. Please choose a future 1-hour slot.';
const NO_RECURRING_DATES_MESSAGE =
  'No reservation dates match the selected recurring schedule. Choose another date range or weekday.';

function getFirstAssistantScope(preferredCampus?: ReservationCampus | null) {
  const campusCandidates = preferredCampus
    ? [preferredCampus]
    : ASSISTANT_CAMPUS_ORDER;

  for (const campus of campusCandidates) {
    const [building] = getManagedBuildingsForCampus(campus);

    if (building) {
      return {
        campus,
        building: {
          id: building.id,
          name: building.name,
        },
      };
    }
  }

  return null;
}

function timeStringToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTimeString(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeLabel(value: string): string {
  return formatTime(value);
}

function getCampusTimeOptions(campus: ReservationCampus | null): string[] {
  if (!campus) {
    return [];
  }

  const { startMinutes, endMinutes } = CAMPUS_TIME_RANGES[campus];
  const options: string[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 60) {
    options.push(minutesToTimeString(minutes));
  }

  return options;
}

function isTimeRangeValid(
  campus: ReservationCampus | null,
  startTime: string,
  endTime: string
): boolean {
  if (!campus || !startTime || !endTime) {
    return false;
  }

  const { startMinutes, endMinutes } = CAMPUS_TIME_RANGES[campus];
  const start = timeStringToMinutes(startTime);
  const end = timeStringToMinutes(endTime);

  return (
    start >= startMinutes &&
    end <= endMinutes &&
    start % 60 === 0 &&
    end % 60 === 0 &&
    end - start >= 60
  );
}

function isPastTimeSelection(date: string, startTime: string, now: Date): boolean {
  if (!date || !startTime) {
    return false;
  }

  const today = toLocalIsoDate(now);
  if (date < today) {
    return true;
  }

  if (date !== today) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return timeStringToMinutes(startTime) <= nowMinutes;
}

function formatConflictDates(dates: string[]): string {
  const visibleDates = dates.slice(0, 3).map(formatDate);
  const remainingCount = dates.length - visibleDates.length;
  return `${visibleDates.join(', ')}${
    remainingCount > 0 ? `, and ${remainingCount} more` : ''
  }`;
}

function timeRangesOverlap(
  startTime: string,
  endTime: string,
  rangeStart: string,
  rangeEnd: string
): boolean {
  return startTime < rangeEnd && endTime > rangeStart;
}

function isSelectableRecurringDay(day: number): boolean {
  return WEEKDAY_VALUES.has(day);
}

function getRoomCampus(room: Room): ReservationCampus | null {
  return inferCampusFromBuilding({
    id: room.buildingId,
    name: room.buildingName,
  });
}

function getRoomAvailability(
  room: Room,
  reservations: Reservation[]
): 'Available' | 'Reserved' | 'Occupied' {
  const approvedReservations = reservations.filter(
    (reservation) => reservation.roomId === room.id && reservation.status === 'approved'
  );
  const checkedInReservation = approvedReservations.find(
    (reservation) => Boolean(reservation.checkedInAt) && !reservation.occupancyReleasedAt
  );

  if (checkedInReservation) {
    return 'Occupied';
  }

  if (approvedReservations.length > 0 || room.status === 'Reserved') {
    return 'Reserved';
  }

  return 'Available';
}

function matchesRoomType(room: Room, filter: Exclude<RoomFilterKey, 'available'>): boolean {
  const roomType = room.roomType.trim().toLowerCase();
  switch (filter) {
    case 'classroom':
      return roomType.includes('classroom');
    case 'glass-room':
      return roomType.includes('glass');
    case 'conference-room':
      return roomType.includes('conference');
    case 'specialized-room':
      return roomType.includes('specialized');
    case 'gymnasium':
      return roomType.includes('gymnasium') || roomType.includes('gym');
    case 'open-area':
      return roomType.includes('open area');
    default:
      return false;
  }
}

export default function ReserveRoomPage() {
  const { firebaseUser, loading: authLoading, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRoomParam = searchParams.get('roomId') ?? '';

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [activeCampus, setActiveCampus] = useState<ReservationCampus | null>(null);
  const [activeBuilding, setActiveBuilding] = useState<{ id: string; name: string } | null>(null);
  const [activeFloor, setActiveFloor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoomFilters, setActiveRoomFilters] = useState<RoomFilterKey[]>(['classroom']);
  const [detailsStep, setDetailsStep] = useState<DetailsStep>(2);
  const [reservationDate, setReservationDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [programDepartmentOrganization, setProgramDepartmentOrganization] = useState('');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [timeError, setTimeError] = useState('');
  const [validatingApprover, setValidatingApprover] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'validating-email' | 'creating-reservation'>('idle');
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [equipment, setEquipment] = useState<Record<string, number>>({ ...INITIAL_EQUIPMENT });
  const [approvalDocument, setApprovalDocument] = useState<File | null>(null);
  const [uploadedApprovalDocument, setUploadedApprovalDocument] = useState<{
    contentType: string;
    name: string;
    path: string;
    size: number;
    url: string;
  } | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [approvalDocumentError, setApprovalDocumentError] = useState('');
  const [approvalEmailError, setApprovalEmailError] = useState('');
  const [approvalEmails, setApprovalEmails] = useState({ advisorEmail: '' });
  const [bookedSlots, setBookedSlots] = useState<BookingSlot[]>([]);
  const [bookedSlotsLoading, setBookedSlotsLoading] = useState(() =>
    Boolean(selectedRoomParam)
  );
  const [enrichedSlots, setEnrichedSlots] = useState<EnrichedBookingSlot[]>([]);
  const [userActiveSlots, setUserActiveSlots] = useState<UserActiveSlot[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Schedule[]>([]);
  const [assistantRooms, setAssistantRooms] = useState<Room[]>([]);
  const [assistantReservations, setAssistantReservations] = useState<Reservation[]>([]);
  const [assistantDataLoading, setAssistantDataLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const assistantBuildingIds = useMemo(() => {
    if (activeBuilding) {
      return [activeBuilding.id];
    }

    if (activeCampus) {
      return getManagedBuildingIdsForCampus(activeCampus);
    }

    return [];
  }, [activeBuilding, activeCampus]);

  useEffect(() => {
    if (!firebaseUser || !activeBuilding) {
      setRooms([]);
      setRoomsLoading(false);
      return;
    }

    let active = true;

    setRoomsLoading(true);
    setRoomsError('');

    getRoomsByBuilding(activeBuilding.id)
      .then((loadedRooms) => {
        if (!active) {
          return;
        }

        setRooms(loadedRooms);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setRooms([]);
        setRoomsError(
          error instanceof Error ? error.message : 'Failed to load rooms.'
        );
      })
      .finally(() => {
        if (active) {
          setRoomsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [firebaseUser, activeBuilding]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);
  useEffect(() => {
    const profileOrganizationName =
      profile?.accountType === 'organization' ? profile.organizationName?.trim() : '';

    if (!profileOrganizationName) {
      return;
    }

    setProgramDepartmentOrganization((current) => current || profileOrganizationName);
  }, [profile?.accountType, profile?.organizationName]);

  useEffect(() => {
    logAssistantAuthState({
      authLoading,
      firebaseUid: firebaseUser?.uid ?? null,
      isAuthenticated: Boolean(firebaseUser?.uid),
    });
  }, [authLoading, firebaseUser?.uid]);

  useEffect(() => {
    logAssistantCampusFilter({
      activeBuilding,
      activeCampus,
      assistantBuildingIds,
      assistantRoomsCount: assistantRooms.length,
      visibleRoomsCount: rooms.length,
    });
  }, [activeBuilding, activeCampus, assistantBuildingIds, assistantRooms.length, rooms.length]);

  useEffect(() => {
    if (assistantBuildingIds.length === 0) {
      setAssistantRooms([]);
      setAssistantReservations([]);
      setAssistantDataLoading(false);
      return;
    }

    if (authLoading) {
      setAssistantRooms([]);
      setAssistantReservations([]);
      setAssistantDataLoading(true);
      return;
    }

    if (!firebaseUser?.uid) {
      console.warn('[room-assistant] Skipping Firestore room reads until the user is authenticated.');
      setAssistantRooms([]);
      setAssistantReservations([]);
      setAssistantDataLoading(false);
      return;
    }

    let cancelled = false;
    let roomsLoaded = false;
    let reservationsLoaded = false;

    const updateLoading = () => {
      if (!cancelled) {
        setAssistantDataLoading(!(roomsLoaded && reservationsLoaded));
      }
    };

    setAssistantDataLoading(true);
    logAssistantFirestoreQuery({
      buildingIds: assistantBuildingIds,
      collection: 'rooms',
    });
    logAssistantFirestoreQuery({
      buildingIds: assistantBuildingIds,
      collection: 'reservations',
    });

    const unsubscribeRooms = onRoomsByBuildingIds(assistantBuildingIds, (nextRooms) => {
      if (cancelled) {
        return;
      }

      logAssistantFirestoreSnapshot({
        buildingIds: assistantBuildingIds,
        collection: 'rooms',
        rawDocuments: nextRooms,
      });
      roomsLoaded = true;
      setAssistantRooms(nextRooms);
      updateLoading();
    });

    const unsubscribeReservations = onReservationsByBuildingIds(
      assistantBuildingIds,
      (nextReservations) => {
        if (cancelled) {
          return;
        }

        logAssistantFirestoreSnapshot({
          buildingIds: assistantBuildingIds,
          collection: 'reservations',
          rawDocuments: nextReservations,
        });
        reservationsLoaded = true;
        setAssistantReservations(nextReservations);
        updateLoading();
      }
    );

    return () => {
      cancelled = true;
      unsubscribeRooms();
      unsubscribeReservations();
    };
  }, [assistantBuildingIds, authLoading, firebaseUser?.uid]);

  useEffect(() => {
    if (!selectedRoomParam) {
      return;
    }

    let cancelled = false;
    const unsubscribe = onBookedDatesByRoom(selectedRoomParam, (slots) => {
      if (cancelled) return;
      setBookedSlots(slots);
      setBookedSlotsLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedRoomParam]);

  useEffect(() => {
    if (!selectedRoomParam) {
      setRoomSchedules([]);
      return;
    }

    let cancelled = false;

    getSchedulesByRoomId(selectedRoomParam)
      .then((schedules) => {
        if (!cancelled) {
          setRoomSchedules(schedules);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.warn('Failed to load room schedules for availability checks:', error);
        setRoomSchedules([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRoomParam]);

  // Enriched room slots (approved + pending with userId) for the schedule panel.
  useEffect(() => {
    if (!selectedRoomParam) {
      setEnrichedSlots([]);
      return;
    }

    let cancelled = false;
    const unsubscribe = onEnrichedSlotsByRoom(selectedRoomParam, (slots) => {
      if (cancelled) return;
      setEnrichedSlots(slots);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedRoomParam]);

  // User's own active reservations across ALL rooms (cross-room conflict check).
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setUserActiveSlots([]);
      return;
    }

    let cancelled = false;
    const unsubscribe = onActiveReservationsByUser(
      firebaseUser.uid,
      (slots) => {
        if (cancelled) return;
        setUserActiveSlots(slots);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (assistantRooms.length === 0 && rooms.length > 0 && activeBuilding) {
      console.warn('[room-assistant] Firestore room listener returned no rooms; using reserve-page room data as a fallback.', {
        activeBuilding,
        assistantBuildingIds,
        visibleRoomCount: rooms.length,
      });
    }
  }, [activeBuilding, assistantBuildingIds, assistantRooms.length, rooms.length]);

  const selectedRoom = selectedRoomParam
    ? rooms.find((room) => room.id === selectedRoomParam) ?? null
    : null;
  const assistantRoomSource = assistantRooms.length > 0 ? assistantRooms : rooms;
  const recommendationRooms = assistantRoomSource.map((room) => toAssistantRoomRecord(room));
  const assistantReservationRecords = toAssistantReservationRecords(assistantReservations);
  const selectedRecommendationRoom = selectedRoomParam
    ? recommendationRooms.find((room) => room.roomId === selectedRoomParam) ?? null
    : null;
  const selectedCampus = selectedRoom
    ? getRoomCampus(selectedRoom)
    : selectedRecommendationRoom
      ? getRoomCampus(selectedRecommendationRoom.originalRoom)
      : null;
  const selectedRoomId = selectedRoom?.id ?? '';
  const selectedRoomName = selectedRoom?.name ?? '';
  const selectedBuildingId = selectedRoom?.buildingId ?? '';
  const selectedBuildingName = selectedRoom?.buildingName ?? '';
  const normalizedProfileRole = normalizeRole(profile?.role) ?? USER_ROLES.STUDENT;
  const isStudentReservation = normalizedProfileRole === USER_ROLES.STUDENT;
  const isFacultyReservation = normalizedProfileRole === USER_ROLES.FACULTY;
  const selectedRoomAvailability = selectedRoom
    ? getRoomAvailability(selectedRoom, assistantReservations)
    : null;
  const selectedRoomCampusName = selectedCampus
    ? getCampusName(selectedCampus)
    : selectedBuildingName || 'Unknown campus';
  const isSelectedRoomAvailable =
    selectedRoomAvailability !== null && selectedRoomAvailability !== 'Occupied';
  const selectedTimeslot = {
    date: reservationDate,
    startTime,
    endTime,
  };
  const currentStep = selectedRoomParam ? detailsStep : 1;
  const campusTimeOptions = getCampusTimeOptions(selectedCampus);
  const startTimeOptions = selectedCampus
    ? campusTimeOptions.filter((time) => {
        const optionMinutes = timeStringToMinutes(time);
        return (
          optionMinutes <= CAMPUS_TIME_RANGES[selectedCampus].endMinutes - 60 &&
          !isPastTimeSelection(reservationDate, time, now)
        );
      })
    : [];
  const endTimeOptions = selectedCampus
    ? campusTimeOptions.filter((time) => {
        if (!startTime) {
          return false;
        }

        const optionMinutes = timeStringToMinutes(time);
        return (
          optionMinutes >= timeStringToMinutes(startTime) + 60 &&
          optionMinutes <= CAMPUS_TIME_RANGES[selectedCampus].endMinutes
        );
      })
    : [];
  const selectedTimeConflict =
    !isRecurring &&
    Boolean(reservationDate) &&
    Boolean(startTime) &&
    Boolean(endTime) &&
    hasTimeConflict(reservationDate, startTime, endTime, bookedSlots);

  // Cross-room conflict: user already has a booking at this time in another room.
  const selectedUserConflict =
    !isRecurring &&
    Boolean(reservationDate) &&
    Boolean(startTime) &&
    Boolean(endTime) &&
    userActiveSlots.some(
      (slot) =>
        slot.date === reservationDate &&
        slot.roomId !== selectedRoomId &&
        startTime < slot.endTime &&
        endTime > slot.startTime
    );
  const selectedPastTimeConflict =
    !isRecurring &&
    Boolean(reservationDate) &&
    Boolean(startTime) &&
    isPastTimeSelection(reservationDate, startTime, now);

  useEffect(() => {
    console.log('[reservation-form] concept paper state updated', {
      file: approvalDocument,
      hasFile: Boolean(approvalDocument),
      name: approvalDocument?.name ?? null,
      size: approvalDocument?.size ?? null,
      type: approvalDocument?.type ?? null,
    });
  }, [approvalDocument]);

  function getFloorsForActiveBuilding(): string[] {
    if (!activeCampus) return [];
    if (activeCampus === 'digi') return BUILDING_FLOORS.digi;
    if (!activeBuilding) return [];
    const name = activeBuilding.name.toLowerCase();
    if (name.includes('gd1') || name.includes('g.d. 1') || name.includes('gd 1')) return BUILDING_FLOORS.gd1;
    if (name.includes('gd2') || name.includes('g.d. 2') || name.includes('gd 2')) return BUILDING_FLOORS.gd2;
    if (name.includes('gd3') || name.includes('g.d. 3') || name.includes('gd 3')) return BUILDING_FLOORS.gd3;
    return [];
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedQuery.length > 0;
  const hasTypeFilters = activeRoomFilters.some((f) => f !== 'available');
  const filteredRooms = rooms.filter((room) => {
    if (hasSearchQuery) {
      return (
        room.name.toLowerCase().includes(normalizedQuery) ||
        room.id.toLowerCase().includes(normalizedQuery)
      );
    }
    // Floor filter — match the selected floor label against room.floor
    if (activeFloor) {
      const floorLabel = getFloorDisplayLabel(room.floor, {
        id: room.buildingId,
        name: room.buildingName,
      }).toLowerCase();
      if (!floorLabel.includes(activeFloor.toLowerCase())) return false;
    }
    const matchesType =
      !hasTypeFilters ||
      activeRoomFilters
        .filter((f): f is Exclude<RoomFilterKey, 'available'> => f !== 'available')
        .some((f) => matchesRoomType(room, f));
    const matchesAvailability =
      !activeRoomFilters.includes('available') || room.status === 'Available';

    return matchesType && matchesAvailability;
  });
  const selectedRecurringDays = selectedDays.filter(isSelectableRecurringDay);
  const previewDates = isRecurring ? getPreviewDates() : [];
  const recurringRoomConflictDates =
    isRecurring && startTime && endTime
      ? previewDates.filter((date) => hasTimeConflict(date, startTime, endTime, bookedSlots))
      : [];
  const recurringScheduleConflictDates =
    isRecurring && startTime && endTime
      ? previewDates.filter((date) => {
          const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
          return roomSchedules.some(
            (schedule) =>
              schedule.dayOfWeek === dayOfWeek &&
              timeRangesOverlap(startTime, endTime, schedule.startTime, schedule.endTime)
          );
        })
      : [];
  const recurringUserConflictDates =
    isRecurring && startTime && endTime
      ? previewDates.filter((date) =>
          userActiveSlots.some(
            (slot) =>
              slot.date === date &&
              slot.roomId !== selectedRoomId &&
              startTime < slot.endTime &&
              endTime > slot.startTime
          )
        )
      : [];
  const recurringPastTimeDates =
    isRecurring && startTime
      ? previewDates.filter((date) => isPastTimeSelection(date, startTime, now))
      : [];
  const hasRecurringAvailabilityIssue =
    recurringRoomConflictDates.length > 0 ||
    recurringScheduleConflictDates.length > 0 ||
    recurringUserConflictDates.length > 0 ||
    recurringPastTimeDates.length > 0;
  const recurringAvailabilityMessage = getRecurringAvailabilityMessage();
  const canContinueToEquipment = canProceedToEquipment();

  useEffect(() => {
    if (
      timeError &&
      !selectedTimeConflict &&
      !selectedUserConflict &&
      !selectedPastTimeConflict &&
      !recurringAvailabilityMessage
    ) {
      setTimeError('');
    }
  }, [
    recurringAvailabilityMessage,
    selectedPastTimeConflict,
    selectedTimeConflict,
    selectedUserConflict,
    timeError,
  ]);

  function resetReservationDetails() {
    setReservationDate('');
    setStartTime('');
    setEndTime('');
    setProgramDepartmentOrganization('');
    setPurpose('');
    setSubmitError('');
    setTimeError('');
    setApprovalEmailError('');
    setCreatedCount(0);
    setIsRecurring(false);
    setSelectedDays([]);
    setRecurringEndDate('');
    setEquipment({ ...INITIAL_EQUIPMENT });
    setApprovalDocument(null);
    setUploadedApprovalDocument(null);
    setApprovalDocumentError('');
    setApprovalEmails({ advisorEmail: '' });
  }

  function getPreviewDates(): string[] {
    if (!reservationDate || !recurringEndDate || selectedRecurringDays.length === 0) {
      return [];
    }

    const dates: string[] = [];
    const current = new Date(`${reservationDate}T00:00:00`);
    const end = new Date(`${recurringEndDate}T00:00:00`);

    while (current <= end) {
      const day = current.getDay();
      if (isSelectableRecurringDay(day) && selectedRecurringDays.includes(day)) {
        dates.push(toLocalIsoDate(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  function getRecurringAvailabilityMessage(): string {
    if (!isRecurring || !startTime || !endTime) {
      return '';
    }

    if (reservationDate && recurringEndDate && selectedRecurringDays.length > 0 && previewDates.length === 0) {
      return NO_RECURRING_DATES_MESSAGE;
    }

    if (recurringPastTimeDates.length > 0) {
      return `The selected recurring range includes a past timeslot on ${formatConflictDates(
        recurringPastTimeDates
      )}. Choose a future 1-hour slot.`;
    }

    if (recurringRoomConflictDates.length > 0) {
      return `The room is not available for this weekly timeslot on ${formatConflictDates(
        recurringRoomConflictDates
      )}. Choose another time or date range.`;
    }

    if (recurringScheduleConflictDates.length > 0) {
      return `A class schedule blocks this room during the selected timeslot on ${formatConflictDates(
        recurringScheduleConflictDates
      )}. Choose another time or date range.`;
    }

    if (recurringUserConflictDates.length > 0) {
      return `You already have another active reservation during this timeslot on ${formatConflictDates(
        recurringUserConflictDates
      )}.`;
    }

    return '';
  }

  function canProceedToEquipment(): boolean {
    if (
      !isSelectedRoomAvailable ||
      !startTime ||
      !endTime ||
      !programDepartmentOrganization ||
      !purpose ||
      !isTimeRangeValid(selectedCampus, startTime, endTime)
    ) {
      return false;
    }

    if (isRecurring) {
      return (
        !!reservationDate &&
        !!recurringEndDate &&
        selectedRecurringDays.length > 0 &&
        previewDates.length > 0 &&
        !hasRecurringAvailabilityIssue
      );
    }

    if (!reservationDate) {
      return false;
    }

    return !selectedTimeConflict && !selectedUserConflict && !selectedPastTimeConflict;
  }

  function toggleDay(day: number) {
    if (!isSelectableRecurringDay(day)) {
      return;
    }

    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day]
    );
  }

  function updateEquipment(key: string, delta: number) {
    setEquipment((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }));
  }

  async function handleApprovalDocumentChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nextFile = event.target.files?.[0] ?? null;
    console.log('[reservation-form] selected concept paper file', {
      file: nextFile,
      hasFile: Boolean(nextFile),
      name: nextFile?.name ?? null,
      size: nextFile?.size ?? null,
      type: nextFile?.type ?? null,
    });
    setApprovalDocument(nextFile);
    setUploadedApprovalDocument(null);
    setApprovalDocumentError('');
    setSubmitError('');

    if (!nextFile) {
      return;
    }

    setDocumentUploading(true);

    try {
      const uploadedDocument = await uploadReservationDocument(nextFile);
      console.log('[reservation-form] concept paper uploaded successfully', {
        hasFileUrl: Boolean(uploadedDocument.url),
        name: uploadedDocument.name,
        path: uploadedDocument.path,
        size: uploadedDocument.size,
      });
      setUploadedApprovalDocument({
        contentType: uploadedDocument.contentType,
        name: uploadedDocument.name,
        path: uploadedDocument.path,
        size: uploadedDocument.size,
        url: uploadedDocument.url,
      });
    } catch (error) {
      setApprovalDocumentError(
        error instanceof Error
          ? error.message
          : 'We could not upload the concept paper right now.'
      );
    } finally {
      setDocumentUploading(false);
      event.target.value = '';
    }
  }

  function validateEmail(email: string): boolean {
    if (!email.trim()) {
      return true;
    }

    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  function handleCampusSelect(nextCampus: ReservationCampus) {
    const nextBuilding =
      nextCampus === 'digi' ? getManagedBuildingsForCampus('digi')[0] ?? null : null;

    setActiveCampus(nextCampus);
    setActiveBuilding(
      nextBuilding ? {
        id: nextBuilding.id,
        name: nextBuilding.name
      } : null
    );
    setActiveFloor(null);
    setRooms([]);
    setRoomsError('');
    setRoomsLoading(Boolean(nextBuilding && firebaseUser));
    setActiveRoomFilters([]);
  }

  function handleBuildingSelect(nextBuilding: { id: string; name: string }) {
    setActiveBuilding(nextBuilding);
    setActiveFloor(null);
    setRooms([]);
    setRoomsError('');
    setRoomsLoading(Boolean(firebaseUser));
    setActiveRoomFilters([]);
  }

  function applyAssistantScope(nextCampus?: ReservationCampus | null) {
    const scope = getFirstAssistantScope(nextCampus);

    if (!scope) {
      return;
    }

    setActiveCampus(scope.campus);
    setActiveBuilding(scope.building);
    setActiveFloor(null);
    setRooms([]);
    setRoomsError('');
    setRoomsLoading(Boolean(firebaseUser));
    setActiveRoomFilters([]);
  }

  function handleAssistantOpen() {
    if (activeCampus) {
      return;
    }

    applyAssistantScope();
  }

  function handleAssistantCampusSelect(nextCampus: ReservationCampus) {
    applyAssistantScope(nextCampus);
  }

  function handleFloorSelect(nextFloor: string) {
    setActiveFloor(nextFloor);
    setActiveRoomFilters(['classroom']);
  }

  function clearFloorSelection() {
    setActiveFloor(null);
    setActiveRoomFilters([]);
  }

  function toggleRoomFilter(filter: RoomFilterKey) {
    setActiveRoomFilters((prev) =>
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter]
    );
  }

  function handleRoomSelect(roomId: string) {
    const nextRoom =
      rooms.find((room) => room.id === roomId) ??
      assistantRooms.find((room) => room.id === roomId) ??
      null;

    if (selectedRoomId !== roomId) {
      resetReservationDetails();
      setBookedSlots([]);
      setBookedSlotsLoading(true);
      setEnrichedSlots([]);
      setRoomSchedules([]);
    }

    if (nextRoom) {
      const nextCampus = getRoomCampus(nextRoom);

      if (nextCampus) {
        setActiveCampus(nextCampus);
      }

      setActiveBuilding({
        id: nextRoom.buildingId,
        name: nextRoom.buildingName,
      });
    }

    setDetailsStep(2);
    router.push(`/dashboard/reserve?roomId=${roomId}`);
  }

  function handleBackToRoomList() {
    setDetailsStep(2);
    setApprovalEmailError('');
    setSubmitError('');
    router.push('/dashboard/reserve');
  }

  async function handleSubmitReservation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !firebaseUser ||
      !selectedBuildingId ||
      !selectedRoomId ||
      !selectedCampus ||
      !startTime ||
      !endTime ||
      !programDepartmentOrganization ||
      !purpose
    ) {
      return;
    }

    if (!isTimeRangeValid(selectedCampus, startTime, endTime)) {
      return;
    }

    if (isRecurring) {
      if (recurringAvailabilityMessage) {
        setTimeError(recurringAvailabilityMessage);
        return;
      }
    } else {
      if (isPastTimeSelection(reservationDate, startTime, now)) {
        setTimeError(PAST_TIME_MESSAGE);
        return;
      }

      if (hasTimeConflict(reservationDate, startTime, endTime, bookedSlots)) {
        setTimeError(TIME_CONFLICT_MESSAGE);
        return;
      }

      // Cross-room conflict: block if user already has a reservation at this time.
      if (
        userActiveSlots.some(
          (slot) =>
            slot.date === reservationDate &&
            slot.roomId !== selectedRoomId &&
            startTime < slot.endTime &&
            endTime > slot.startTime
        )
      ) {
        setTimeError(USER_CONFLICT_MESSAGE);
        return;
      }
    }

    if (isRecurring && previewDates.length === 0) {
      setTimeError(NO_RECURRING_DATES_MESSAGE);
      return;
    }

    setTimeError('');
    setSubmitError('');
    setSubmitPhase('idle');
    setApprovalDocumentError('');

    if (isStudentReservation && !uploadedApprovalDocument) {
      setApprovalDocumentError(
        'Upload the concept paper or letter of approval before submitting this reservation.'
      );
      return;
    }

    const requiresFacultyApproval = selectedCampus === 'main' && !isFacultyReservation;
    const approvalEmail = requiresFacultyApproval
      ? approvalEmails.advisorEmail.trim().toLowerCase()
      : '';

    if (requiresFacultyApproval) {
      if (!approvalEmail || !validateEmail(approvalEmail)) {
        setApprovalEmailError(
          'Enter a valid email for your adviser, department head, or professor.'
        );
        return;
      }

      setValidatingApprover(true);
      setSubmitPhase('validating-email');

      try {
        await validateReservationApprover(selectedCampus, approvalEmail);
      } catch (error) {
        setApprovalEmailError(
          error instanceof Error
            ? error.message
            : 'We could not validate that approval email right now.'
        );
        setValidatingApprover(false);
        setSubmitPhase('idle');
        return;
      }

      setValidatingApprover(false);
    }
    setSubmitting(true);

    try {
      const displayName = firebaseUser.displayName || 'Student';
      const sharedData = {
        userId: firebaseUser.uid,
        userName: displayName,
        userRole: normalizedProfileRole,
        roomId: selectedRoomId,
        roomName: selectedRoomName,
        buildingId: selectedBuildingId,
        buildingName: selectedBuildingName,
        startTime,
        endTime,
        programDepartmentOrganization,
        purpose,
        ...(uploadedApprovalDocument
          ? {
              approvalDocumentMimeType: uploadedApprovalDocument.contentType,
              approvalDocumentName: uploadedApprovalDocument.name,
              approvalDocumentPath: uploadedApprovalDocument.path,
              approvalDocumentSize: uploadedApprovalDocument.size,
              approvalDocumentUrl: uploadedApprovalDocument.url,
            }
          : {}),
        equipment,
      };

      setSubmitPhase('creating-reservation');

      if (selectedCampus === 'main') {
        const reservationData = {
          ...sharedData,
          ...(approvalEmail ? { advisorEmail: approvalEmail } : {}),
          campus: 'main' as const,
        };

        if (isRecurring && selectedRecurringDays.length > 0 && recurringEndDate) {
          const ids = await createRecurringReservation(
            reservationData,
            selectedRecurringDays,
            reservationDate,
            recurringEndDate
          );
          setCreatedCount(ids.length);
        } else {
          await createReservation({
            ...reservationData,
            date: reservationDate
          });
          setCreatedCount(1);
        }
      } else {
        const reservationData = {
          ...sharedData,
          campus: 'digi' as const,
        };

        if (isRecurring && selectedRecurringDays.length > 0 && recurringEndDate) {
          const ids = await createRecurringReservation(
            reservationData,
            selectedRecurringDays,
            reservationDate,
            recurringEndDate
          );
          setCreatedCount(ids.length);
        } else {
          await createReservation({
            ...reservationData,
            date: reservationDate
          });
          setCreatedCount(1);
        }
      }

      setSubmitSuccess(true);
      setSubmitPhase('idle');
    } catch (error) {
      console.error('Failed to create reservation:', error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Failed to create reservation. Please try again.'
      );
      setSubmitPhase('idle');
    }

    setSubmitting(false);
    setValidatingApprover(false);
  }

  return (
    <main className="relative z-10 mx-auto max-w-5xl px-4 pt-[100px] py-8 pb-24 sm:px-6 lg:px-8 md:pb-8">
      <div className="mb-8">
        <div className="w-full rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-gray-800">Reserve a Room</h2>
          <p className="mt-1 text-gray-600">
            Browse rooms, filter quickly, and continue straight into reservation details.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 !rounded-2xl">
        {submitSuccess ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-10 w-10 ui-text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mb-2 text-xl font-bold text-black">
              {createdCount > 1 ? `${createdCount} Reservations Submitted!` : 'Reservation Submitted!'}
            </h3>
            <p className="mb-6 text-sm text-black">
              {createdCount > 1
                ? `${createdCount} recurring reservations have been created. Each one will follow the ${
                    selectedCampus === 'digi' || isFacultyReservation
                      ? 'building admin review'
                      : 'faculty review step for Main Campus'
                  }.`
                : selectedCampus === 'digi' || isFacultyReservation
                  ? 'Your request will go directly to the building admin for approval.'
                  : 'Your request will first be sent to the faculty reviewer you entered for approval.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-xl border border-dark/10 bg-dark/5 px-6 py-2.5 text-sm font-bold text-black transition-all hover:bg-primary/10 hover:text-primary"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => router.push('/dashboard/reservations')}
                className="btn-primary px-6 py-2.5 text-sm"
              >
                View My Reservations
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-black">New Reservation</h3>
                <p className="mt-0.5 text-xs text-black">
                  Step {currentStep} of 3 -{' '}
                  {currentStep === 1
                    ? 'Select Room'
                    : currentStep === 2
                      ? 'Reservation Details'
                      : 'Equipment & Approval'}
                </p>
              </div>
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-lg p-2 text-black transition-all hover:bg-primary/10 hover:text-primary"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6 flex gap-2">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    step <= currentStep ? 'bg-primary' : 'bg-dark/10'
                  }`}
                />
              ))}
            </div>

            {currentStep === 1 && (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-black">Choose a room</h4>
                    <p className="mt-1 text-xs text-black">
                      Select a campus, then building and floor to browse available rooms.
                    </p>
                  </div>
                  {activeFloor && (
                    <div className="glass-badge inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-black">
                      Showing {filteredRooms.length} of {rooms.length} rooms
                    </div>
                  )}
                </div>

                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="glass-input w-full px-12 py-3"
                    placeholder="Search by room name or number"
                  />
                </div>

                {/* STEP A - Campus Selection */}
                <div>
                  <p className="mb-2 text-xs font-bold text-black/60 uppercase tracking-wider">
                    1. Choose Campus
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['main', 'digi'] as ReservationCampus[]).map((campus) => (
                      <button
                        key={campus}
                        type="button"
                        onClick={() => handleCampusSelect(campus)}
                        className={`rounded-xl px-4 py-3 text-sm font-bold transition-all text-left ${
                          activeCampus === campus
                            ? 'bg-primary text-white shadow-[0_8px_24px_rgba(161,33,36,0.22)]'
                            : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                        }`}
                      >
                        <span className="block text-base">{getCampusName(campus)}</span>
                        <span
                          className={`block text-[11px] mt-0.5 ${
                            activeCampus === campus ? 'text-white/70' : 'text-black/50'
                          }`}
                        >
                          {campus === 'main'
                            ? 'GD1 / GD2 / GD3'
                            : 'Ground Floor to 4th Floor'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* STEP B - Building Selection (Main Campus only) */}
                {activeCampus === 'main' && (
                  <div>
                    <p className="mb-2 text-xs font-bold text-black/60 uppercase tracking-wider">
                      2. Choose Building
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {getManagedBuildingsForCampus('main').map((building) => (
                        <button
                          key={building.id}
                          type="button"
                          onClick={() =>
                            handleBuildingSelect({
                              id: building.id,
                              name: building.name,
                            })
                          }
                          className={`rounded-xl px-3 py-3 text-sm font-bold transition-all ${
                            activeBuilding?.id === building.id
                              ? 'bg-primary text-white shadow-[0_8px_24px_rgba(161,33,36,0.22)]'
                              : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                          }`}
                        >
                          {building.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP C - Floor Selection */}
                {(activeCampus === 'digi' ? activeBuilding : activeBuilding) &&
                  getFloorsForActiveBuilding().length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold text-black/60 uppercase tracking-wider">
                        {activeCampus === 'main' ? '3. Choose Floor' : '2. Choose Floor'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {getFloorsForActiveBuilding().map((floor) => (
                          <button
                            key={floor}
                            type="button"
                            onClick={() => handleFloorSelect(floor)}
                            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                              activeFloor === floor
                                ? 'bg-primary text-white shadow-[0_8px_24px_rgba(161,33,36,0.22)]'
                                : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                            }`}
                          >
                            {floor}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                {/* STEP D - Filter + Room List */}
                {(activeFloor || hasSearchQuery) && (
                  <>
                    {/* Breadcrumb */}
                    {activeFloor && (
                      <div className="flex items-center gap-1.5 text-xs text-black/50 font-bold">
                        <span>{getCampusName(activeCampus!)}</span>
                        {activeBuilding && activeCampus === 'main' && (
                          <>
                            <span>&gt;</span>
                            <span>{activeBuilding.name}</span>
                          </>
                        )}
                        <span>&gt;</span>
                        <span className="text-primary">{activeFloor}</span>
                        <button
                          type="button"
                          onClick={clearFloorSelection}
                          className="ml-2 text-black/40 hover:text-primary transition-colors"
                          title="Clear floor"
                        >
                            x
                        </button>
                      </div>
                    )}

                    {/* Filter chips */}
                    <div className="flex flex-wrap gap-2">
                      {FILTER_CHIPS.map((chip) => {
                        const isActive = activeRoomFilters.includes(chip.key);

                        return (
                          <button
                            key={chip.key}
                            type="button"
                            onClick={() => toggleRoomFilter(chip.key)}
                            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                              isActive
                                ? 'border border-primary/25 bg-primary/15 text-primary'
                                : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setActiveRoomFilters([])}
                        className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                          activeRoomFilters.length === 0
                            ? 'border border-primary/25 bg-primary/15 text-primary'
                            : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                        }`}
                      >
                        All Rooms
                      </button>
                    </div>

                    {/* Room grid */}
                    {roomsLoading ? (
                      <div className="py-12 text-center">
                        <svg
                          className="mx-auto mb-3 h-6 w-6 animate-spin text-black"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        <p className="text-sm text-black">Loading rooms...</p>
                      </div>
                    ) : roomsError ? (
                      <div className="rounded-2xl border border-red-500/20 bg-red-50/80 p-8 text-center">
                        <p className="text-sm font-bold text-black">Rooms could not be loaded.</p>
                        <p className="mt-1 text-xs text-black">{roomsError}</p>
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="mt-4 text-sm font-bold text-primary transition-colors hover:text-primary-hover"
                        >
                          Retry
                        </button>
                      </div>
                    ) : filteredRooms.length === 0 ? (
                      <div className="dashboard-empty-state rounded-2xl p-8 text-center">
                        <p className="text-sm font-bold text-black">
                          No rooms match the current filters.
                        </p>
                        <p className="mt-1 text-xs text-black">
                          Try clearing the search or filters, or choose a different floor.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveRoomFilters([]);
                          }}
                          className="mt-4 text-sm font-bold text-primary transition-colors hover:text-primary-hover"
                        >
                          Clear filters
                        </button>
                      </div>
                    ) : (
                      <div className="max-h-[34rem] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {filteredRooms.map((room) => {
                            const roomCampus = getRoomCampus(room);

                            return (
                              <RoomCard
                                key={room.id}
                                availability={getRoomAvailability(room, assistantReservations)}
                                buildingName={room.buildingName}
                                campusName={
                                  roomCampus
                                    ? getCampusName(roomCampus)
                                    : room.buildingName || 'Unknown campus'
                                }
                                floor={getFloorDisplayLabel(room.floor, {
                                  id: room.buildingId,
                                  name: room.buildingName,
                                })}
                                name={room.name}
                                onClick={() => handleRoomSelect(room.id)}
                                roomType={room.roomType}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {currentStep > 1 && !selectedRoom && roomsLoading && (
              <div className="py-12 text-center">
                <svg className="mx-auto mb-3 h-6 w-6 animate-spin text-black" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-black">Loading reservation details...</p>
              </div>
            )}

            {currentStep > 1 && !roomsLoading && !selectedRoom && (
              <div className="dashboard-empty-state rounded-2xl p-8 text-center">
                <p className="text-sm font-bold text-black">That room is no longer available.</p>
                <p className="mt-1 text-xs text-black">
                  Return to the room list and choose another available room.
                </p>
                <button
                  type="button"
                  onClick={handleBackToRoomList}
                  className="mt-4 text-sm font-bold text-primary transition-colors hover:text-primary-hover"
                >
                  Back to room list
                </button>
              </div>
            )}

            {selectedRoom && currentStep === 2 && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    onClick={handleBackToRoomList}
                    className="rounded-lg p-1 text-black transition-colors hover:text-primary"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h4 className="text-sm font-bold text-black">Reservation Details</h4>
                </div>

                <div className="mb-5 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-lg font-bold text-black">{selectedRoomName}</p>
                      <p className="mt-1 text-sm text-black">
                        {selectedBuildingName} | {getFloorDisplayLabel(selectedRoom.floor, {
                          id: selectedRoom.buildingId,
                          name: selectedRoom.buildingName,
                        })}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-primary/20 bg-white/80 px-3 py-1 text-xs font-bold text-primary">
                      {selectedRoomCampusName}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="glass-badge rounded-full px-3 py-1 text-xs font-bold text-black">
                      {selectedRoom.roomType || 'Room'}
                    </span>
                      <span className="glass-badge rounded-full px-3 py-1 text-xs font-bold text-black">
                        {selectedRoomAvailability ?? 'Available'}
                      </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/45 bg-white/85 p-3 shadow-sm backdrop-blur-xl">
                      <p className="text-[10px] font-bold uppercase text-black/55">Capacity</p>
                      <p className="mt-1 text-sm font-bold text-black">
                        {selectedRoom.capacity} people
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/45 bg-white/85 p-3 shadow-sm backdrop-blur-xl">
                      <p className="text-[10px] font-bold uppercase text-black/55">Air Conditioning</p>
                      <p className="mt-1 text-sm font-bold text-black">
                        {selectedRoom.acStatus || 'Not specified'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/45 bg-white/85 p-3 shadow-sm backdrop-blur-xl">
                      <p className="text-[10px] font-bold uppercase text-black/55">Category</p>
                      <p className="mt-1 text-sm font-bold text-black">
                        {selectedRoom.roomType || 'Room'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/45 bg-white/85 p-3 shadow-sm backdrop-blur-xl">
                      <p className="text-[10px] font-bold uppercase text-black/55">TV/Projector</p>
                      <p className="mt-1 text-sm font-bold text-black">
                        {selectedRoom.tvProjectorStatus || 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-dark/10 bg-dark/5 p-3">
                    <div>
                      <span className="text-sm font-bold text-black">Recurring Reservation</span>
                      <p className="mt-0.5 text-[10px] text-black">
                        Book the same time slot on multiple days
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRecurring((prev) => !prev);
                        if (isRecurring) {
                          setSelectedDays([]);
                          setRecurringEndDate('');
                        }
                      }}
                      className={`relative h-6 w-11 rounded-full transition-all ${
                        isRecurring ? 'bg-primary' : 'bg-dark/15'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${
                          isRecurring ? 'left-[22px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {isRecurring ? (
                    <>
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">
                          Select Days of the Week
                        </label>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                          {WEEKDAY_OPTIONS.map((day) => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleDay(day.value)}
                              className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
                                selectedDays.includes(day.value)
                                  ? 'border border-primary/30 bg-primary/20 text-primary'
                                  : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-bold text-black">
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={reservationDate}
                            onChange={(event) => setReservationDate(event.target.value)}
                            className="glass-input w-full px-4 py-3"
                            min={toLocalIsoDate(now)}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-bold text-black">
                            End Date
                          </label>
                          <input
                            type="date"
                            value={recurringEndDate}
                            onChange={(event) => setRecurringEndDate(event.target.value)}
                            className="glass-input w-full px-4 py-3"
                            min={reservationDate || toLocalIsoDate(now)}
                          />
                        </div>
                      </div>

                      {previewDates.length > 0 && (
                        <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                            </svg>
                            <span className="text-xs font-bold text-primary">
                              {previewDates.length} reservation{previewDates.length > 1 ? 's' : ''} will be created
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {previewDates.slice(0, 20).map((date) => (
                              <span
                                key={date}
                                className="rounded-lg border border-dark/10 bg-dark/5 px-2 py-0.5 text-[10px] font-bold text-black"
                              >
                                {formatDate(date)}
                              </span>
                            ))}
                            {previewDates.length > 20 && (
                              <span className="px-2 py-0.5 text-[10px] font-bold text-black">
                                ...and {previewDates.length - 20} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {recurringAvailabilityMessage && (
                        <p className="text-xs font-bold ui-text-red">
                          {recurringAvailabilityMessage}
                        </p>
                      )}
                    </>
                  ) : (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="block text-sm font-bold text-black">Date</label>
                        <div className="flex items-center gap-3 text-[11px] font-bold text-black">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                            Available
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-200/80" />
                            Partially booked
                          </span>
                        </div>
                      </div>
                      {/* Calendar + Schedule Panel grid */}
                      <div className={`grid gap-4 ${reservationDate ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                        <RoomAvailabilityPicker
                          bookedSlots={bookedSlots}
                          endTime={endTime}
                          startTime={startTime}
                          value={reservationDate}
                          onChange={(nextDate) => {
                            setReservationDate(nextDate);
                            if (submitError) {
                              setSubmitError('');
                            }
                          }}
                          loading={bookedSlotsLoading}
                          hideLegend
                        />

                        {/* Schedule Panel — appears when a date is selected */}
                        {reservationDate && selectedCampus && firebaseUser && (
                          <div className="rounded-2xl border border-white/45 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
                            <DaySchedulePanel
                              date={reservationDate}
                              roomEnrichedSlots={enrichedSlots}
                              userActiveSlots={userActiveSlots}
                              currentUserId={firebaseUser.uid}
                              currentRoomId={selectedRoomId}
                              campusTimeRange={CAMPUS_TIME_RANGES[selectedCampus]}
                              selectedStartTime={startTime}
                              selectedEndTime={endTime}
                              onSelectionChange={(selection) => {
                                setStartTime(selection?.startTime ?? '');
                                setEndTime(selection?.endTime ?? '');
                              }}
                            />
                          </div>
                        )}
                      </div>
                      {(timeError ||
                        (reservationDate && startTime && selectedPastTimeConflict) ||
                        (reservationDate && startTime && endTime && selectedTimeConflict)) && (
                        <p className="mt-2 text-xs font-bold ui-text-red">
                          {timeError || (selectedPastTimeConflict ? PAST_TIME_MESSAGE : TIME_CONFLICT_MESSAGE)}
                        </p>
                      )}
                      {reservationDate && startTime && endTime && selectedUserConflict && !selectedTimeConflict && (
                        <p className="mt-2 text-xs font-bold ui-text-red">
                          {USER_CONFLICT_MESSAGE}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-black">Start Time</label>
                      <select
                        value={startTime}
                        onChange={(event) => {
                          const nextStartTime = event.target.value;
                          setStartTime(nextStartTime);

                          if (
                            endTime &&
                            selectedCampus &&
                            !isTimeRangeValid(selectedCampus, nextStartTime, endTime)
                          ) {
                            setEndTime('');
                          }
                        }}
                        className="glass-input w-full px-4 py-3"
                      >
                        <option value="">Select start time</option>
                        {startTimeOptions.map((time) => (
                          <option key={time} value={time}>
                            {formatTimeLabel(time)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-black">End Time</label>
                      <select
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                        disabled={!startTime}
                        className="glass-input w-full px-4 py-3"
                      >
                        <option value="">{startTime ? 'Select end time' : 'Choose start time first'}</option>
                        {endTimeOptions.map((time) => (
                          <option key={time} value={time}>
                            {formatTimeLabel(time)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p className="text-[11px] text-black">
                    {selectedCampus === 'digi'
                      ? 'Digital Campus reservations can be booked from 7:00 AM to 5:00 PM in 1-hour intervals.'
                      : selectedCampus === 'main'
                        ? 'Main Campus reservations can be booked from 7:00 AM to 9:00 PM in 1-hour intervals.'
                        : 'Choose a room to load the allowed reservation hours.'}
                  </p>

                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-black">
                      Program/Department/Organization
                    </label>
                    <input
                      type="text"
                      value={programDepartmentOrganization}
                      onChange={(event) => setProgramDepartmentOrganization(event.target.value)}
                      className="glass-input w-full px-4 py-3"
                      placeholder="Enter your program, department, or organization"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-black">Purpose</label>
                    <input
                      type="text"
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                      maxLength={100}
                      className="glass-input w-full px-4 py-3"
                      placeholder="e.g., General Assembly of BSIT, Faculty Meeting, Rehearsals for Upcoming Event, Workshop"
                    />
                    <p
                      className={`mt-1 text-xs ${
                        purpose.length >= 100 ? 'ui-text-red' : 'text-black/70'
                      }`}
                    >
                      {100 - purpose.length}/100 characters
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      if (!canContinueToEquipment) {
                        return;
                      }

                      setDetailsStep(3);
                    }}
                    disabled={!canContinueToEquipment}
                    className="btn-primary flex w-full items-center justify-center px-4 py-3"
                  >
                    Next: Equipment & Approval
                    <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {selectedRoomAvailability === 'Occupied' && (
                    <p className="text-xs font-bold ui-text-red">
                      This room is no longer available. Please go back and choose another room before continuing.
                    </p>
                  )}
                </div>
              </div>
            )}

            {selectedRoom && selectedRoomAvailability !== 'Occupied' && currentStep === 3 && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    onClick={() => setDetailsStep(2)}
                    className="rounded-lg p-1 text-black transition-colors hover:text-primary"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h4 className="text-sm font-bold text-black">Materials / Equipment</h4>
                </div>

                {isRecurring && previewDates.length > 0 && (
                  <div className="mb-4 rounded-xl border border-primary/15 bg-primary/5 p-3">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="text-xs font-bold text-primary">
                        Recurring: {previewDates.length} reservations ({selectedRecurringDays.map((day) => DAY_LABELS_BY_VALUE.get(day) ?? `Day ${day}`).join(', ')})
                      </span>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmitReservation} className="space-y-6">
                  <div className="space-y-3">
                    {[
                        {
                          key: 'fans',
                          label: 'Fans'
                        },
                        {
                          key: 'speakers',
                          label: 'Speakers with Microphones'
                        },
                        {
                          key: 'televisions',
                          label: 'Televisions'
                        },
                        {
                          key: 'hdmiCables',
                          label: 'HDMI Cables'
                        },
                        {
                          key: 'monoblockChairs',
                          label: 'Monoblock Chairs'
                        },
                        {
                          key: 'tables',
                          label: 'Tables'
                        },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between rounded-xl border border-dark/10 bg-dark/5 p-3"
                      >
                        <span className="text-sm font-bold text-black">{item.label}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => updateEquipment(item.key, -1)}
                            disabled={equipment[item.key] === 0}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-dark/10 bg-dark/5 text-sm font-bold transition-all hover:bg-primary/10 hover:text-primary disabled:opacity-30"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-black">
                            {equipment[item.key]}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateEquipment(item.key, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-dark/10 bg-dark/5 text-sm font-bold transition-all hover:bg-primary/10 hover:text-primary"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {isStudentReservation && (
                    <div>
                      <h5 className="mb-3 text-sm font-bold uppercase tracking-wider text-black">
                        Concept Paper / Letter of Approval
                      </h5>
                      <div className="rounded-xl border border-dark/10 bg-dark/5 p-4">
                        <label className="mb-2 block text-xs font-bold text-black">
                          Upload a PDF, JPG, or PNG copy of your concept paper
                        </label>
                        <input
                          type="file"
                          accept=".pdf,image/jpeg,image/png"
                          onChange={handleApprovalDocumentChange}
                          disabled={documentUploading}
                          className="glass-input w-full px-4 py-3"
                        />
                        <p className="mt-2 text-[11px] text-black">
                          Students must attach a concept paper for both Main Campus and Digital Campus reservations.
                        </p>
                        {documentUploading && (
                          <p className="mt-1.5 text-xs font-bold text-black">Uploading concept paper...</p>
                        )}
                        {uploadedApprovalDocument && (
                          <p className="mt-1.5 text-xs font-bold text-primary">
                            Uploaded:{' '}
                            <a
                              href={uploadedApprovalDocument.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2 hover:text-primary-hover"
                            >
                              {uploadedApprovalDocument.name}
                            </a>
                          </p>
                        )}
                        {!uploadedApprovalDocument && approvalDocument && !documentUploading && !approvalDocumentError && (
                          <p className="mt-1.5 text-xs font-bold text-black">
                            Waiting for upload to finish for {approvalDocument.name}.
                          </p>
                        )}
                        {approvalDocumentError && (
                          <p className="mt-1.5 text-xs font-bold ui-text-red">{approvalDocumentError}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCampus !== 'digi' && !isFacultyReservation && (
                    <div>
                      <h5 className="mb-3 text-sm font-bold uppercase tracking-wider text-black">
                        Approval Routing
                      </h5>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-black">
                            Email of Adviser / Dept. Head / Professor
                          </label>
                          <input
                            type="email"
                            value={approvalEmails.advisorEmail}
                            onChange={(event) => {
                              setApprovalEmails((prev) => ({
                                ...prev,
                                advisorEmail: event.target.value,
                              }));

                              if (approvalEmailError) {
                                setApprovalEmailError('');
                              }

                              if (submitError) {
                                setSubmitError('');
                              }
                            }}
                            className={`glass-input w-full px-4 py-3 ${
                              approvalEmailError ? '!border-red-500/60' : ''
                            }`}
                            placeholder="Input email of adviser / dept. head / professor"
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-black">
                        Main Campus reservations first go to the faculty reviewer whose email you enter here.
                      </p>
                      {approvalEmailError && (
                        <p className="mt-1.5 text-xs font-bold ui-text-red">{approvalEmailError}</p>
                      )}
                    </div>
                  )}

                  {(timeError || submitError) && (
                    <p className="text-xs font-bold ui-text-red">
                      {timeError || submitError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || validatingApprover || documentUploading}
                    className="btn-primary flex w-full items-center justify-center px-4 py-3"
                  >
                    {submitting || validatingApprover ? (
                      <>
                        <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-black" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {submitPhase === 'validating-email'
                          ? 'Validating Email...'
                          : submitPhase === 'creating-reservation'
                            ? isRecurring
                              ? 'Creating Reservations...'
                              : 'Creating Reservation...'
                            : 'Submitting...'}
                      </>
                    ) : isRecurring && previewDates.length > 1 ? (
                      `Submit ${previewDates.length} Reservations`
                    ) : (
                      'Submit Reservation'
                    )}
                  </button>
                </form>
              </div>
            )}

            {selectedRoom && selectedRoomAvailability === 'Occupied' && currentStep === 3 && (
              <div className="dashboard-empty-state rounded-2xl p-8 text-center">
                <p className="text-sm font-bold text-black">
                  This room is no longer available.
                </p>
                <p className="mt-1 text-xs text-black">
                  The room status changed while you were filling out the reservation. Go back to the details step
                  or choose another room from the list.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailsStep(2)}
                    className="rounded-xl border border-dark/10 bg-dark/5 px-4 py-2 text-sm font-bold text-black transition-all hover:bg-primary/10 hover:text-primary"
                  >
                    Back to Details
                  </button>
                  <button
                    type="button"
                    onClick={handleBackToRoomList}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Choose Another Room
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <RoomAssistantWidget
        activeCampus={activeCampus}
        campusTimeRange={(selectedCampus ?? activeCampus) ? CAMPUS_TIME_RANGES[selectedCampus ?? activeCampus!] : null}
        dataLoading={assistantDataLoading}
        onOpenWithoutCampus={handleAssistantOpen}
        onSelectCampus={handleAssistantCampusSelect}
        onSelectRoom={handleRoomSelect}
        onSelectTimeslot={(nextTimeslot) => {
          setReservationDate(nextTimeslot.date);
          setStartTime(nextTimeslot.startTime);
          setEndTime(nextTimeslot.endTime);
          setTimeError('');
          setSubmitError('');
        }}
        reservations={assistantReservationRecords}
        rooms={recommendationRooms}
        selectedRoom={selectedRecommendationRoom}
        timeslot={selectedTimeslot}
      />
    </main>
  );
}
