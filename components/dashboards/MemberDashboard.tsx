'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MyReservationTimetable from '@/components/rooms/schedules/MyReservationTimetable';
import { useAuth } from '@/context/AuthContext';
import {
  onReservationsByUser,
  Reservation,
} from '@/lib/reservations/reservations';
import { onRoomsByIds, Room } from '@/lib/rooms/rooms';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  canReservationCheckIn,
  compareReservationSchedule,
  getCurrentDateTimeStringInTimeZone,
  getReservationRoomStatus,
  isReservationActiveTimeSlot,
} from '@/lib/rooms/roomStatus';
import { formatDate, formatTimeRange } from '@/lib/utils/dateTime';

interface MemberDashboardProps {
  firstName: string;
  welcomeEmoji: string;
}

type RecentActivityStatus = Reservation['status'] | 'expired';

const dashboardPanelClasses =
  'rounded-2xl border border-white/35 bg-white/75 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl';
const dashboardCardClasses =
  'relative overflow-hidden rounded-2xl border border-white/35 bg-white/75 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-2xl';
const iconTileClasses =
  'flex h-10 w-10 items-center justify-center rounded-2xl border border-white/40 bg-white/70 shadow-sm backdrop-blur-xl';

function getReservationDateList(reservation: Reservation) {
  return reservation.dates?.length
    ? reservation.dates
    : reservation.date
      ? [reservation.date]
      : [];
}

function getRecentActivityStatus(
  reservation: Reservation,
  currentDate: string
): RecentActivityStatus {
  const reservationDates = getReservationDateList(reservation);
  const isPastApprovedReservation =
    reservation.status === 'approved' &&
    !reservation.checkedInAt &&
    reservationDates.length > 0 &&
    reservationDates.every((date) => date < currentDate);

  return isPastApprovedReservation ? 'expired' : reservation.status;
}

function getRecentActivityAccentClass(status: RecentActivityStatus) {
  switch (status) {
    case 'approved':
      return 'bg-green-400';
    case 'expired':
      return 'bg-gray-400';
    case 'rejected':
      return 'bg-red-400';
    case 'completed':
      return 'bg-yellow-400';
    case 'cancelled':
      return 'bg-gray-400';
    case 'pending':
      return 'bg-blue-400';
    default:
      return 'bg-dark/30';
  }
}

export default function MemberDashboard({
  firstName,
  welcomeEmoji,
}: Readonly<MemberDashboardProps>) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const [reservationHistory, setReservationHistory] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    if (!uid) {
      return;
    }

    let cancelled = false;

    const unsubscribeReservations = onReservationsByUser(uid, (nextReservations) => {
      if (cancelled) return;
      setReservationHistory(nextReservations);
    });

    return () => {
      cancelled = true;
      unsubscribeReservations();
    };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    const roomIds = [...new Set(reservationHistory.map((reservation) => reservation.roomId))];

    let unsubscribeRooms = () => {};

    if (roomIds.length > 0) {
      unsubscribeRooms = onRoomsByIds(roomIds, (nextRooms) => {
        if (cancelled) return;
        setRooms(nextRooms);
      });
    }

    return () => {
      cancelled = true;
      unsubscribeRooms();
    };
  }, [reservationHistory]);

  const roomLookup = Object.fromEntries(
    rooms.map((room) => [room.id, room] as const)
  ) as Record<string, Room | undefined>;
  const getRoomStatus = (reservation: Reservation) =>
    getReservationRoomStatus(reservation, roomLookup[reservation.roomId]);
  const canCheckIn = (reservation: Reservation) =>
    canReservationCheckIn(reservation) &&
    getRoomStatus(reservation) !== 'Unavailable';
  const shouldShowMobileAppStartLabel = (reservation: Reservation) =>
    canCheckIn(reservation);

  const pendingCount = reservationHistory.filter(
    (reservation) => reservation.status === 'pending'
  ).length;
  const approvedReservations = [...reservationHistory]
    .filter((reservation) => reservation.status === 'approved')
    .sort(compareReservationSchedule);
  const approvedCount = approvedReservations.length;
  const currentDateTime = getCurrentDateTimeStringInTimeZone();
  const activeReservation =
    approvedReservations.find(
      (reservation) =>
        (Boolean(reservation.checkedInAt) && !reservation.occupancyReleasedAt) ||
        isReservationActiveTimeSlot(reservation)
    ) ?? null;

  const upcomingReservations = approvedReservations
    .filter(
      (reservation) =>
        reservation.date > currentDateTime.date ||
        (reservation.date === currentDateTime.date &&
          reservation.startTime > currentDateTime.time)
    )
    .slice(0, 3);
  const recentActivity = reservationHistory.slice(0, 3);

  return (
    <main className="relative z-10 mx-auto max-w-7xl px-4 pb-24 pt-[100px] sm:px-6 lg:px-8 md:pb-8">
      <div className="mb-10">
        <div className={`${dashboardPanelClasses} px-6 py-4`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                Welcome, {firstName} {welcomeEmoji}
              </h2>
              <p className="mt-1 text-gray-600">
                Here&apos;s an overview of your reservations
              </p>
            </div>

            <Link
              href="/dashboard/reserve"
              className="inline-flex items-center justify-center gap-2 self-center sm:self-auto rounded-2xl bg-[#a12124] px-5 py-3 text-sm font-bold text-white shadow-xl shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#8e1d20] hover:shadow-2xl hover:shadow-primary/30"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Reservation</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className={`${dashboardCardClasses} shadow-blue-500/10 hover:shadow-blue-500/20`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`${iconTileClasses} bg-blue-500/10 text-blue-700`}>
              <svg
                className="w-4 h-4 ui-text-blue"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <span className="text-xs text-black font-bold">Current Room</span>
          </div>
          {activeReservation ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-black">
                  {activeReservation.roomName}
                </h3>
                <StatusBadge status={getRoomStatus(activeReservation)} />
              </div>
              <p className="text-xs text-black mt-2">
                {activeReservation.buildingName}
              </p>
              <p className="text-[10px] text-black mt-0.5">
                {formatDate(activeReservation.date)} | {formatTimeRange(activeReservation.startTime, activeReservation.endTime)}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <StatusBadge status={activeReservation.status} />
                {shouldShowMobileAppStartLabel(activeReservation) && (
                  <span className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">
                    Start Reservation through Mobile App
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-black font-bold">No reserved room right now</p>
              <p className="text-[10px] text-black mt-0.5">
                You do not have a room reserved for the current time
              </p>
            </div>
          )}
        </div>

        <div className={`${dashboardCardClasses} shadow-purple-500/10 hover:shadow-purple-500/20`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`${iconTileClasses} bg-purple-500/10 text-purple-700`}>
              <svg
                className="w-4 h-4 ui-text-purple"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <span className="text-xs text-black font-bold">
              Pending Requests
            </span>
          </div>
          <h3 className="text-3xl font-bold text-black">{pendingCount}</h3>
          <p className="text-xs text-black mt-0.5">Awaiting approval</p>
        </div>

        <div className={`${dashboardCardClasses} shadow-green-500/10 hover:shadow-green-500/20`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`${iconTileClasses} bg-green-500/10 text-green-700`}>
              <svg
                className="w-4 h-4 ui-text-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span className="text-xs text-black font-bold">Approved</span>
          </div>
          <h3 className="text-3xl font-bold text-black">{approvedCount}</h3>
          <p className="text-xs text-black mt-0.5">Ready to use</p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-6 bg-transparent">
      {upcomingReservations.length > 0 && (
        <section className={`w-full px-6 py-5 ${dashboardPanelClasses}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-black">Upcoming Reservations</h3>
            <Link
              href="/dashboard/reservations"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:text-primary-hover hover:bg-primary/10 transition-colors"
              title="View all activity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {upcomingReservations.map((reservation) => (
              <div
                key={reservation.id}
                className="dashboard-row rounded-2xl p-5 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-black">
                    {reservation.roomName}
                  </h4>
                  <StatusBadge status={getRoomStatus(reservation)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <StatusBadge status={reservation.status} />
                  {shouldShowMobileAppStartLabel(reservation) && (
                    <span className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-800">
                      Start Reservation through Mobile App
                    </span>
                  )}
                </div>
                <p className="text-xs text-black">{reservation.buildingName}</p>
                <div className="flex items-center gap-2 mt-2">
                  <svg
                    className="w-3.5 h-3.5 text-black"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-xs text-black">{formatDate(reservation.date)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <svg
                    className="w-3.5 h-3.5 text-black"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-xs text-black">
                    {formatTimeRange(reservation.startTime, reservation.endTime)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

        <section className={`w-full px-6 py-5 ${dashboardPanelClasses}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-800">Recent Activity</h3>
            <Link
              href="/dashboard/reservations"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-primary hover:bg-primary/10 transition-colors"
              title="View all activity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="dashboard-table-shell overflow-hidden rounded-2xl backdrop-blur-xl">
            {recentActivity.length === 0 ? (
              <div className="dashboard-empty-state m-4 rounded-2xl p-12 text-center">
                <svg
                  className="w-14 h-14 text-black/60 mx-auto mb-3"
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
                <p className="text-sm text-black font-bold">No activity yet</p>
                <p className="text-xs text-black mt-1">
                  Your reservation history will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/35">
                {recentActivity.map((reservation) => {
                  const recentActivityStatus = getRecentActivityStatus(
                    reservation,
                    currentDateTime.date
                  );

                  return (
                    <div
                      key={reservation.id}
                      className="flex items-center gap-4 p-4 transition-all duration-300 hover:bg-white/80"
                    >
                      <span
                        className={`w-2.5 h-full min-h-[40px] rounded-full shrink-0 ${getRecentActivityAccentClass(recentActivityStatus)}`}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-black">
                          {reservation.roomName} | {reservation.buildingName}
                        </h4>
                        <p className="text-xs text-black mt-0.5">
                          {formatDate(reservation.date)} | {formatTimeRange(reservation.startTime, reservation.endTime)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={recentActivityStatus} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <MyReservationTimetable
          className="w-full"
          currentUserId={uid}
          reservations={reservationHistory}
        />

      </div>
    </main>
  );
}
