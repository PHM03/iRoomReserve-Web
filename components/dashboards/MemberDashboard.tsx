'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import TodayClassSchedulesPanel from '@/components/dashboards/TodayClassSchedulesPanel';
import Toast from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { normalizeRole, USER_ROLES } from '@/lib/domain/roles';
import {
  onReservationsByUser,
  Reservation,
} from '@/lib/reservations';
import { useBluetoothReservationCheckIn } from '@/hooks/useBluetoothReservationCheckIn';
import { onRoomsByIds, Room } from '@/lib/rooms';
import StatusBadge from '@/components/StatusBadge';
import {
  canReservationCheckIn,
  compareReservationSchedule,
  getLocalDateString,
  getReservationRoomStatus,
} from '@/lib/roomStatus';
import { formatDate, formatTimeRange } from '@/lib/dateTime';

interface MemberDashboardProps {
  firstName: string;
  welcomeEmoji: string;
}

export default function MemberDashboard({
  firstName,
  welcomeEmoji,
}: MemberDashboardProps) {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;
  const isStudent = normalizeRole(profile?.role ?? '') === USER_ROLES.STUDENT;
  const {
    checkInWithBluetooth,
    dismissToast,
    getConnectionStatus,
    loadingReservationId,
    showToast,
    toastMessage,
    toastType,
  } = useBluetoothReservationCheckIn();
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
  const getBluetoothConnectionStatus = (reservation: Reservation) => {
    const room = roomLookup[reservation.roomId];
    const localStatus = getConnectionStatus(reservation.id);

    if (localStatus === 'connecting') {
      return 'Connecting...';
    }

    if (localStatus === 'connected') {
      return 'Connected';
    }

    if (!room?.beaconId && reservation.checkInMethod !== 'bluetooth') {
      return null;
    }

    return room?.beaconConnected ? 'Connected' : 'Disconnected';
  };

  const getRoomStatus = (reservation: Reservation) =>
    getReservationRoomStatus(reservation, roomLookup[reservation.roomId]);
  const canCheckIn = (reservation: Reservation) =>
    canReservationCheckIn(reservation) &&
    getRoomStatus(reservation) !== 'Unavailable';
  const shouldShowBluetoothAction = (reservation: Reservation) =>
    getConnectionStatus(reservation.id) === 'connecting' || canCheckIn(reservation);

  const pendingCount = reservationHistory.filter(
    (reservation) => reservation.status === 'pending'
  ).length;
  const approvedReservations = [...reservationHistory]
    .filter((reservation) => reservation.status === 'approved')
    .sort(compareReservationSchedule);
  const approvedCount = approvedReservations.length;
  const activeReservation =
    approvedReservations.find(
      (reservation) =>
        reservation.checkedInAt || reservation.date === getLocalDateString()
    ) ?? approvedReservations[0];

  const today = getLocalDateString();
  const upcomingReservations = approvedReservations
    .filter((reservation) => reservation.date >= today)
    .slice(0, 3);
  const recentActivity = reservationHistory.slice(0, 5);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-[100px] relative z-10 pb-24 md:pb-8">
      <Toast
        message={toastMessage}
        type={toastType}
        show={showToast}
        onClose={dismissToast}
      />

      <div className="mb-8 flex items-start justify-between">
        <div className="bg-white rounded-xl px-6 py-4 border border-white/30">
          <h2 className="text-2xl font-bold text-gray-800">
            Welcome back, {firstName} {welcomeEmoji}
          </h2>
          <p className="text-gray-600 mt-1">
            Here&apos;s an overview of your reservations
          </p>
        </div>

        <Link
          href="/dashboard/reserve"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#a12124] text-white text-sm font-bold shadow-md hover:bg-[#8e1d20] transition-all hover:-translate-y-0.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Reservation</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
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
              {(() => {
                const bluetoothConnectionStatus =
                  getBluetoothConnectionStatus(activeReservation);

                return (
                  <>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-black">
                  {activeReservation.roomName}
                </h3>
                <StatusBadge status={getRoomStatus(activeReservation)} />
                {bluetoothConnectionStatus ? (
                  <StatusBadge status={bluetoothConnectionStatus} />
                ) : null}
              </div>
              <p className="text-xs text-black mt-2">
                {activeReservation.buildingName}
              </p>
              <p className="text-[10px] text-black mt-0.5">
                {formatDate(activeReservation.date)} | {formatTimeRange(activeReservation.startTime, activeReservation.endTime)}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <StatusBadge status={activeReservation.status} />
                {shouldShowBluetoothAction(activeReservation) && (
                  <button
                    onClick={() =>
                      checkInWithBluetooth({
                        reservation: activeReservation,
                        room: roomLookup[activeReservation.roomId],
                        userId: firebaseUser?.uid ?? '',
                      })
                    }
                    disabled={loadingReservationId === activeReservation.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold ui-button-orange disabled:opacity-50"
                  >
                    {loadingReservationId === activeReservation.id
                      ? 'Connecting...'
                      : 'Check In via Bluetooth'}
                  </button>
                )}
              </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-black font-bold">No active room</p>
              <p className="text-[10px] text-black mt-0.5">
                You have no approved reservation right now
              </p>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
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

        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
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

      {upcomingReservations.length > 0 && (
        <div className="mb-8">
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
              <div key={reservation.id} className="glass-card p-4 !rounded-xl">
                {(() => {
                  const bluetoothConnectionStatus =
                    getBluetoothConnectionStatus(reservation);

                  return (
                    <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-black">
                    {reservation.roomName}
                  </h4>
                  <StatusBadge status={getRoomStatus(reservation)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <StatusBadge status={reservation.status} />
                  {bluetoothConnectionStatus ? (
                    <StatusBadge status={bluetoothConnectionStatus} />
                  ) : null}
                  {shouldShowBluetoothAction(reservation) && (
                    <button
                      onClick={() =>
                        checkInWithBluetooth({
                          reservation,
                          room: roomLookup[reservation.roomId],
                          userId: firebaseUser?.uid ?? '',
                        })
                      }
                      disabled={loadingReservationId === reservation.id}
                      className="px-3 py-1 rounded-lg text-[11px] font-bold ui-button-orange disabled:opacity-50"
                    >
                      {loadingReservationId === reservation.id
                        ? 'Connecting...'
                        : 'Check In via Bluetooth'}
                    </button>
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
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 ${!isStudent ? 'lg:grid-cols-2' : ''}`}>
        <div>
          <div className="flex items-center justify-between mb-4 bg-white rounded-xl px-6 py-4 border border-white/30">
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
          <div className="bg-white border border-gray-200 shadow-sm !rounded-xl overflow-hidden">
            {recentActivity.length === 0 ? (
              <div className="p-12 text-center">
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
                <p className="text-sm text-black font-bold">No activity yet</p>
                <p className="text-xs text-black mt-1">
                  Your reservation history will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-dark/5">
                {recentActivity.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex items-center gap-4 p-4 hover:bg-primary/10 transition-colors"
                  >
                    <span
                      className={`w-2.5 h-full min-h-[40px] rounded-full shrink-0 ${
                        reservation.status === 'approved'
                          ? 'bg-green-400'
                          : reservation.status === 'rejected'
                            ? 'bg-red-400'
                            : reservation.status === 'completed'
                              ? 'bg-yellow-400'
                              : reservation.status === 'cancelled'
                                ? 'bg-gray-400'
                                : reservation.status === 'pending'
                                  ? 'bg-blue-400'
                                  : 'bg-dark/30'
                      }`}
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
                      <StatusBadge status={reservation.status} />
                      <StatusBadge status={getRoomStatus(reservation)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isStudent && (
          <div>
            <TodayClassSchedulesPanel scope="campus" />
          </div>
        )}
      </div>
    </main>
  );
}
