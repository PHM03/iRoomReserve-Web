'use client';

import React, { useEffect, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import BleSummaryCard from '@/components/ui/BleSummaryCard';
import { getManagedBuildingOptionLabel } from '@/components/admin/dashboard/shared';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import {
  AdminRequest,
  onAdminRequestsByBuilding,
} from '@/lib/admin/adminRequests';
import { getManagedBuildingsForCampus } from '@/lib/buildings/campusAssignments';
import {
  onReservationsByBuilding,
  Reservation,
} from '@/lib/reservations/reservations';
import RoomScheduleTimeline from '@/components/rooms/schedules/RoomScheduleTimeline';
import {
  getLocalDateString,
  resolveRoomStatus,
} from '@/lib/rooms/roomStatus';
import {
  onRoomsByBuilding,
  Room,
} from '@/lib/rooms/rooms';
import {
  isRoomInClass,
  onSchedulesByBuilding,
  Schedule,
} from '@/lib/schedules/schedules';
import { formatTimeRange } from '@/lib/utils/dateTime';

interface UtilityStaffDashboardProps {
  firstName: string;
}

type IconProps = {
  className?: string;
};

type TimetableEntry = {
  buildingName: string;
  endTime: string;
  roomName: string;
  startTime: string;
  purpose?: string;
};

type RoomScheduleFeed = 'reservations' | 'rooms';
type RoomStatusFilter = 'All' | 'Available' | 'Reserved' | 'Occupied' | 'Unavailable';
type RoomScheduleErrors = {
  buildingId: string;
  reservations: string | null;
  rooms: string | null;
};

const TIMETABLE_DAYS = [
  {
    label: 'Monday',
    shortLabel: 'Mon',
    value: 1,
  },
  {
    label: 'Tuesday',
    shortLabel: 'Tue',
    value: 2,
  },
  {
    label: 'Wednesday',
    shortLabel: 'Wed',
    value: 3,
  },
  {
    label: 'Thursday',
    shortLabel: 'Thu',
    value: 4,
  },
  {
    label: 'Friday',
    shortLabel: 'Fri',
    value: 5,
  },
  {
    label: 'Saturday',
    shortLabel: 'Sat',
    value: 6,
  },
] as const;

const ROOM_STATUS_FILTERS: RoomStatusFilter[] = [
  'All',
  'Available',
  'Reserved',
  'Occupied',
  'Unavailable',
];

const ROOM_STATUS_PREVIEW_LIMIT = 5;

function getRoomStatusAccent(status: string) {
  switch (status) {
    case 'Available':
      return 'bg-green-500';
    case 'Reserved':
      return 'bg-blue-500';
    case 'Occupied':
      return 'bg-primary';
    case 'Unavailable':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function CalendarIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M8 7V3m8 4V3M4 11h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

function WarningIcon({ className = 'h-7 w-7' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 9v4m0 4h.01M10.3 4.7L2.8 18a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 4.7a2 2 0 00-3.4 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

function getReservationDates(reservation: Reservation) {
  const dates = reservation.dates?.length ? reservation.dates : [reservation.date];
  return [...new Set(dates.filter(Boolean))];
}

function getWeekdayValue(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const weekday = new Date(year, month - 1, day).getDay();
  return weekday >= 1 && weekday <= 6 ? weekday : null;
}

function buildEntriesByDay(
  reservations: Reservation[],
  currentUserId?: string | null
) {
  const entriesByDay = new Map<number, Map<string, TimetableEntry>>();

  TIMETABLE_DAYS.forEach((day) => {
    entriesByDay.set(day.value, new Map());
  });

  reservations.forEach((reservation) => {
    if (
      !currentUserId ||
      reservation.userId !== currentUserId ||
      reservation.status !== 'approved'
    ) {
      return;
    }

    getReservationDates(reservation).forEach((date) => {
      const weekday = getWeekdayValue(date);

      if (!weekday) {
        return;
      }

      const dayEntries = entriesByDay.get(weekday);

      if (!dayEntries) {
        return;
      }

      const key = [
        reservation.roomId,
        reservation.buildingId,
        reservation.startTime,
        reservation.endTime,
      ].join(':');

      if (!dayEntries.has(key)) {
        dayEntries.set(key, {
          buildingName: reservation.buildingName,
          endTime: reservation.endTime,
          roomName: reservation.roomName,
          startTime: reservation.startTime,
          purpose: reservation.purpose,
        });
      }
    });
  });

  return entriesByDay;
}

function StatCard({
  detail,
  label,
  tone,
  value,
}: Readonly<{
  detail?: string;
  label: string;
  tone: string;
  value: number;
}>) {
  return (
    <div className="glass-card flex min-h-[96px] flex-col items-start justify-start p-4">
      <div className={`mb-2 h-1 w-8 rounded-full ${tone}`} />
      <p className="truncate text-[11px] font-bold text-black/55">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none text-black">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-[10px] font-bold text-black/40">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function shiftDate(dateValue: string, dayOffset: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + dayOffset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function UtilityReservationTimetable({
  className = '',
  currentUserId,
  reservations,
}: Readonly<{
  className?: string;
  currentUserId?: string | null;
  reservations: Reservation[];
}>) {
  const entriesByDay = buildEntriesByDay(reservations, currentUserId);

  return (
    <section
      className={`group rounded-2xl border border-white/35 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.17)] shadow-primary/10  transition-all duration-300 hover:bg-white hover:shadow-2xl ${className}`.trim()}
    >
      <div className="mb-5">
        <h3 className="text-lg font-bold text-gray-900">
          Reservation Timetable
        </h3>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[780px] grid-cols-6 gap-3">
          {TIMETABLE_DAYS.map((day) => {
            const entries = [
              ...(entriesByDay.get(day.value)?.values() ?? []),
            ].sort(
              (left, right) =>
                left.startTime.localeCompare(right.startTime) ||
                left.roomName.localeCompare(right.roomName, undefined, {
                  numeric: true,
                })
            );

            return (
              <div
                key={day.value}
                className="flex min-h-[190px] flex-col rounded-2xl border border-white/35 bg-white p-3 shadow-lg  transition-all duration-300 group-hover:bg-white hover:bg-white hover:shadow-xl"
              >
                <div className="border-b border-white/30 pb-2">
                  <p className="text-sm font-bold text-gray-900">
                    {day.shortLabel}
                  </p>
                  <p className="text-[11px] text-gray-400">{day.label}</p>
                </div>

                {entries.length === 0 ? (
                  <div className="dashboard-empty-state mt-3 flex flex-1 items-center justify-center rounded-2xl px-2 py-6">
                    <p className="text-center text-xs font-bold text-gray-400">
                      No reservations
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {entries.map((entry) => (
                      <div
                        key={`${entry.buildingName}:${entry.roomName}:${entry.startTime}:${entry.endTime}`}
                        className="rounded-2xl border border-primary/15 bg-primary/10 p-3 shadow-sm shadow-primary/10 "
                      >
                        <p className="truncate text-sm font-bold text-gray-900">
                          {entry.roomName}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {entry.buildingName}
                        </p>
                        <p className="mt-2 text-xs font-bold text-primary">
                          {formatTimeRange(entry.startTime, entry.endTime)}
                        </p>
                        {entry.purpose ? (
                          <p className="mt-1 truncate text-[11px] text-gray-500">
                            {entry.purpose}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function UtilityStaffDashboard({
  firstName,
}: Readonly<UtilityStaffDashboardProps>) {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;
  const managedBuildings = getManagedBuildingsForCampus(profile?.campus);
  const [selectedManagedBuildingId, setSelectedManagedBuildingId] = useState('');
  const effectiveManagedBuildingId = managedBuildings.some(
    (building) => building.id === selectedManagedBuildingId
  )
    ? selectedManagedBuildingId
    : managedBuildings[0]?.id ?? '';
  const selectedManagedBuilding =
    managedBuildings.find(
      (building) => building.id === effectiveManagedBuildingId
    ) ?? managedBuildings[0];
  const buildingId = selectedManagedBuilding?.id;
  const buildingName = selectedManagedBuilding?.name;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomStatusSearch, setRoomStatusSearch] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState<RoomStatusFilter>('All');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(() => getLocalDateString());
  const [scheduleDataBuildingId, setScheduleDataBuildingId] = useState('');
  const [roomScheduleErrors, setRoomScheduleErrors] = useState<RoomScheduleErrors>({
    buildingId: '',
    reservations: null,
    rooms: null,
  });

  useEffect(() => {
    if (!buildingId || !uid) {
      return;
    }

    let cancelled = false;
    let roomsLoaded = false;
    let reservationsLoaded = false;
    const markRoomScheduleReady = () => {
      if (roomsLoaded && reservationsLoaded) {
        setScheduleDataBuildingId(buildingId);
      }
    };
    const updateRoomScheduleError = (feed: RoomScheduleFeed, error: unknown | null) => {
      const message = error === null
        ? null
        : error instanceof Error
          ? error.message
          : `Unable to load building ${feed}.`;
      setRoomScheduleErrors((current) => {
        const currentBuildingErrors = current.buildingId === buildingId
          ? current
          : { buildingId, reservations: null, rooms: null };
        return { ...currentBuildingErrors, [feed]: message };
      });
    };

    const unsubscribeRooms = onRoomsByBuilding(buildingId, (nextRooms) => {
      if (cancelled) return;
      setRooms(nextRooms);
      updateRoomScheduleError('rooms', null);
      roomsLoaded = true;
      markRoomScheduleReady();
    }, (error) => {
      if (cancelled) return;
      updateRoomScheduleError('rooms', error);
    });
    const unsubscribeSchedules = onSchedulesByBuilding(
      buildingId,
      (nextSchedules) => {
        if (cancelled) return;
        setSchedules(nextSchedules);
      }
    );
    const unsubscribeReservations = onReservationsByBuilding(
      buildingId,
      (nextReservations) => {
        if (cancelled) return;
        setReservations(nextReservations);
        updateRoomScheduleError('reservations', null);
        reservationsLoaded = true;
        markRoomScheduleReady();
      },
      (error) => {
        if (cancelled) return;
        updateRoomScheduleError('reservations', error);
      }
    );
    const unsubscribeRequests = onAdminRequestsByBuilding(
      buildingId,
      (nextAdminRequests) => {
        if (cancelled) return;
        setAdminRequests(nextAdminRequests);
      }
    );

    return () => {
      cancelled = true;
      unsubscribeRooms();
      unsubscribeSchedules();
      unsubscribeReservations();
      unsubscribeRequests();
    };
  }, [buildingId, uid]);

  const today = new Date();
  const roomScheduleError = roomScheduleErrors.buildingId === buildingId
    ? roomScheduleErrors.rooms ?? roomScheduleErrors.reservations
    : null;
  const todayDateString = getLocalDateString(today);
  const todayReservations = reservations.filter(
    (reservation) =>
      reservation.date === todayDateString &&
      (reservation.status === 'approved' || reservation.status === 'pending')
  );
  const openRequests = adminRequests.filter(
    (request) => request.status === 'open'
  );
  const roomStatuses = rooms.map((room) => ({
    room,
    resolved: resolveRoomStatus(room, reservations, {
      activeSchedule: isRoomInClass(schedules, room.id),
      now: today,
    }),
  }));
  const normalizedRoomStatusSearch = roomStatusSearch.trim().toLocaleLowerCase();
  const matchingRoomStatuses = roomStatuses.filter(({ room, resolved }) => {
    const matchesFilter = roomStatusFilter === 'All' || resolved.status === roomStatusFilter;
    const matchesSearch = !normalizedRoomStatusSearch || `${room.name} ${room.floor} ${room.roomType} ${room.buildingName}`.toLocaleLowerCase().includes(normalizedRoomStatusSearch);
    return matchesFilter && matchesSearch;
  });
  const visibleRoomStatuses = matchingRoomStatuses.slice(0, ROOM_STATUS_PREVIEW_LIMIT);
  const hasMoreRoomStatuses = matchingRoomStatuses.length > ROOM_STATUS_PREVIEW_LIMIT;
  const availableCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Available'
  ).length;
  const reservedCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Reserved'
  ).length;
  const ongoingCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Occupied'
  ).length;
  const unavailableCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Unavailable'
  ).length;

  if (!buildingId || !buildingName) {
    return (
      <main className="relative z-10 min-h-screen pb-24 pt-[100px] md:pb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-2xl border border-white/35 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.17)] ">
            <p className="text-sm font-bold uppercase tracking-wide text-primary">
              Utility Staff Dashboard
            </p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">
              Hello, {firstName}
            </h2>
          </div>

          <div className="dashboard-empty-state rounded-2xl p-10 text-center  transition-all duration-300 hover:bg-white hover:shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <WarningIcon />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              No Campus Assigned
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              Your account has been approved, but no campus has been assigned to
              you yet. Please contact the Super Admin.
            </p>
          </div>

        </div>
      </main>
    );
  }

  const statCards = [
    {
      detail: `${unavailableCount} unavailable`,
      label: 'Total Rooms',
      tone: 'bg-primary',
      value: rooms.length,
    },
    {
      label: 'Available',
      tone: 'bg-green-500',
      value: availableCount,
    },
    {
      label: 'Reserved',
      tone: 'bg-blue-500',
      value: reservedCount,
    },
    {
      label: 'Occupied',
      tone: 'bg-orange-500',
      value: ongoingCount,
    },
    {
      label: 'Open Requests',
      tone: 'bg-yellow-500',
      value: openRequests.length,
    },
  ];

  return (
    <main className="relative z-10 min-h-screen pb-24 pt-[100px] md:pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative z-[60] mb-10 flex flex-col gap-5 rounded-2xl border border-white/35 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.17)]  transition-all duration-300 hover:bg-white hover:shadow-2xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-primary">
              Utility Staff Dashboard
            </p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">
              Hello, {firstName}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Managing:{' '}
              <span className="font-bold text-primary">{buildingName}</span>
            </p>
          </div>

          {managedBuildings.length > 1 && (
            <div className="w-full max-w-xs">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                Active Building
              </label>
              <AdminBuildingSelect
                label=""
                options={managedBuildings.map((building) => ({
                  value: building.id,
                  label: getManagedBuildingOptionLabel(building),
                }))}
                value={buildingId ?? ''}
                onChange={setSelectedManagedBuildingId}
                className="w-full"
                fullWidth
              />
            </div>
          )}
        </div>

        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((card) => (
            <StatCard
              key={card.label}
              detail={'detail' in card ? card.detail : undefined}
              label={card.label}
              tone={card.tone}
              value={card.value}
            />
          ))}
        </div>

        <section className="mb-10 rounded-2xl border border-white/35 bg-white p-4 shadow-md shadow-primary/10 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-black">Live Room Status</h3>
              <p className="mt-0.5 text-[11px] font-bold text-black/50">
                {visibleRoomStatuses.length} shown{hasMoreRoomStatuses ? ` of ${matchingRoomStatuses.length}` : ''}
              </p>
            </div>
            <Link
              href="/dashboard/room-status"
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-primary transition-all hover:bg-primary/5"
            >
              View all
            </Link>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <span className="sr-only">Search rooms</span>
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/35"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" strokeWidth="2" />
              </svg>
              <input
                type="search"
                value={roomStatusSearch}
                onChange={(event) => setRoomStatusSearch(event.target.value)}
                placeholder="Search rooms"
                className="glass-input h-9 w-full bg-dark/5 pl-7 pr-3 text-xs font-bold text-black placeholder:text-black/35"
              />
            </label>

            <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-dark/10 bg-white p-1 shadow-inner">
              {ROOM_STATUS_FILTERS.map((filter) => {
                const isActive = roomStatusFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setRoomStatusFilter(filter)}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                      isActive
                        ? 'bg-primary text-white shadow-sm ring-1 ring-primary/30'
                        : 'text-black/60 hover:bg-dark/5 hover:text-black'
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          {roomScheduleError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {roomScheduleError}
            </p>
          ) : scheduleDataBuildingId !== buildingId ? (
            <p className="dashboard-empty-state rounded-2xl px-3 py-3 text-center text-xs font-bold text-black/60">
              Loading room preview...
            </p>
          ) : visibleRoomStatuses.length === 0 ? (
            <p className="dashboard-empty-state rounded-2xl px-3 py-5 text-center text-xs font-bold text-black/60">
              No rooms match this view.
            </p>
          ) : (
            <div className="space-y-1.5">
              {visibleRoomStatuses.map(({ room, resolved }) => (
                <div
                  key={room.id}
                  className="dashboard-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getRoomStatusAccent(resolved.status)}`} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-black">{room.name}</p>
                      <p className="truncate text-[10px] font-bold text-black/50">
                        {room.floor} | Cap {room.capacity}{resolved.detail ? ` | ${resolved.detail}` : ''}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={resolved.status} />
                </div>
              ))}
              {hasMoreRoomStatuses ? (
                <Link
                  href="/dashboard/room-status"
                  className="block w-full rounded-lg px-2 py-1.5 text-center text-[11px] font-bold text-primary transition-all hover:bg-primary/5"
                >
                  View full room list
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <BleSummaryCard
          className="mb-10"
          compactActiveLabel="Active Beacons"
          compactOnlineLabel="Online Beacons"
          detailsHref="/dashboard/ble-beacon"
          rooms={rooms}
          variant="compact"
        />

        <UtilityReservationTimetable
          className="mb-10"
          currentUserId={uid}
          reservations={reservations}
        />

        <section className="mb-6 rounded-2xl border border-white/35 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.17)] shadow-primary/10  transition-all duration-300 hover:bg-white hover:shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/30 pb-4">
            <h3 className="text-lg font-bold text-gray-900">
              Today&apos;s Room Reservations
            </h3>
            <span className="text-xs font-bold text-gray-500">
              {todayReservations.length} reservation
              {todayReservations.length !== 1 ? 's' : ''}
            </span>
          </div>

          {todayReservations.length === 0 ? (
            <div className="dashboard-empty-state mt-5 flex min-h-[180px] flex-col items-center justify-center rounded-2xl text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm ">
                <CalendarIcon className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-gray-500">
                No reservations for today
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {todayReservations.map((reservation) => {
                const reservationRoom = rooms.find(
                  (room) => room.id === reservation.roomId
                );
                const roomStatus = resolveRoomStatus(
                  reservationRoom ?? {
                    id: reservation.roomId,
                    status: reservation.checkedInAt && !reservation.occupancyReleasedAt ? 'Occupied' : 'Reserved',
                  },
                  reservations,
                  { now: today }
                );

                return (
                  <div
                    key={reservation.id}
                    className="dashboard-row rounded-2xl border-l-4 border-l-primary/40 p-4 "
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white text-sm font-bold text-gray-700 shadow-sm ">
                          {reservation.userName
                            .split(' ')
                            .map((name) => name[0])
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-gray-900">
                              {reservation.userName}
                            </h4>
                            <StatusBadge status={reservation.status} />
                            <StatusBadge status={roomStatus.status} />
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {reservation.roomName} |{' '}
                            {formatTimeRange(
                              reservation.startTime,
                              reservation.endTime
                            )}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Purpose: {reservation.purpose}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        {roomStatus.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <RoomScheduleTimeline
          className="mb-10"
          error={roomScheduleError}
          headerControls={(
            <div className="flex flex-wrap items-center justify-end gap-2">
              <input
                type="date"
                aria-label="Choose schedule date"
                value={selectedScheduleDate}
                onChange={(event) => setSelectedScheduleDate(event.target.value)}
                className="glass-input rounded-lg px-2 py-2 text-xs font-bold text-black"
              />
              <button
                type="button"
                onClick={() => setSelectedScheduleDate((date) => shiftDate(date, -1))}
                aria-label="Show previous day"
                className="rounded-lg border border-dark/10 bg-white px-3 py-2 text-xs font-bold text-black/70 shadow-sm transition-colors hover:bg-dark/5"
              >
                Previous day
              </button>
              <button
                type="button"
                onClick={() => setSelectedScheduleDate((date) => shiftDate(date, 1))}
                aria-label="Show next day"
                className="rounded-lg border border-dark/10 bg-white px-3 py-2 text-xs font-bold text-black/70 shadow-sm transition-colors hover:bg-dark/5"
              >
                Next day
              </button>
            </div>
          )}
          isLoading={scheduleDataBuildingId !== buildingId && !roomScheduleError}
          reservations={scheduleDataBuildingId === buildingId ? reservations : []}
          rooms={scheduleDataBuildingId === buildingId ? rooms : []}
          selectedDate={selectedScheduleDate}
        />
      </div>
    </main>
  );
}
