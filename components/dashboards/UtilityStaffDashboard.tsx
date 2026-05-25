'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import {
  AdminRequest,
  onAdminRequestsByBuilding,
} from '@/lib/admin/adminRequests';
import { getManagedBuildingsForCampus } from '@/lib/buildings/campusAssignments';
import {
  BLE_MONITOR_REFRESH_INTERVAL_MS,
  formatBleTimestamp,
  getBeaconConfiguredRooms,
} from '@/lib/occupancy/bleMonitor';
import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  type OccupancyPayload,
} from '@/lib/occupancy/occupancy';
import { fetchOccupancySnapshot } from '@/lib/occupancy/occupancyClient';
import {
  onReservationsByBuilding,
  Reservation,
} from '@/lib/reservations/reservations';
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
import { formatClockTime, formatTimeRange } from '@/lib/utils/dateTime';

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

const ROOM_STATUS_SUMMARIES = [
  {
    description: 'Ready for the next reservation.',
    dotClassName: 'bg-green-500',
    glowClassName: 'shadow-green-500/10 hover:shadow-green-500/20',
    label: 'Available',
  },
  {
    description: 'Approved classes or reservations are holding the room.',
    dotClassName: 'bg-blue-500',
    glowClassName: 'shadow-blue-500/10 hover:shadow-blue-500/20',
    label: 'Reserved',
  },
  {
    description: 'A checked-in reservation is actively using the room.',
    dotClassName: 'bg-primary',
    glowClassName: 'shadow-primary/10 hover:shadow-primary/20',
    label: 'Occupied',
  },
] as const;

function RoomsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 21V7l8-4 8 4v14M9 21v-6h6v6M8 9h.01M12 9h.01M16 9h.01M8 12h.01M16 12h.01"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

function AvailableIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M9 12l2 2 4-4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <path
        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
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

function OccupiedIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0zM4 21a8 8 0 0116 0"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

function RequestsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M9 5h6M9 9h6M9 13h3M7 3h10a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

function RefreshIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0011.9 2.4L20 14M4 10l2.6-3.4A7 7 0 0118.5 9"
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

function formatRefreshTime(value: Date | null) {
  if (!value) {
    return 'Not refreshed yet';
  }

  return formatClockTime(value, { includeSeconds: true });
}

function formatRefreshCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
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
  accentClassName,
  glowClassName,
  icon,
  iconClassName,
  label,
  value,
}: Readonly<{
  accentClassName: string;
  glowClassName: string;
  icon: React.ReactNode;
  iconClassName: string;
  label: string;
  value: number;
}>) {
  return (
    <div
      className={`rounded-2xl border border-white/35 border-l-4 bg-white/75 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-2xl ${accentClassName} ${glowClassName}`.trim()}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-3xl font-bold leading-none text-gray-900">
            {value}
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
            {label}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/40 shadow-sm backdrop-blur-xl ${iconClassName}`.trim()}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function UtilityBleBeaconSummary({
  className = '',
  detailsHref = '/dashboard/ble-beacon',
  pollIntervalMs = BLE_MONITOR_REFRESH_INTERVAL_MS,
  rooms = [],
}: Readonly<{
  className?: string;
  detailsHref?: string;
  pollIntervalMs?: number;
  rooms?: Pick<
    Room,
    'id' | 'name' | 'beaconConnected' | 'beaconId' | 'bleBeaconId'
  >[];
}>) {
  const [occupancyData, setOccupancyData] = useState<OccupancyPayload>(
    DEFAULT_OCCUPANCY_PAYLOAD
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [millisecondsUntilRefresh, setMillisecondsUntilRefresh] = useState(
    pollIntervalMs
  );
  const [refreshScheduleVersion, setRefreshScheduleVersion] = useState(0);

  const totalBeacons = getBeaconConfiguredRooms(rooms).length;
  const totalActiveBeacons = getBeaconConfiguredRooms(rooms).filter(
    (room) => 'beaconConnected' in room && room.beaconConnected === true
  ).length;
  const totalInactiveBeacons = Math.max(0, totalBeacons - totalActiveBeacons);

  const refreshCard = useCallback(
    async (mode: 'initial' | 'manual' | 'background' = 'initial') => {
      if (mode === 'initial') {
        setIsLoading(true);
      }

      if (mode === 'manual') {
        setIsRefreshing(true);
      }

      try {
        const nextOccupancyData = await fetchOccupancySnapshot({
          force: mode === 'manual',
        });
        setOccupancyData(nextOccupancyData);

        setErrorMessage(null);
        setLastRefreshedAt(new Date());
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load BLE beacon data right now.'
        );
      } finally {
        if (mode === 'initial') {
          setIsLoading(false);
        }

        if (mode === 'manual') {
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void refreshCard('initial');
  }, [refreshCard]);

  useEffect(() => {
    const scheduleNextRefresh = () => {
      setNextRefreshAt(Date.now() + pollIntervalMs);
    };

    scheduleNextRefresh();

    const intervalId = window.setInterval(() => {
      void refreshCard('background');
      scheduleNextRefresh();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, refreshCard, refreshScheduleVersion]);

  useEffect(() => {
    if (nextRefreshAt === null) {
      setMillisecondsUntilRefresh(0);
      return;
    }

    const updateCountdown = () => {
      setMillisecondsUntilRefresh(Math.max(0, nextRefreshAt - Date.now()));
    };

    updateCountdown();

    const countdownIntervalId = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(countdownIntervalId);
    };
  }, [nextRefreshAt]);

  const handleManualRefresh = useCallback(() => {
    void refreshCard('manual');
    setRefreshScheduleVersion((currentValue) => currentValue + 1);
  }, [refreshCard]);

  const summaryStats = [
    {
      label: 'Total Beacons',
      value: totalBeacons,
    },
    {
      label: 'Total Active Beacons',
      value: totalActiveBeacons,
    },
    {
      label: 'Total Inactive',
      value: totalInactiveBeacons,
    },
    {
      label: 'Last Updated',
      value: formatBleTimestamp(occupancyData.timestamp),
    },
  ];

  return (
    <section
      className={`rounded-2xl border border-white/35 border-t-2 border-t-primary bg-white/75 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.17)] shadow-primary/10 backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl ${className}`.trim()}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            BLE Beacon Summary
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          <Link
            href={detailsHref}
            className="rounded-2xl border border-white/45 bg-white/75 px-3 py-2 text-xs font-bold text-gray-700 shadow-sm backdrop-blur-xl transition-all duration-300 hover:border-primary/30 hover:bg-white hover:text-primary"
          >
            View Details
          </Link>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-bold text-primary shadow-sm backdrop-blur-xl transition-all duration-300 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshIcon />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <p>Last refreshed: {formatRefreshTime(lastRefreshedAt)}</p>
        <p>Next refresh in {formatRefreshCountdown(millisecondsUntilRefresh)}</p>
      </div>

      {isLoading ? (
        <div className="dashboard-empty-state mt-4 rounded-2xl px-4 py-3 text-sm text-gray-500">
          Loading BLE beacon summary...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary shadow-sm backdrop-blur-xl">
          {errorMessage}
        </div>
      ) : null}

      <div className="dashboard-table-shell mt-5 grid grid-cols-1 divide-y divide-white/35 rounded-2xl backdrop-blur-xl sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {summaryStats.map((stat) => (
          <div key={stat.label} className="min-h-[96px] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {stat.label}
            </p>
            <p className="mt-3 text-2xl font-bold text-gray-900">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
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
      className={`rounded-2xl border border-white/35 bg-white/75 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.17)] shadow-primary/10 backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl ${className}`.trim()}
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
                className="flex min-h-[190px] flex-col rounded-2xl border border-white/35 bg-white/70 p-3 shadow-lg backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-xl"
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
                        className="rounded-2xl border border-primary/15 bg-primary/10 p-3 shadow-sm shadow-primary/10 backdrop-blur-xl"
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
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);

  useEffect(() => {
    if (!buildingId || !uid) {
      return;
    }

    let cancelled = false;

    const unsubscribeRooms = onRoomsByBuilding(buildingId, (nextRooms) => {
      if (cancelled) return;
      setRooms(nextRooms);
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
  const availableCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Available'
  ).length;
  const reservedCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Reserved'
  ).length;
  const ongoingCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Occupied'
  ).length;

  if (!buildingId || !buildingName) {
    return (
      <main className="relative z-10 min-h-screen pb-24 pt-[100px] md:pb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-2xl border border-white/35 bg-white/75 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
            <p className="text-sm font-bold uppercase tracking-wide text-primary">
              Utility Staff Dashboard
            </p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">
              Hello, {firstName}
            </h2>
          </div>

          <div className="dashboard-empty-state rounded-2xl p-10 text-center backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl">
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
      accentClassName: 'border-l-primary',
      glowClassName: 'shadow-primary/10 hover:shadow-primary/20',
      icon: <RoomsIcon />,
      iconClassName: 'bg-primary/10 text-primary',
      label: 'Total Rooms',
      value: rooms.length,
    },
    {
      accentClassName: 'border-l-green-500/70',
      glowClassName: 'shadow-green-500/10 hover:shadow-green-500/20',
      icon: <AvailableIcon />,
      iconClassName: 'bg-green-500/10 text-green-700',
      label: 'Available',
      value: availableCount,
    },
    {
      accentClassName: 'border-l-blue-500/70',
      glowClassName: 'shadow-blue-500/10 hover:shadow-blue-500/20',
      icon: <CalendarIcon />,
      iconClassName: 'bg-blue-500/10 text-blue-700',
      label: 'Reserved',
      value: reservedCount,
    },
    {
      accentClassName: 'border-l-orange-500/70',
      glowClassName: 'shadow-orange-500/10 hover:shadow-orange-500/20',
      icon: <OccupiedIcon />,
      iconClassName: 'bg-orange-500/10 text-orange-700',
      label: 'Occupied',
      value: ongoingCount,
    },
    {
      accentClassName: 'border-l-yellow-500/70',
      glowClassName: 'shadow-yellow-500/10 hover:shadow-yellow-500/20',
      icon: <RequestsIcon />,
      iconClassName: 'bg-yellow-500/10 text-yellow-700',
      label: 'Open Requests',
      value: openRequests.length,
    },
  ];

  return (
    <main className="relative z-10 min-h-screen pb-24 pt-[100px] md:pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-5 rounded-2xl border border-white/35 bg-white/75 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl sm:flex-row sm:items-end sm:justify-between">
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
              <select
                value={buildingId ?? ''}
                onChange={(event) =>
                  setSelectedManagedBuildingId(event.target.value)
                }
                className="w-full appearance-none rounded-2xl border border-white/55 bg-white/85 px-4 py-3 text-sm text-gray-900 shadow-xl backdrop-blur-xl outline-none transition-all duration-300 focus:border-primary focus:ring-2 focus:ring-primary/15"
                style={{ backgroundImage: 'none' }}
              >
                {managedBuildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((card) => (
            <StatCard
              key={card.label}
              accentClassName={card.accentClassName}
              glowClassName={card.glowClassName}
              icon={card.icon}
              iconClassName={card.iconClassName}
              label={card.label}
              value={card.value}
            />
          ))}
        </div>

        <section className="mb-10 rounded-2xl border border-white/35 bg-white p-4 shadow-md shadow-primary/10 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-tight text-gray-900 sm:text-lg">
                Room Status Overview
              </h3>
            </div>
            <Link
              href="/dashboard/room-status"
              className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-white/75 px-3 py-2 text-xs font-bold text-primary shadow-xl backdrop-blur-xl transition-all duration-300 hover:bg-primary/10 hover:shadow-2xl sm:px-4 sm:text-sm"
            >
              Open Room Status
            </Link>
          </div>

          <div className="dashboard-table-shell grid grid-cols-1 divide-y divide-white/35 rounded-2xl backdrop-blur-xl sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {ROOM_STATUS_SUMMARIES.map((status) => (
              <div
                key={status.label}
                className={`p-5 shadow-xl transition-all duration-300 hover:bg-white/65 ${status.glowClassName}`.trim()}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${status.dotClassName}`}
                  />
                  <p className="text-sm font-bold text-gray-900">
                    {status.label}
                  </p>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {status.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <UtilityBleBeaconSummary
          className="mb-10"
          detailsHref="/dashboard/ble-beacon"
          rooms={rooms}
        />

        <UtilityReservationTimetable
          className="mb-10"
          currentUserId={uid}
          reservations={reservations}
        />

        <section className="rounded-2xl border border-white/35 bg-white/75 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.17)] shadow-primary/10 backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl">
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
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/75 text-gray-400 shadow-sm backdrop-blur-xl">
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
                    status: reservation.checkedInAt ? 'Occupied' : 'Reserved',
                  },
                  reservations,
                  { now: today }
                );

                return (
                  <div
                    key={reservation.id}
                    className="dashboard-row rounded-2xl border-l-4 border-l-primary/40 p-4 backdrop-blur-xl"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/80 text-sm font-bold text-gray-700 shadow-sm backdrop-blur-xl">
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
      </div>
    </main>
  );
}
