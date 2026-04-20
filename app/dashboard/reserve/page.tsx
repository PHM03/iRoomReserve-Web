'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import RoomCard from '@/components/RoomCard';
import RoomAssistantWidget from '@/components/RoomAssistantWidget';
import { useAuth } from '@/context/AuthContext';
import { getCampusName, getManagedBuildingsForCampus } from '@/lib/campusAssignments';
import { inferCampusFromBuilding, type ReservationCampus } from '@/lib/campuses';
import { normalizeRole, USER_ROLES } from '@/lib/domain/roles';
import {
  createReservation,
  createRecurringReservation,
  validateReservationApprover,
} from '@/lib/reservations';
import { onRoomsByBuildingIds, type Room } from '@/lib/rooms';

type CampusFilter = ReservationCampus | 'all';
type DetailsStep = 2 | 3;
type RoomFilterKey = 'available' | 'classroom' | 'laboratory';
type AssistantRoomType = '' | 'glass' | 'lecture' | 'lab';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// TODO: Replace this temporary Digital Campus approver email with the actual configurable building admin source.
const DIGITAL_CAMPUS_BUILDING_ADMIN_EMAIL = 'kenjimwill.baltero@sdca.edu.ph';
const CAMPUS_TIME_RANGES: Record<ReservationCampus, { endMinutes: number; startMinutes: number }> = {
  digi: { startMinutes: 7 * 60, endMinutes: 17 * 60 },
  main: { startMinutes: 7 * 60, endMinutes: 21 * 60 },
};
const ALL_MANAGED_BUILDING_IDS = [
  ...getManagedBuildingsForCampus('main'),
  ...getManagedBuildingsForCampus('digi'),
].map((building) => building.id);
const FILTER_CHIPS: Array<{ key: RoomFilterKey; label: string }> = [
  { key: 'classroom', label: 'Classroom' },
  { key: 'laboratory', label: 'Laboratory' },
  { key: 'available', label: 'Available' },
];
const INITIAL_EQUIPMENT = {
  fans: 0,
  speakers: 0,
  televisions: 0,
  hdmiCables: 0,
  monoblockChairs: 0,
  tables: 0,
};

function timeStringToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTimeString(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatTimeLabel(value: string): string {
  const minutes = timeStringToMinutes(value);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const normalizedHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${normalizedHour}:${mins.toString().padStart(2, '0')} ${suffix}`;
}

function getCampusTimeOptions(campus: ReservationCampus | null): string[] {
  if (!campus) {
    return [];
  }

  const { startMinutes, endMinutes } = CAMPUS_TIME_RANGES[campus];
  const options: string[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
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
    start % 30 === 0 &&
    end % 30 === 0 &&
    end - start >= 60
  );
}

function getRoomCampus(room: Room): ReservationCampus | null {
  return inferCampusFromBuilding({
    id: room.buildingId,
    name: room.buildingName,
  });
}

function getRoomAvailability(room: Room): 'Available' | 'Occupied' {
  return room.status === 'Available' ? 'Available' : 'Occupied';
}

function matchesRoomType(room: Room, filter: Exclude<RoomFilterKey, 'available'>): boolean {
  const roomType = room.roomType.trim().toLowerCase();

  if (filter === 'classroom') {
    return roomType.includes('classroom');
  }

  return roomType.includes('laboratory');
}

function mapRoomTypeToRecommendationType(room: Room): AssistantRoomType {
  const roomType = room.roomType.trim().toLowerCase();

  if (roomType.includes('glass')) {
    return 'glass';
  }

  if (roomType.includes('lab')) {
    return 'lab';
  }

  return 'lecture';
}

function buildRecommendationFeatures(room: Room): string[] {
  const features: string[] = [];

  if (!room.acStatus.trim().toLowerCase().includes('no')) {
    features.push('AC');
  }

  if (!room.tvProjectorStatus.trim().toLowerCase().includes('no')) {
    features.push('Projector');
  }

  return features;
}

function toRecommendationRoom(room: Room) {
  return {
    roomId: room.id,
    type: mapRoomTypeToRecommendationType(room),
    capacity: room.capacity,
    building: room.buildingName,
    features: buildRecommendationFeatures(room),
    // The live reserve page does not expose sentiment yet, so it defaults to neutral.
    sentimentScore: 0,
    label: room.name,
    originalRoom: room,
  };
}

export default function ReserveRoomPage() {
  const { firebaseUser, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRoomParam = searchParams.get('roomId') ?? '';

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [activeCampusFilter, setActiveCampusFilter] = useState<CampusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoomFilters, setActiveRoomFilters] = useState<RoomFilterKey[]>([]);
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
  const [validatingApprover, setValidatingApprover] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'validating-email' | 'creating-reservation'>('idle');
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [equipment, setEquipment] = useState<Record<string, number>>({
    ...INITIAL_EQUIPMENT,
  });
  const [approvalEmailError, setApprovalEmailError] = useState('');
  const [approvalEmails, setApprovalEmails] = useState({
    advisorEmail: '',
  });

  useEffect(() => {
    const unsubscribe = onRoomsByBuildingIds(ALL_MANAGED_BUILDING_IDS, (nextRooms) => {
      setRooms(nextRooms);
      setRoomsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const selectedRoom = selectedRoomParam
    ? rooms.find((room) => room.id === selectedRoomParam) ?? null
    : null;
  const selectedCampus = selectedRoom ? getRoomCampus(selectedRoom) : null;
  const selectedRoomId = selectedRoom?.id ?? '';
  const selectedRoomName = selectedRoom?.name ?? '';
  const selectedBuildingId = selectedRoom?.buildingId ?? '';
  const selectedBuildingName = selectedRoom?.buildingName ?? '';
  const selectedRoomCampusName = selectedCampus
    ? getCampusName(selectedCampus)
    : selectedBuildingName || 'Unknown campus';
  const recommendationRooms = rooms.map(toRecommendationRoom);
  const selectedRecommendationRoom = selectedRoom
    ? toRecommendationRoom(selectedRoom)
    : null;
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
        return optionMinutes <= CAMPUS_TIME_RANGES[selectedCampus].endMinutes - 60;
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
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasTypeFilters =
    activeRoomFilters.includes('classroom') || activeRoomFilters.includes('laboratory');
  const filteredRooms = rooms.filter((room) => {
    const roomCampus = getRoomCampus(room);
    const matchesCampus =
      activeCampusFilter === 'all' ? true : roomCampus === activeCampusFilter;
    const searchableText = [
      room.name,
      room.buildingName,
      room.floor,
      room.roomType,
    ]
      .join(' ')
      .toLowerCase();
    const matchesSearch =
      normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
    const matchesType =
      !hasTypeFilters ||
      activeRoomFilters
        .filter((filter): filter is Exclude<RoomFilterKey, 'available'> => filter !== 'available')
        .some((filter) => matchesRoomType(room, filter));
    const matchesAvailability =
      !activeRoomFilters.includes('available') || room.status === 'Available';

    return matchesCampus && matchesSearch && matchesType && matchesAvailability;
  });
  const previewDates = isRecurring ? getPreviewDates() : [];
  const canContinueToEquipment = canProceedToEquipment();

  function resetReservationDetails() {
    setReservationDate('');
    setStartTime('');
    setEndTime('');
    setProgramDepartmentOrganization('');
    setPurpose('');
    setSubmitError('');
    setApprovalEmailError('');
    setCreatedCount(0);
    setIsRecurring(false);
    setSelectedDays([]);
    setRecurringEndDate('');
    setEquipment({ ...INITIAL_EQUIPMENT });
    setApprovalEmails({
      advisorEmail: '',
    });
  }

  function getPreviewDates(): string[] {
    if (!reservationDate || !recurringEndDate || selectedDays.length === 0) {
      return [];
    }

    const dates: string[] = [];
    const current = new Date(`${reservationDate}T00:00:00`);
    const end = new Date(`${recurringEndDate}T00:00:00`);

    while (current <= end && dates.length < 20) {
      if (selectedDays.includes(current.getDay())) {
        dates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  function canProceedToEquipment(): boolean {
    if (
      !startTime ||
      !endTime ||
      !programDepartmentOrganization ||
      !purpose ||
      !isTimeRangeValid(selectedCampus, startTime, endTime)
    ) {
      return false;
    }

    if (isRecurring) {
      return !!reservationDate && !!recurringEndDate && selectedDays.length > 0;
    }

    return !!reservationDate;
  }

  function toggleDay(day: number) {
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

  function validateEmail(email: string): boolean {
    if (!email.trim()) {
      return true;
    }

    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  function handleCampusFilterChange(nextCampus: CampusFilter) {
    setActiveCampusFilter(nextCampus);
  }

  function toggleRoomFilter(filter: RoomFilterKey) {
    setActiveRoomFilters((prev) =>
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter]
    );
  }

  function handleRoomSelect(roomId: string) {
    if (selectedRoomId !== roomId) {
      resetReservationDetails();
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

  async function handleSubmitReservation() {
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

    setSubmitError('');
    setSubmitPhase('idle');

    const approvalEmail =
      selectedCampus === 'digi'
        ? DIGITAL_CAMPUS_BUILDING_ADMIN_EMAIL
        : approvalEmails.advisorEmail.trim().toLowerCase();

    if (!approvalEmail || !validateEmail(approvalEmail)) {
      setApprovalEmailError(
        selectedCampus === 'digi'
          ? 'Enter a valid iRoomReserve email for the Digital Campus building admin.'
          : 'Enter a valid email for your adviser, department head, or professor.'
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
    setSubmitting(true);

    try {
      const displayName = firebaseUser.displayName || 'Student';
      const normalizedUserRole = normalizeRole(profile?.role) ?? USER_ROLES.STUDENT;
      const sharedData = {
        userId: firebaseUser.uid,
        userName: displayName,
        userRole: normalizedUserRole,
        roomId: selectedRoomId,
        roomName: selectedRoomName,
        buildingId: selectedBuildingId,
        buildingName: selectedBuildingName,
        startTime,
        endTime,
        programDepartmentOrganization,
        purpose,
        equipment,
      };

      setSubmitPhase('creating-reservation');

      if (selectedCampus === 'main') {
        const reservationData = {
          ...sharedData,
          advisorEmail: approvalEmail,
          campus: 'main' as const,
        };

        if (isRecurring && selectedDays.length > 0 && recurringEndDate) {
          const ids = await createRecurringReservation(
            reservationData,
            selectedDays,
            reservationDate,
            recurringEndDate
          );
          setCreatedCount(ids.length);
        } else {
          await createReservation({ ...reservationData, date: reservationDate });
          setCreatedCount(1);
        }
      } else {
        const reservationData = {
          ...sharedData,
          buildingAdminEmail: approvalEmail,
          campus: 'digi' as const,
        };

        if (isRecurring && selectedDays.length > 0 && recurringEndDate) {
          const ids = await createRecurringReservation(
            reservationData,
            selectedDays,
            reservationDate,
            recurringEndDate
          );
          setCreatedCount(ids.length);
        } else {
          await createReservation({ ...reservationData, date: reservationDate });
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
    <main className="relative z-10 mx-auto max-w-5xl px-4 py-8 pb-24 sm:px-6 lg:px-8 md:pb-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-black">Reserve a Room</h2>
        <p className="mt-1 text-black">
          Browse rooms, filter quickly, and continue straight into reservation details.
        </p>
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
                    selectedCampus === 'digi'
                      ? 'Digital Campus building admin review'
                      : 'faculty review step for Main Campus'
                  }.`
                : selectedCampus === 'digi'
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
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-black">Choose a room</h4>
                    <p className="mt-1 text-xs text-black">
                      Campus tabs, search, and filter chips work together on this page.
                    </p>
                  </div>
                  <div className="glass-badge inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-black">
                    Showing {filteredRooms.length} of {rooms.length} rooms
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCampusFilter('all')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                      activeCampusFilter === 'all'
                        ? 'bg-primary text-white shadow-[0_8px_24px_rgba(161,33,36,0.22)]'
                        : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    All Rooms
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCampusFilterChange('main')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                      activeCampusFilter === 'main'
                        ? 'bg-primary text-white shadow-[0_8px_24px_rgba(161,33,36,0.22)]'
                        : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {getCampusName('main')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCampusFilterChange('digi')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                      activeCampusFilter === 'digi'
                        ? 'bg-primary text-white shadow-[0_8px_24px_rgba(161,33,36,0.22)]'
                        : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {getCampusName('digi')}
                  </button>
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

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveRoomFilters([])}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                      activeRoomFilters.length === 0
                        ? 'border border-primary/25 bg-primary/15 text-primary'
                        : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    All
                  </button>
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
                </div>

                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h5 className="text-sm font-bold text-black">Need help choosing?</h5>
                      <p className="mt-1 text-xs text-black">
                        Use the floating assistant in the bottom-right corner for a guided conversation
                        or instant alternatives when a room is unavailable.
                      </p>
                    </div>
                    <div className="inline-flex items-center rounded-full border border-primary/20 bg-white/80 px-3 py-1 text-[11px] font-bold text-primary">
                      Messenger-style assistant
                    </div>
                  </div>
                </div>

                {roomsLoading ? (
                  <div className="py-12 text-center">
                    <svg className="mx-auto mb-3 h-6 w-6 animate-spin text-black" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-black">Loading rooms...</p>
                  </div>
                ) : filteredRooms.length === 0 ? (
                  <div className="rounded-2xl border border-dark/10 bg-dark/5 p-8 text-center">
                    <p className="text-sm font-bold text-black">No rooms match the current filters.</p>
                    <p className="mt-1 text-xs text-black">
                      Try switching campuses, clearing chips, or searching for another room.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCampusFilter('all');
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
                            availability={getRoomAvailability(room)}
                            buildingName={room.buildingName}
                            campusName={
                              roomCampus ? getCampusName(roomCampus) : room.buildingName || 'Unknown campus'
                            }
                            floor={room.floor}
                            name={room.name}
                            onClick={() => handleRoomSelect(room.id)}
                            roomType={room.roomType}
                          />
                        );
                      })}
                    </div>
                  </div>
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
              <div className="rounded-2xl border border-dark/10 bg-dark/5 p-8 text-center">
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

            {selectedRoom && selectedRoom.status !== 'Available' && (
              <div className="rounded-2xl border border-orange-500/20 bg-orange-50/80 p-6 text-center">
                <p className="text-sm font-bold text-black">
                  {selectedRoomName} is currently occupied.
                </p>
                <p className="mt-1 text-xs text-black">
                  The floating assistant has opened with the top 3 alternatives for this time slot.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackToRoomList}
                    className="text-sm font-bold text-primary transition-colors hover:text-primary-hover"
                  >
                    Back to room list
                  </button>
                </div>
              </div>
            )}

            {selectedRoom && selectedRoom.status === 'Available' && currentStep === 2 && (
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
                        {selectedBuildingName} | {selectedRoom.floor}
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
                      {getRoomAvailability(selectedRoom)}
                    </span>
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
                        <div className="flex gap-2">
                          {DAY_LABELS.map((label, index) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => toggleDay(index)}
                              className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all ${
                                selectedDays.includes(index)
                                  ? 'border border-primary/30 bg-primary/20 text-primary'
                                  : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                              }`}
                            >
                              {label}
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
                            min={new Date().toISOString().split('T')[0]}
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
                            min={reservationDate || new Date().toISOString().split('T')[0]}
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
                            {previewDates.map((date) => (
                              <span
                                key={date}
                                className="rounded-lg border border-dark/10 bg-dark/5 px-2 py-0.5 text-[10px] font-bold text-black"
                              >
                                {date}
                              </span>
                            ))}
                            {previewDates.length >= 20 && (
                              <span className="px-2 py-0.5 text-[10px] font-bold text-black">...and more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-black">Date</label>
                      <input
                        type="date"
                        value={reservationDate}
                        onChange={(event) => setReservationDate(event.target.value)}
                        className="glass-input w-full px-4 py-3"
                        min={new Date().toISOString().split('T')[0]}
                      />
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
                      ? 'Digital Campus reservations can be booked from 7:00 AM to 5:00 PM in 30-minute intervals, with at least 1 hour between start and end time.'
                      : selectedCampus === 'main'
                        ? 'Main Campus reservations can be booked from 7:00 AM to 9:00 PM in 30-minute intervals, with at least 1 hour between start and end time.'
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
                      className="glass-input w-full px-4 py-3"
                      placeholder="e.g., General Assembly of BSIT, Faculty Meeting, Rehearsals for Upcoming Event, Workshop"
                    />
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
                </div>
              </div>
            )}

            {selectedRoom && selectedRoom.status === 'Available' && currentStep === 3 && (
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
                        Recurring: {previewDates.length} reservations ({selectedDays.map((day) => DAY_LABELS[day]).join(', ')})
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="space-y-3">
                    {[
                      { key: 'fans', label: 'Fans' },
                      { key: 'speakers', label: 'Speakers with Microphones' },
                      { key: 'televisions', label: 'Televisions' },
                      { key: 'hdmiCables', label: 'HDMI Cables' },
                      { key: 'monoblockChairs', label: 'Monoblock Chairs' },
                      { key: 'tables', label: 'Tables' },
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

                  {selectedCampus !== 'digi' && (
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

                  {submitError && <p className="text-xs font-bold ui-text-red">{submitError}</p>}

                  <button
                    onClick={handleSubmitReservation}
                    disabled={submitting || validatingApprover}
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
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <RoomAssistantWidget
        isAvailable={(roomId) => {
          const room = rooms.find((nextRoom) => nextRoom.id === roomId);
          return room?.status === 'Available';
        }}
        onSelectRoom={handleRoomSelect}
        rooms={recommendationRooms}
        selectedRoom={selectedRecommendationRoom}
        selectedRoomAvailable={selectedRoom ? selectedRoom.status === 'Available' : null}
        timeslot={selectedTimeslot}
      />
    </main>
  );
}
