'use client';

import React, { useEffect, useMemo, useState } from 'react';
import BuildingSection from '@/components/room-status/BuildingSection';
import CampusSelector from '@/components/room-status/CampusSelector';
import FloorAccordion from '@/components/room-status/FloorAccordion';
import RoomList from '@/components/room-status/RoomList';
import { useAuth } from '@/context/AuthContext';
import { getManagedBuildingsForCampus } from '@/lib/buildings/campusAssignments';
import { onBuildingsByIds, type Building } from '@/lib/buildings/buildings';
import { inferCampusFromBuilding, type ReservationCampus } from '@/lib/buildings/campuses';
import { onRoomsByBuildingIds, type Room } from '@/lib/rooms/rooms';
import {
  confirmFinishedReservation,
  onReservationsByBuildingIds,
  type Reservation,
} from '@/lib/reservations/reservations';
import {
  onRoomUnavailabilityByBuildingIds,
  type RoomUnavailability,
} from '@/lib/reservations/roomAvailability';
import {
  buildCampusOptions,
  compareFloors,
  groupOperationalRoomStatusesByFloor,
  type CampusOption,
  type OperationalRoomStatusViewItem,
} from '@/lib/rooms/roomStatusView';
import {
  isRoomScheduleActive,
  isRoomUnavailabilityActive,
  resolveRoomOperationalState,
  type RoomOperationalActivity,
} from '@/lib/rooms/roomStatus';
import {
  doesScheduleMatchContext,
  normalizeScheduleContext,
} from '@/lib/schedules/scheduleContext';
import { onSchedulesByBuildingIds, type Schedule } from '@/lib/schedules/schedules';

type ActivityFilter = 'All' | 'Available' | 'Unavailable' | 'Reserved' | 'Occupied' | 'Class in progress' | 'Time block';

const ACTIVITY_FILTERS: ActivityFilter[] = [
  'All',
  'Available',
  'Unavailable',
  'Reserved',
  'Occupied',
  'Class in progress',
  'Time block',
];

function getPendingFinishByRoom(reservations: Reservation[]) {
  const pendingByRoom = new Map<string, Reservation>();

  reservations.forEach((reservation) => {
    if (
      reservation.status !== 'completed' ||
      !reservation.checkedInAt ||
      reservation.occupancyReleasedAt
    ) {
      return;
    }

    const existing = pendingByRoom.get(reservation.roomId);
    if (!existing || (reservation.updatedAt?.seconds ?? 0) > (existing.updatedAt?.seconds ?? 0)) {
      pendingByRoom.set(reservation.roomId, reservation);
    }
  });

  return pendingByRoom;
}

function isUnreleasedCheckedIn(
  reservation: OperationalRoomStatusViewItem['state']['reservation']
) {
  return Boolean(reservation?.checkedInAt && !reservation.occupancyReleasedAt);
}

function labelClassName() {
  return 'flex min-w-[150px] flex-1 flex-col gap-1 text-[11px] font-bold text-black/65';
}

export default function RoomStatusPage() {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;
  const managedBuildings = useMemo(
    () => getManagedBuildingsForCampus(profile?.campus),
    [profile?.campus]
  );
  const [buildingRecords, setBuildingRecords] = useState<Building[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<ReservationCampus | ''>('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [roomUnavailability, setRoomUnavailability] = useState<RoomUnavailability[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('All');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('All');
  const [finishingReservationId, setFinishingReservationId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const managedBuildingIds = useMemo(
    () => [...new Set(managedBuildings.map((building) => building.id))],
    [managedBuildings]
  );

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!uid || managedBuildingIds.length === 0) {
      setBuildingRecords([]);
      return;
    }

    let cancelled = false;
    const unsubscribeBuildings = onBuildingsByIds(managedBuildingIds, (nextBuildings) => {
      if (cancelled) return;
      setBuildingRecords(nextBuildings);
    });

    return () => {
      cancelled = true;
      unsubscribeBuildings();
    };
  }, [managedBuildingIds, uid]);

  const liveById = useMemo(
    () => new Map(buildingRecords.map((building) => [building.id, building])),
    [buildingRecords]
  );
  const fallbackNames = useMemo(
    () => new Map(managedBuildings.map((building) => [building.id, building.name])),
    [managedBuildings]
  );
  const managedBuildingOptions = useMemo(
    () => managedBuildingIds.map((buildingId) => {
      const liveBuilding = liveById.get(buildingId);
      if (liveBuilding) return liveBuilding;

      const fallbackName = fallbackNames.get(buildingId) ?? buildingId;
      return {
        id: buildingId,
        name: fallbackName,
        code: '',
        address: '',
        floors: 0,
        campus: inferCampusFromBuilding({ id: buildingId, name: fallbackName }) ?? 'main',
        assignedAdminUid: null,
        activeScheduleSemester: '1st Semester',
        activeScheduleAcademicYear: 'A.Y. 2025-2026',
      } satisfies Building;
    }),
    [fallbackNames, liveById, managedBuildingIds]
  );
  const campusOptions: CampusOption[] = useMemo(
    () => buildCampusOptions(managedBuildingOptions),
    [managedBuildingOptions]
  );
  const effectiveCampusId = campusOptions.some((campus) => campus.id === selectedCampusId)
    ? selectedCampusId
    : campusOptions[0]?.id ?? '';
  const activeCampus = useMemo(
    () => campusOptions.find((campus) => campus.id === effectiveCampusId) ?? campusOptions[0],
    [campusOptions, effectiveCampusId]
  );
  const buildingOptions = useMemo(() => activeCampus?.buildings ?? [], [activeCampus]);
  const activeCampusBuildingIdsKey = buildingOptions
    .map((building) => building.buildingId)
    .join('|');
  const activeCampusBuildingIds = useMemo(
    () => activeCampusBuildingIdsKey ? activeCampusBuildingIdsKey.split('|') : [],
    [activeCampusBuildingIdsKey]
  );
  const activeCampusBuildingIdSet = useMemo(
    () => new Set(activeCampusBuildingIds),
    [activeCampusBuildingIds]
  );

  useEffect(() => {
    if (!uid || activeCampusBuildingIds.length === 0) {
      setRooms([]);
      setReservations([]);
      setSchedules([]);
      setRoomUnavailability([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const loadedSources = new Set<string>();
    setIsLoading(true);
    setLoadError(null);

    const markLoaded = (source: string) => {
      loadedSources.add(source);
      if (loadedSources.size === 4) setIsLoading(false);
    };
    const handleError = (source: string) => (error: unknown) => {
      if (cancelled) return;
      console.warn(`Unable to load Utility room monitor ${source}:`, error);
      setLoadError('Some room monitor information could not be loaded. Try again later.');
      setIsLoading(false);
    };

    const unsubscribeRooms = onRoomsByBuildingIds(
      activeCampusBuildingIds,
      (nextRooms) => {
        if (cancelled) return;
        setRooms(nextRooms.filter((room) => activeCampusBuildingIdSet.has(room.buildingId)));
        markLoaded('rooms');
      },
      handleError('rooms')
    );
    const unsubscribeReservations = onReservationsByBuildingIds(
      activeCampusBuildingIds,
      (nextReservations) => {
        if (cancelled) return;
        setReservations(nextReservations.filter((reservation) => activeCampusBuildingIdSet.has(reservation.buildingId)));
        markLoaded('reservations');
      },
      handleError('reservations')
    );
    const unsubscribeSchedules = onSchedulesByBuildingIds(
      activeCampusBuildingIds,
      (nextSchedules) => {
        if (cancelled) return;
        setSchedules(nextSchedules.filter((schedule) => activeCampusBuildingIdSet.has(schedule.buildingId)));
        markLoaded('schedules');
      },
      handleError('schedules')
    );
    const unsubscribeRoomUnavailability = onRoomUnavailabilityByBuildingIds(
      activeCampusBuildingIds,
      (nextBlocks) => {
        if (cancelled) return;
        setRoomUnavailability(nextBlocks.filter((block) => activeCampusBuildingIdSet.has(block.buildingId)));
        markLoaded('time blocks');
      },
      handleError('time blocks')
    );

    return () => {
      cancelled = true;
      unsubscribeRooms();
      unsubscribeReservations();
      unsubscribeSchedules();
      unsubscribeRoomUnavailability();
    };
  }, [activeCampusBuildingIdSet, activeCampusBuildingIds, uid]);

  const pendingFinishReservationsByRoomId = useMemo(
    () => getPendingFinishByRoom(reservations),
    [reservations]
  );

  const roomStatuses: OperationalRoomStatusViewItem[] = useMemo(() => rooms
    .filter((room) => activeCampusBuildingIdSet.has(room.buildingId))
    .map((room) => {
      const building = liveById.get(room.buildingId);
      const activeScheduleContext = normalizeScheduleContext({
        academicYear: building?.activeScheduleAcademicYear,
        semester: building?.activeScheduleSemester,
      });
      const roomSchedules = schedules.filter((schedule) =>
        schedule.roomId === room.id && doesScheduleMatchContext(schedule, activeScheduleContext)
      );
      const activeSchedule = roomSchedules.find((schedule) => isRoomScheduleActive(schedule, now)) ?? null;
      const activeUnavailability = roomUnavailability.find((block) =>
        block.roomId === room.id && isRoomUnavailabilityActive(block, now)
      ) ?? null;
      const state = resolveRoomOperationalState(room, reservations, {
        activeSchedule,
        activeUnavailability,
        now,
      });
      const pendingFinish = pendingFinishReservationsByRoomId.get(room.id) ?? null;
      const reservation = state.reservation ?? pendingFinish;
      const activity: RoomOperationalActivity = pendingFinish && state.condition === 'Available'
        ? 'Occupied'
        : state.activity;
      const finishReservation = isUnreleasedCheckedIn(state.reservation)
        ? state.reservation
        : pendingFinish;

      return {
        room,
        state,
        activity,
        reservation,
        activeSchedule,
        activeUnavailability,
        finishReservation,
      };
    }), [
      activeCampusBuildingIdSet,
      liveById,
      now,
      pendingFinishReservationsByRoomId,
      reservations,
      roomUnavailability,
      rooms,
      schedules,
    ]);

  const counts = useMemo(() => ({
    total: roomStatuses.length,
    available: roomStatuses.filter((item) => item.state.condition === 'Available').length,
    unavailable: roomStatuses.filter((item) => item.state.condition === 'Unavailable').length,
    reservedOrOccupied: roomStatuses.filter((item) => item.activity === 'Reserved' || item.activity === 'Occupied').length,
  }), [roomStatuses]);

  const floorOptions = useMemo(
    () => [...new Set(roomStatuses.map((item) => item.room.floor))].sort(compareFloors),
    [roomStatuses]
  );
  const filteredRoomStatuses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return roomStatuses.filter(({ room, activity, state }) => {
      if (normalizedSearch && !`${room.name} ${room.floor} ${room.roomType} ${room.buildingName}`.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      if (floorFilter !== 'All' && room.floor !== floorFilter) return false;
      const filterActivity = state.condition === 'Unavailable' ? 'Unavailable' : activity;
      return activityFilter === 'All' || filterActivity === activityFilter;
    });
  }, [activityFilter, floorFilter, roomStatuses, search]);

  const buildingSections = useMemo(() => buildingOptions.map((building) => ({
    building,
    floors: groupOperationalRoomStatusesByFloor(
      filteredRoomStatuses.filter((item) => item.room.buildingId === building.buildingId)
    ),
  })).filter((section) => section.floors.length > 0), [buildingOptions, filteredRoomStatuses]);
  const shouldShowBuildingSections = activeCampus?.id === 'main' || buildingSections.length > 1;
  const campusFloorGroups = shouldShowBuildingSections
    ? []
    : groupOperationalRoomStatusesByFloor(filteredRoomStatuses);

  const handleConfirmFinishedReservation = async (reservationId: string) => {
    setFinishingReservationId(reservationId);
    setActionMessage(null);
    try {
      await confirmFinishedReservation(reservationId);
      setActionMessage('Reservation finish confirmed.');
    } catch (error) {
      console.warn('Failed to confirm finished reservation:', error);
      setActionMessage('Unable to finish this reservation. Check your building access and try again.');
    } finally {
      setFinishingReservationId(null);
    }
  };

  if (managedBuildingIds.length === 0) {
    return (
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-[100px] sm:px-6 lg:px-8 md:pb-8">
        <div className="mb-8">
          <div className="inline-block rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
            <h2 className="text-2xl font-bold text-gray-800">Room Status &amp; Schedule</h2>
            <p className="mt-1 text-gray-600">No campus is assigned to your account yet.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-[100px] sm:px-6 lg:px-8 md:pb-8">
      <div className="mb-6 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
        <h2 className="text-2xl font-bold text-gray-800">Room Status &amp; Schedule</h2>
        <p className="mt-1 text-gray-600">
          Operational room information for <span className="ui-text-teal font-bold">{activeCampus?.label ?? 'your assigned campus'}</span>.
        </p>
      </div>

      {campusOptions.length > 1 ? (
        <div className="mb-6">
          <CampusSelector
            options={campusOptions}
            value={effectiveCampusId}
            onChange={(campus) => {
              setSelectedCampusId(campus);
              setRooms([]);
              setReservations([]);
              setSchedules([]);
              setRoomUnavailability([]);
              setActionMessage(null);
            }}
          />
        </div>
      ) : null}

      <div className="glass-card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className={labelClassName()}>
          Search rooms
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Room, floor, type, building"
            className="glass-input h-9 px-3 text-xs font-bold text-black placeholder:text-black/35"
          />
        </label>
        <label className={labelClassName()}>
          Floor
          <select value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)} className="glass-input h-9 px-2 text-xs font-bold text-black">
            <option value="All">All floors</option>
            {floorOptions.map((floor) => <option key={floor} value={floor}>{floor}</option>)}
          </select>
        </label>
        <label className={labelClassName()}>
          Activity
          <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)} className="glass-input h-9 px-2 text-xs font-bold text-black">
            {ACTIVITY_FILTERS.map((activity) => <option key={activity} value={activity}>{activity}</option>)}
          </select>
        </label>
        <span className="text-[11px] font-bold text-black/45 sm:ml-auto">{filteredRoomStatuses.length} of {roomStatuses.length} rooms</span>
      </div>

      {loadError ? <p role="alert" className="mb-4 rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{loadError}</p> : null}
      {actionMessage ? <p role="status" className="mb-4 rounded-xl border border-primary/15 bg-white/75 px-4 py-3 text-sm font-bold text-black/70">{actionMessage}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ['Total rooms', counts.total],
          ['Available', counts.available],
          ['Unavailable', counts.unavailable],
          ['Reserved / occupied', counts.reservedOrOccupied],
        ].map(([label, value]) => (
          <div key={label} className="glass-card p-4">
            <p className="text-xs font-bold text-black">{label}</p>
            <p className="mt-1 text-2xl font-bold text-black">{value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="dashboard-empty-state rounded-2xl p-10 text-center backdrop-blur-xl">
          <p className="text-sm font-bold text-black/60">Loading room status…</p>
        </div>
      ) : roomStatuses.length === 0 ? (
        <div className="dashboard-empty-state rounded-2xl p-12 text-center backdrop-blur-xl">
          <p className="text-base font-bold text-black">No rooms are configured for this campus yet.</p>
          <p className="mt-2 text-sm text-black">Once rooms are added, they will appear in their building and floor groups.</p>
        </div>
      ) : filteredRoomStatuses.length === 0 ? (
        <div className="dashboard-empty-state rounded-2xl p-10 text-center backdrop-blur-xl">
          <p className="text-sm font-bold text-black/60">No rooms match your filters.</p>
        </div>
      ) : shouldShowBuildingSections ? (
        <div className="space-y-5">
          {buildingSections.map((section) => (
            <BuildingSection
              key={section.building.buildingId}
              building={section.building}
              floors={section.floors}
              onFinishReservation={handleConfirmFinishedReservation}
              finishingReservationId={finishingReservationId}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {campusFloorGroups.map((floorGroup) => (
            <FloorAccordion
              key={`${effectiveCampusId}:${floorGroup.id}`}
              floor={floorGroup.label}
              roomCount={floorGroup.rooms.length}
              renderContent={() => (
                <RoomList
                  items={floorGroup.rooms}
                  onFinishReservation={handleConfirmFinishedReservation}
                  finishingReservationId={finishingReservationId}
                />
              )}
            />
          ))}
        </div>
      )}
    </main>
  );
}
