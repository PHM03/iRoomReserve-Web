'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import type { RoomHistoryEntry } from '@/lib/rooms/roomHistory';
import { getRoomsByBuilding, type Room } from '@/lib/rooms/rooms';
import {
  onReservationsByBuilding,
  type Reservation,
} from '@/lib/reservations/reservations';
import { formatDate, formatTimeRange } from '@/lib/utils/dateTime';
import { getManagedBuildingOptionLabel, RoleBadge, StatusBadge } from './shared';

type HistoryStatusFilter = 'approved' | 'rejectedCancelled' | 'expired' | 'completed' | 'all';
type HistoryDateSortDirection = 'asc' | 'desc';

const HISTORY_STATUS_FILTERS: Array<{ key: HistoryStatusFilter; label: string }> = [
  { key: 'approved', label: 'Approved' },
  { key: 'rejectedCancelled', label: 'Rejected' },
  { key: 'expired', label: 'Expired' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

const MONTH_FILTER_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface AdminRoomHistoryTabProps {
  activeBuildingLabel: string;
  buildingId: string;
  managedBuildings: Array<{ id: string; name: string }>;
  onBuildingChange: (buildingId: string) => void;
  roomHistory: RoomHistoryEntry[];
}

interface UserHistoryGroup {
  reservations: RoomHistoryEntry[];
  totalRoomsUsed: number;
  userName: string;
  userRole: string;
}

function getTodayDateKey() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

function getHistoryDateValue(date: string) {
  const dateValue = new Date(`${date}T00:00:00`).getTime();
  return Number.isNaN(dateValue) ? 0 : dateValue;
}

function getHistoryEntryStatus(
  entry: RoomHistoryEntry,
  reservation?: Pick<Reservation, 'checkedInAt' | 'status'> | null
) {
  const hasStarted = Boolean(reservation?.checkedInAt);
  const normalizedStatus = entry.status.toLowerCase();

  if (normalizedStatus === 'completed') {
    return hasStarted ? 'completed' : 'expired';
  }

  if (entry.date < getTodayDateKey() && !hasStarted) {
    return 'expired';
  }

  return normalizedStatus;
}

function getRoomHistoryEntryPriority(entry: RoomHistoryEntry) {
  const normalizedStatus = entry.status.toLowerCase();

  if (normalizedStatus === 'completed') {
    return 2;
  }

  if (normalizedStatus === 'approved') {
    return 1;
  }

  return 0;
}

function getCompletedReservationCount(
  entries: RoomHistoryEntry[],
  reservationMap: Map<string, Reservation>
) {
  return entries.filter((entry) =>
    getHistoryEntryStatus(entry, reservationMap.get(entry.sourceId)) === 'completed'
  ).length;
}

function getRejectedReservationCount(
  entries: RoomHistoryEntry[],
  reservationMap: Map<string, Reservation>
) {
  return entries.filter((entry) => {
    const normalizedStatus = getHistoryEntryStatus(entry, reservationMap.get(entry.sourceId));
    return normalizedStatus === 'rejected' || normalizedStatus === 'cancelled';
  }).length;
}

function ChevronDownIcon({ className }: Readonly<{ className: string }>) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function AdminRoomHistoryTab({
  activeBuildingLabel,
  buildingId,
  managedBuildings,
  onBuildingChange,
  roomHistory,
}: Readonly<AdminRoomHistoryTabProps>) {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>('approved');
  const [historyYearFilter, setHistoryYearFilter] = useState<string>(() => String(currentYear));
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>(() => String(currentMonth));
  const [historyDateSortDirection, setHistoryDateSortDirection] =
    useState<HistoryDateSortDirection>('desc');
  const [historySearch, setHistorySearch] = useState('');
  const [buildingRooms, setBuildingRooms] = useState<Room[]>([]);
  const [buildingReservations, setBuildingReservations] = useState<Reservation[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!buildingId) {
      setBuildingRooms([]);
      return () => {
        cancelled = true;
      };
    }

    void getRoomsByBuilding(buildingId)
      .then((rooms) => {
        if (!cancelled) {
          setBuildingRooms(rooms);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Failed to load rooms for reservation history:', error);
          setBuildingRooms([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  useEffect(() => {
    if (!buildingId) {
      setBuildingReservations([]);
      return () => {};
    }

    return onReservationsByBuilding(buildingId, (nextReservations) => {
      setBuildingReservations(nextReservations);
    });
  }, [buildingId]);

  const roomFloorMap = useMemo(
    () => new Map(buildingRooms.map((room) => [room.id, room.floor])),
    [buildingRooms]
  );

  const reservationMap = useMemo(
    () => new Map(buildingReservations.map((reservation) => [reservation.id, reservation])),
    [buildingReservations]
  );

  const availableHistoryYears = useMemo(() => {
    const years = roomHistory
      .map((entry) => new Date(`${entry.date}T00:00:00`).getFullYear())
      .filter((year) => !Number.isNaN(year));

    return [...new Set([currentYear, ...years])].sort((left, right) => right - left);
  }, [currentYear, roomHistory]);

  const normalizedRoomHistory = useMemo(() => {
    const latestEntriesBySourceId = new Map<string, RoomHistoryEntry>();

    roomHistory.forEach((entry) => {
      const existingEntry = latestEntriesBySourceId.get(entry.sourceId);

      if (!existingEntry) {
        latestEntriesBySourceId.set(entry.sourceId, entry);
        return;
      }

      const entryPriority = getRoomHistoryEntryPriority(entry);
      const existingPriority = getRoomHistoryEntryPriority(existingEntry);

      if (entryPriority > existingPriority) {
        latestEntriesBySourceId.set(entry.sourceId, entry);
        return;
      }

      if (entryPriority < existingPriority) {
        return;
      }

      const entryCreatedAt = entry.createdAt?.seconds ?? 0;
      const existingCreatedAt = existingEntry.createdAt?.seconds ?? 0;

      if (entryCreatedAt >= existingCreatedAt) {
        latestEntriesBySourceId.set(entry.sourceId, entry);
      }
    });

    return Array.from(latestEntriesBySourceId.values());
  }, [roomHistory]);

  const filteredHistory = useMemo(() => {
    const normalizedSearch = historySearch.trim().toLowerCase();

    const filteredEntries = normalizedRoomHistory.filter((entry) => {
      const normalizedStatus = getHistoryEntryStatus(
        entry,
        reservationMap.get(entry.sourceId)
      );

      if (historyFilter !== 'all' && normalizedStatus !== historyFilter) {
        if (
          historyFilter !== 'rejectedCancelled' ||
            (normalizedStatus !== 'rejected' && normalizedStatus !== 'cancelled')
        ) {
          return false;
        }
      }

      const entryDate = new Date(`${entry.date}T00:00:00`);

      if (
        historyYearFilter !== 'all' &&
        entryDate.getFullYear() !== Number(historyYearFilter)
      ) {
        return false;
      }

      if (
        historyMonthFilter !== 'all' &&
        entryDate.getMonth() !== Number(historyMonthFilter)
      ) {
        return false;
      }

      if (
        normalizedSearch &&
        !entry.userName.toLowerCase().includes(normalizedSearch) &&
        !entry.roomName.toLowerCase().includes(normalizedSearch) &&
        !entry.purpose.toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }

      return true;
    });

    return filteredEntries.sort((left, right) => {
      const leftDate = getHistoryDateValue(left.date);
      const rightDate = getHistoryDateValue(right.date);

      if (leftDate !== rightDate) {
        return historyDateSortDirection === 'desc'
          ? rightDate - leftDate
          : leftDate - rightDate;
      }

      return left.startTime.localeCompare(right.startTime);
    });
  }, [
    historyDateSortDirection,
    historyFilter,
    historyMonthFilter,
    historySearch,
    historyYearFilter,
    normalizedRoomHistory,
    reservationMap,
  ]);

  const groupedHistory = useMemo<UserHistoryGroup[]>(() => {
    const groups = new Map<string, UserHistoryGroup>();

    filteredHistory.forEach((entry) => {
      const normalizedKey = entry.userName.trim().toLowerCase() || entry.id;
      const existingGroup = groups.get(normalizedKey);

      if (existingGroup) {
        existingGroup.reservations.push(entry);
        return;
      }

      groups.set(normalizedKey, {
        userName: entry.userName,
        userRole: entry.userRole,
        reservations: [entry],
        totalRoomsUsed: 0,
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        totalRoomsUsed: new Set(group.reservations.map((entry) => entry.roomId)).size,
      }))
      .sort((left, right) => left.userName.localeCompare(right.userName));
  }, [filteredHistory]);

  useEffect(() => {
    setExpandedUsers((currentExpandedUsers) =>
      currentExpandedUsers.filter((userName) =>
        groupedHistory.some((group) => group.userName === userName)
      )
    );
  }, [groupedHistory]);

  const toggleUserExpanded = (userName: string) => {
    setExpandedUsers((currentExpandedUsers) =>
      currentExpandedUsers.includes(userName)
        ? currentExpandedUsers.filter((currentUserName) => currentUserName !== userName)
        : [...currentExpandedUsers, userName]
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-gray-800">Reservation History</h3>
        {managedBuildings.length > 1 ? (
          <div className="w-full sm:ml-auto sm:w-72">
            <AdminBuildingSelect
              label="Active Building:"
              options={managedBuildings.map((building) => ({
                value: building.id,
                label: getManagedBuildingOptionLabel(building),
              }))}
              value={buildingId}
              onChange={onBuildingChange}
              fullWidth
            />
          </div>
        ) : (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#a12124]/30 bg-[#a12124]/10 px-3 py-1 text-xs font-bold text-[#7f1d1d] shadow-sm sm:ml-auto">
            <span>Active Building: {activeBuildingLabel}</span>
          </div>
        )}
      </div>

      <div className="glass-card mb-6 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1">
              <input
                type="text"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search by user, room, or purpose..."
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={historyYearFilter}
                onChange={(event) => setHistoryYearFilter(event.target.value)}
                className="rounded-xl border border-white/55 bg-white/85 px-3 py-2.5 text-sm font-medium text-gray-800 shadow-[0_8px_22px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all focus:border-[#a12124] focus:outline-none focus:ring-2 focus:ring-[#a12124]/25"
              >
                <option value="all">All Years</option>
                {availableHistoryYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <select
                value={historyMonthFilter}
                onChange={(event) => setHistoryMonthFilter(event.target.value)}
                className="rounded-xl border border-white/55 bg-white/85 px-3 py-2.5 text-sm font-medium text-gray-800 shadow-[0_8px_22px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all focus:border-[#a12124] focus:outline-none focus:ring-2 focus:ring-[#a12124]/25"
              >
                <option value="all">All Months</option>
                {MONTH_FILTER_OPTIONS.map((month, index) => (
                  <option key={month} value={index}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {HISTORY_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setHistoryFilter(filter.key)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                  historyFilter === filter.key
                    ? 'border border-primary bg-primary text-white'
                    : 'border border-gray-200 bg-white text-gray-700 hover:text-primary'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {groupedHistory.length === 0 ? (
        <div className="glass-card p-4">
          <div className="dashboard-empty-state rounded-2xl p-12 text-center">
          <div className="mb-3 text-4xl">History</div>
          <h4 className="mb-1 text-lg font-bold text-black">No Reservations Found</h4>
          <p className="text-sm text-black">
            {historySearch || historyFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Reservation history will appear here.'}
          </p>
          </div>
        </div>
      ) : (
        <>
          <div className="dashboard-table-shell hidden overflow-hidden rounded-2xl backdrop-blur-xl md:block">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-dark/10">
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-black">
                    Users
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-black">
                    Completed Reservations
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-black">
                    Rejected Reservations
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-black">
                    Total Rooms Used
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-black">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedHistory.map((group) => {
                  const isExpanded = expandedUsers.includes(group.userName);

                  return (
                    <Fragment key={group.userName}>
                      <tr
                        className="border-b border-dark/5 transition-colors hover:bg-white/85"
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-black">{group.userName}</span>
                            <RoleBadge role={group.userRole} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-black">
                          {getCompletedReservationCount(group.reservations, reservationMap)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-black">
                          {getRejectedReservationCount(group.reservations, reservationMap)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-black">
                          {group.totalRoomsUsed}
                        </td>
                        <td className="px-6 py-4 text-left">
                          <button
                            type="button"
                            onClick={() => toggleUserExpanded(group.userName)}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-all hover:border-primary hover:text-primary"
                          >
                            {isExpanded ? 'Hide reservations' : 'Show reservations'}
                            <ChevronDownIcon
                              className={`h-4 w-4 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-dark/5">
                          <td colSpan={5} className="bg-primary/5 px-6 py-5">
                            <div className="dashboard-table-shell overflow-hidden rounded-xl bg-white/80">
                              <table className="min-w-full">
                                <thead className="border-b border-dark/10 bg-dark/5">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-black">
                                      Room
                                    </th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-black">
                                      Floor
                                    </th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-black">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setHistoryDateSortDirection((currentDirection) =>
                                            currentDirection === 'desc' ? 'asc' : 'desc'
                                          )
                                        }
                                        className="inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-primary"
                                      >
                                        Date
                                        <span aria-hidden="true">
                                          {historyDateSortDirection === 'desc' ? '\u2193' : '\u2191'}
                                        </span>
                                      </button>
                                    </th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-black">
                                      Time
                                    </th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-black">
                                      Purpose
                                    </th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-black">
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.reservations.map((reservation) => (
                                    <tr
                                      key={reservation.id}
                                      className="border-b border-dark/5 transition-colors last:border-b-0 hover:bg-primary/5"
                                    >
                                      <td className="whitespace-nowrap px-4 py-3 text-sm text-black">
                                        {reservation.roomName}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3 text-sm text-black">
                                        {roomFloorMap.get(reservation.roomId) ?? '—'}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3 text-sm text-black">
                                        {formatDate(reservation.date)}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3 text-sm text-black">
                                        {formatTimeRange(reservation.startTime, reservation.endTime)}
                                      </td>
                                      <td className="max-w-[280px] px-4 py-3 text-sm text-black">
                                        <span className="block truncate">{reservation.purpose}</span>
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3">
                                        <StatusBadge
                                          status={getHistoryEntryStatus(
                                            reservation,
                                            reservationMap.get(reservation.sourceId)
                                          )}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {groupedHistory.map((group) => {
              const isExpanded = expandedUsers.includes(group.userName);

              return (
                <div key={group.userName} className="glass-card p-4 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-black">{group.userName}</span>
                        <RoleBadge role={group.userRole} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-black">
                        <div>
                          <p className="text-black/60">Completed Reservations</p>
                          <p className="font-bold text-black">
                            {getCompletedReservationCount(group.reservations, reservationMap)}
                          </p>
                        </div>
                        <div>
                          <p className="text-black/60">Rejected Reservations</p>
                          <p className="font-bold text-black">
                            {getRejectedReservationCount(group.reservations, reservationMap)}
                          </p>
                        </div>
                        <div>
                          <p className="text-black/60">Total Rooms Used</p>
                          <p className="font-bold text-black">{group.totalRoomsUsed}</p>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => toggleUserExpanded(group.userName)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-700"
                          >
                            {isExpanded ? 'Hide reservations' : 'Show reservations'}
                            <ChevronDownIcon
                              className={`h-4 w-4 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 space-y-3 border-t border-dark/10 pt-4">
                      {group.reservations.map((reservation) => (
                        <div key={reservation.id} className="dashboard-row rounded-xl p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-black">{reservation.roomName}</span>
                            <StatusBadge
                              status={getHistoryEntryStatus(
                                reservation,
                                reservationMap.get(reservation.sourceId)
                              )}
                            />
                          </div>
                          <div className="space-y-1 text-sm text-black">
                            <div className="flex justify-between gap-4">
                              <span className="text-black/60">Floor</span>
                              <span>{roomFloorMap.get(reservation.roomId) ?? '—'}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-black/60">Date</span>
                              <span>{formatDate(reservation.date)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-black/60">Time</span>
                              <span>{formatTimeRange(reservation.startTime, reservation.endTime)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-black/60">Purpose</span>
                              <span className="max-w-[180px] truncate text-right">
                                {reservation.purpose}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-4 flex justify-center">
        <div className="rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-black/5">
        <p className="text-xs font-medium text-gray-600">
          Showing {groupedHistory.length} of {new Set(roomHistory.map((entry) => entry.userName)).size} users
        </p>
      </div>
      </div>
    </div>
  );
}
