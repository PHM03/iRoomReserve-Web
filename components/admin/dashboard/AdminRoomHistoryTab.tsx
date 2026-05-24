'use client';

import { useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import type { RoomHistoryEntry } from '@/lib/rooms/roomHistory';
import { formatDate, formatTimeRange } from '@/lib/utils/dateTime';
import { getManagedBuildingOptionLabel, RoleBadge, StatusBadge } from './shared';

type HistoryStatusFilter = 'approved' | 'rejectedCancelled' | 'active' | 'completed' | 'all';
type HistoryDateSortDirection = 'asc' | 'desc';

const HISTORY_STATUS_FILTERS: Array<{ key: HistoryStatusFilter; label: string }> = [
  {
    key: 'approved',
    label: 'Approved'
  },
  {
    key: 'rejectedCancelled',
    label: 'Rejected/Cancelled'
  },
  {
    key: 'active',
    label: 'Active'
  },
  {
    key: 'completed',
    label: 'Completed'
  },
  {
    key: 'all',
    label: 'All'
  },
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

function getHistoryDateValue(date: string) {
  const dateValue = new Date(`${date}T00:00:00`).getTime();
  return Number.isNaN(dateValue) ? 0 : dateValue;
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

  const availableHistoryYears = useMemo(() => {
    const years = roomHistory
      .map((entry) => new Date(`${entry.date}T00:00:00`).getFullYear())
      .filter((year) => !Number.isNaN(year));

    return [...new Set([currentYear, ...years])].sort((left, right) => right - left);
  }, [currentYear, roomHistory]);

  const filteredHistory = useMemo(
    () => {
      const filteredEntries = roomHistory.filter((entry) => {
        const normalizedStatus = entry.status.toLowerCase();

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
          historySearch &&
          !entry.userName.toLowerCase().includes(historySearch.toLowerCase()) &&
          !entry.roomName.toLowerCase().includes(historySearch.toLowerCase())
        ) {
          return false;
        }

        return true;
      });

      return filteredEntries.sort((left, right) => {
        const leftDate = getHistoryDateValue(left.date);
        const rightDate = getHistoryDateValue(right.date);

        return historyDateSortDirection === 'desc'
          ? rightDate - leftDate
          : leftDate - rightDate;
      });
    },
    [historyDateSortDirection, historyFilter, historyMonthFilter, historySearch, historyYearFilter, roomHistory]
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 bg-white rounded-xl px-6 py-4 border border-white/30 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1">
              <input
                type="text"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search by name or room..."
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={historyYearFilter}
                onChange={(event) => setHistoryYearFilter(event.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all focus:border-[#a12124] focus:outline-none focus:ring-2 focus:ring-[#a12124]/25"
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
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all focus:border-[#a12124] focus:outline-none focus:ring-2 focus:ring-[#a12124]/25"
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
          <div className="flex gap-2 flex-wrap items-center">
            {HISTORY_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setHistoryFilter(filter.key)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  historyFilter === filter.key
                    ? 'bg-primary text-white border border-primary'
                    : 'bg-white text-gray-700 border border-gray-200 hover:text-primary'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">History</div>
          <h4 className="text-lg font-bold text-black mb-1">No Reservations Found</h4>
          <p className="text-sm text-black">
            {historySearch || historyFilter !== 'all'
              ? 'Try adjusting your filters.'
              : 'Reservation history will appear here.'}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block glass-card overflow-hidden !rounded-xl">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-dark/10">
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Room
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">
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
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Purpose
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((reservation) => (
                  <tr
                    key={reservation.id}
                    className="border-b border-dark/5 hover:bg-primary/10 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-black">{reservation.userName}</span>
                        <RoleBadge role={reservation.userRole} />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-black">
                      {reservation.roomName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          reservation.type === 'reservation' ? 'ui-badge-blue' : 'ui-badge-purple'
                        }`}
                      >
                        {reservation.type === 'reservation' ? 'Reservation' : 'Class'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-black">
                      {formatDate(reservation.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-black">
                      {formatTimeRange(reservation.startTime, reservation.endTime)}
                    </td>
                    <td className="px-6 py-4 text-sm text-black max-w-[200px] truncate">
                      {reservation.purpose}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={reservation.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredHistory.map((reservation) => (
              <div key={reservation.id} className="glass-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-black text-sm">{reservation.userName}</span>
                    <RoleBadge role={reservation.userRole} />
                  </div>
                  <StatusBadge status={reservation.status} />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-black">Room:</span>
                    <span className="font-bold text-black">{reservation.roomName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black">Type:</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        reservation.type === 'reservation' ? 'ui-badge-blue' : 'ui-badge-purple'
                      }`}
                    >
                      {reservation.type === 'reservation' ? 'Reservation' : 'Class'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black">Date:</span>
                    <span className="text-black">{formatDate(reservation.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black">Time:</span>
                    <span className="text-black">
                      {formatTimeRange(reservation.startTime, reservation.endTime)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black">Purpose:</span>
                    <span className="text-black truncate max-w-[180px]">
                      {reservation.purpose}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 text-center">
        <p className="text-xs text-black">
          Showing {filteredHistory.length} of {roomHistory.length} entries
        </p>
      </div>
    </div>
  );
}
