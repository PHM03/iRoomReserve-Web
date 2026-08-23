'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';

import StatusBadge from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { onRoomsByIds, Room } from '@/lib/rooms/rooms';
import {
  cancelReservation,
  completeReservation,
  onReservationsByUser,
  Reservation,
} from '@/lib/reservations/reservations';
import { canReservationCheckIn, getReservationRoomStatus } from '@/lib/rooms/roomStatus';
import { formatDate, formatTimeRange } from '@/lib/utils/dateTime';

type FilterTab = 'pending' | 'approved' | 'rejected' | 'completed' | 'all';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatReservationDates(dates?: string[], fallbackDate?: string) {
  const dateList = dates?.length ? dates : fallbackDate ? [fallbackDate] : [];
  return dateList.map((date) => formatDate(date)).join(', ');
}

// ---------------------------------------------------------------------------
// localStorage helpers (same approach as Inbox badge system)
// ---------------------------------------------------------------------------
const LS_PREFIX = 'res_lastSeen';

function readLsNumber(key: string): number {
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function makeLsKey(uid: string, tab: string): string {
  return `${LS_PREFIX}${tab}_${uid}`;
}

export default function MyReservationsPage() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // localStorage keys for "last seen" counts per tab.
  const lsKeyPending   = uid ? makeLsKey(uid, 'Pending')   : '';
  const lsKeyApproved  = uid ? makeLsKey(uid, 'Approved')  : '';
  const lsKeyRejected  = uid ? makeLsKey(uid, 'Rejected')  : '';
  const lsKeyCompleted = uid ? makeLsKey(uid, 'Completed') : '';

  const [lastSeenPendingCount,   setLastSeenPendingCount]   = useState(() => readLsNumber(lsKeyPending));
  const [lastSeenApprovedCount,  setLastSeenApprovedCount]  = useState(() => readLsNumber(lsKeyApproved));
  const [lastSeenRejectedCount,  setLastSeenRejectedCount]  = useState(() => readLsNumber(lsKeyRejected));
  const [lastSeenCompletedCount, setLastSeenCompletedCount] = useState(() => readLsNumber(lsKeyCompleted));

  // Re-read localStorage when the user changes (login/logout).
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLastSeenPendingCount(readLsNumber(lsKeyPending));
      setLastSeenApprovedCount(readLsNumber(lsKeyApproved));
      setLastSeenRejectedCount(readLsNumber(lsKeyRejected));
      setLastSeenCompletedCount(readLsNumber(lsKeyCompleted));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [lsKeyPending, lsKeyApproved, lsKeyRejected, lsKeyCompleted]);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(currentMonth);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const unsubscribeReservations = onReservationsByUser(uid, (nextReservations) => {
      if (cancelled) return;
      setReservations(nextReservations);
    });
    return () => {
      cancelled = true;
      unsubscribeReservations();
    };
  }, [uid]);

  useEffect(() => {
    const roomIds = [...new Set(reservations.map((r) => r.roomId))];
    if (roomIds.length === 0) return;
    let cancelled = false;
    const unsubscribeRooms = onRoomsByIds(roomIds, (nextRooms) => {
      if (cancelled) return;
      setRooms(nextRooms);
    });
    return () => {
      cancelled = true;
      unsubscribeRooms();
    };
  }, [reservations]);

  const roomLookup = Object.fromEntries(
    rooms.map((room) => [room.id, room] as const)
  ) as Record<string, Room | undefined>;

  // Dynamically get available years from reservation data
  const availableYears = useMemo(() => {
    const years = reservations
      .map((r) => new Date(r.date).getFullYear())
      .filter((y) => !isNaN(y));
    return [...new Set(years)].sort((a, b) => b - a);
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    let result = reservations;

    // Search overrides all other filters
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return result.filter(
        (r) =>
          r.roomName?.toLowerCase().includes(q) ||
          r.roomId?.toLowerCase().includes(q) ||
          r.buildingName?.toLowerCase().includes(q) ||
          r.purpose?.toLowerCase().includes(q)
      );
    }

    // Year/month filter
    if (selectedYear !== 'all') {
      result = result.filter((r) => {
        const d = new Date(r.date);
        return d.getFullYear() === selectedYear;
      });
    }
    if (selectedMonth !== 'all') {
      result = result.filter((r) => {
        const d = new Date(r.date);
        return d.getMonth() === selectedMonth;
      });
    }

    // Status filter — rejected tab includes cancelled
    if (activeFilter === 'rejected') {
      return result.filter(
        (r) => r.status === 'rejected' || r.status === 'cancelled'
      );
    }
    if (activeFilter === 'all') return result;
    return result.filter((r) => r.status === activeFilter);
  }, [reservations, searchQuery, selectedYear, selectedMonth, activeFilter]);

  const getCount = (key: FilterTab) => {
    if (key === 'rejected')
      return reservations.filter(
        (r) => r.status === 'rejected' || r.status === 'cancelled'
      ).length;
    if (key === 'all') return reservations.length;
    return reservations.filter((r) => r.status === key).length;
  };

  // Badge counts: show only NEW items since user last clicked that tab.
  const pendingCount   = getCount('pending');
  const approvedCount  = getCount('approved');
  const rejectedCount  = getCount('rejected');
  const completedCount = getCount('completed');

  const pendingBadge   = Math.max(0, pendingCount   - lastSeenPendingCount);
  const approvedBadge  = Math.max(0, approvedCount  - lastSeenApprovedCount);
  const rejectedBadge  = Math.max(0, rejectedCount  - lastSeenRejectedCount);
  const completedBadge = Math.max(0, completedCount - lastSeenCompletedCount);

  const filters: { key: FilterTab; label: string; badge?: number }[] = [
    {
      key: 'pending',
      label: 'Pending',
      badge: pendingBadge || undefined
    },
    {
      key: 'approved',
      label: 'Approved',
      badge: approvedBadge || undefined
    },
    {
      key: 'rejected',
      label: 'Rejected',
      badge: rejectedBadge || undefined
    },
    {
      key: 'completed',
      label: 'Completed',
      badge: completedBadge || undefined
    },
    {
      key: 'all',
      label: 'All'
    },
  ];

  // When the user clicks a tab, persist the "last seen" count so the badge clears.
  const handleTabClick = useCallback(
    (tab: FilterTab) => {
      setActiveFilter(tab);

      const persist = (key: string, count: number, setter: (n: number) => void) => {
        setter(count);
        try { localStorage.setItem(key, String(count)); }
        catch { /* quota exceeded — non-critical */ }
      };

      switch (tab) {
        case 'pending':   persist(lsKeyPending,   pendingCount,   setLastSeenPendingCount);   break;
        case 'approved':  persist(lsKeyApproved,  approvedCount,  setLastSeenApprovedCount);  break;
        case 'rejected':  persist(lsKeyRejected,  rejectedCount,  setLastSeenRejectedCount);  break;
        case 'completed': persist(lsKeyCompleted, completedCount, setLastSeenCompletedCount); break;
      }
    },
    [
      lsKeyPending, lsKeyApproved, lsKeyRejected, lsKeyCompleted,
      pendingCount, approvedCount, rejectedCount, completedCount,
    ]
  );

  const handleCancel = async (reservationId: string) => {
    if (!firebaseUser) return;
    setActionLoading(reservationId);
    try {
      await cancelReservation(reservationId, firebaseUser.uid);
    } catch (error) {
      console.error('Failed to cancel:', error);
    }
    setActionLoading(null);
  };

  const handleComplete = async (reservationId: string) => {
    if (!firebaseUser) return;
    setActionLoading(reservationId);
    try {
      await completeReservation(reservationId, firebaseUser.uid);
    } catch (error) {
      console.error('Failed to complete:', error);
    }
    setActionLoading(null);
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
      <div className="mb-8">
        <div className="w-full rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-gray-800">My Reservations</h2>
          <p className="text-gray-600 mt-1">
            View and manage all your room reservations
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search by room, campus, or purpose..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {/* Year / Month Filters */}
      <div className="mb-4 flex w-full flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
        <select
          value={selectedYear}
          onChange={(event) =>
            setSelectedYear(event.target.value === 'all' ? 'all' : Number(event.target.value))
          }
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Years</option>
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <select
          value={selectedMonth}
          onChange={(event) =>
            setSelectedMonth(event.target.value === 'all' ? 'all' : Number(event.target.value))
          }
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Months</option>
          {MONTHS.map((month, i) => (
            <option key={month} value={i}>
              {month}
            </option>
          ))}
        </select>

        {(selectedYear !== 'all' || selectedMonth !== 'all') && (
          <button
            onClick={() => {
              setSelectedYear('all');
              setSelectedMonth('all');
            }}
            className="text-xs text-primary font-bold hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <button
              key={filter.key}
              onClick={() => handleTabClick(filter.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                isActive
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-200 hover:text-primary'
              }`}
            >
              {filter.label}
              {filter.badge !== undefined && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'border border-primary/20 bg-primary/10 text-primary'
                  }`}
                >
                  {filter.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Reservation List */}
      <div className="space-y-4">
        {filteredReservations.length === 0 ? (
          <div className="glass-card p-12 !rounded-xl text-center">
            <svg
              className="w-14 h-14 text-black mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-sm text-black font-bold">
              No {activeFilter === 'all' ? '' : activeFilter} reservations found
            </p>
          </div>
        ) : (
          filteredReservations.map((reservation) => {
            const room = roomLookup[reservation.roomId];
            const roomStatus = getReservationRoomStatus(reservation, room);
            const showMobileAppStartLabel =
              canReservationCheckIn(reservation) && roomStatus !== 'Unavailable';

            return (
              <div
                key={reservation.id}
                className="rounded-xl bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-base font-bold text-black">
                          {reservation.roomName}
                        </h3>
                        {reservation.isEvent === 'Yes' && (
                          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100 px-2.5 py-0.5 text-xs font-bold leading-5 text-violet-800">
                            Event
                          </span>
                        )}
                        <StatusBadge status={reservation.status} />
                        <StatusBadge status={roomStatus} />
                      </div>
                      <p className="text-sm text-black">{reservation.buildingName}</p>
                      <div className="flex flex-wrap items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs text-black">
                            {formatReservationDates(reservation.dates, reservation.date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs text-black">
                            {formatTimeRange(reservation.startTime, reservation.endTime)}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-black mt-1.5">{reservation.purpose}</p>
                    </div>

                    <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:min-w-[140px]">
                      {(reservation.status === 'pending' ||
                        reservation.status === 'approved') && (
                        <button
                          onClick={() => handleCancel(reservation.id)}
                          disabled={actionLoading === reservation.id}
                          className="px-4 py-2 rounded-xl text-xs font-bold ui-button-red disabled:opacity-50"
                        >
                          {actionLoading === reservation.id ? 'Processing...' : 'Cancel'}
                        </button>
                      )}
                      {reservation.status === 'approved' && (
                        <button
                          onClick={() => handleComplete(reservation.id)}
                          disabled={actionLoading === reservation.id}
                          className="px-4 py-2 rounded-xl text-xs font-bold ui-button-green disabled:opacity-50"
                        >
                          {actionLoading === reservation.id ? 'Processing...' : 'Mark Complete'}
                        </button>
                      )}
                    </div>
                  </div>
                  {showMobileAppStartLabel ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                      <span className="inline-flex items-center rounded-lg border border-blue-200 bg-white/70 px-3 py-1.5 text-xs font-bold text-blue-800">
                        Start Reservation through Mobile App
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
