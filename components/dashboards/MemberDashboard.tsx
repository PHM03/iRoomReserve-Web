'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Toast from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import {
  onReservationsByUser,
  Reservation,
} from '@/lib/reservations';
import { useBluetoothReservationCheckIn } from '@/hooks/useBluetoothReservationCheckIn';
import {
  markAllNotificationsRead,
  markNotificationRead,
  Notification,
  onUnreadNotifications,
} from '@/lib/notifications';
import {
  DAY_NAMES,
  formatTime12h,
  onSchedulesByBuildingIds,
  Schedule,
} from '@/lib/schedules';
import { onRoomsByIds, Room } from '@/lib/rooms';
import StatusBadge from '@/components/StatusBadge';
import {
  canReservationCheckIn,
  compareReservationSchedule,
  getLocalDateString,
  getReservationRoomStatus,
} from '@/lib/roomStatus';

interface MemberDashboardProps {
  firstName: string;
  welcomeEmoji: string;
}

export default function MemberDashboard({
  firstName,
  welcomeEmoji,
}: Readonly<MemberDashboardProps>) {
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const uid = firebaseUser?.uid;
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
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
    const unsubscribeNotifications = onUnreadNotifications(uid, (nextNotifications) => {
      if (cancelled) return;
      setNotifications(nextNotifications);
    });

    return () => {
      cancelled = true;
      unsubscribeReservations();
      unsubscribeNotifications();
    };
  }, [uid]);

  useEffect(() => {
    const roomIds = [...new Set(reservationHistory.map((reservation) => reservation.roomId))];
    const buildingIds = [
      ...new Set(reservationHistory.map((reservation) => reservation.buildingId)),
    ];

    let cancelled = false;
    let unsubscribeRooms = () => {};
    let unsubscribeSchedules = () => {};

    if (roomIds.length > 0) {
      unsubscribeRooms = onRoomsByIds(roomIds, (nextRooms) => {
        if (cancelled) return;
        setRooms(nextRooms);
      });
    }

    if (buildingIds.length > 0) {
      unsubscribeSchedules = onSchedulesByBuildingIds(buildingIds, (nextSchedules) => {
        if (cancelled) return;
        setSchedules(nextSchedules);
      });
    }

    return () => {
      cancelled = true;
      unsubscribeRooms();
      unsubscribeSchedules();
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

  const handleMarkAllRead = async () => {
    if (!firebaseUser) {
      return;
    }

    await markAllNotificationsRead(firebaseUser.uid);
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markNotificationRead(notification.id);
    setShowNotifications(false);

    if (notification.reservationId) {
      router.push(`/dashboard/inbox?reservationId=${encodeURIComponent(notification.reservationId)}`);
      return;
    }

    router.push('/dashboard/inbox');
  };

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

  const todayDay = new Date().getDay();
  const todaySchedules = schedules.filter(
    (schedule) => schedule.dayOfWeek === todayDay
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-[100px] relative z-10 pb-24 md:pb-8">
      <Toast
        message={toastMessage}
        type={toastType}
        show={showToast}
        onClose={dismissToast}
      />

      <div className="mb-8 flex items-start justify-between">
        <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30">
          <h2 className="text-2xl font-bold text-gray-800">
            Welcome back, {firstName} {welcomeEmoji}
          </h2>
          <p className="text-gray-600 mt-1">
            Here&apos;s an overview of your reservations
          </p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 rounded-xl glass-card !p-2.5 hover:!border-primary/40 transition-all"
          >
            <svg
              className="w-5 h-5 text-black"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {notifications.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 !rounded-xl overflow-hidden z-50 border border-dark/12 shadow-2xl shadow-black/20" style={{ background: 'rgba(248, 246, 242, 0.98)', backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center justify-between p-4 border-b border-dark/10">
                <h4 className="font-bold text-black text-sm">Notifications</h4>
                {notifications.length > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-primary font-bold hover:text-primary-hover transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm text-black/80">No new notifications</p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="p-3 border-b border-dark/5 hover:bg-primary/8 transition-colors flex items-start gap-3 cursor-pointer"
                      onClick={() => void handleNotificationClick(notification)}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          notification.type === 'reservation_approved'
                            ? 'bg-green-500/20'
                            : notification.type === 'reservation_rejected'
                              ? 'bg-red-500/20'
                              : 'bg-primary/20'
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 ${
                            notification.type === 'reservation_approved'
                              ? 'ui-text-green'
                              : notification.type === 'reservation_rejected'
                                ? 'ui-text-red'
                                : 'text-primary'
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          {notification.type === 'reservation_approved' ? (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          ) : notification.type === 'reservation_rejected' ? (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          ) : (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                            />
                          )}
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-black">
                          {notification.title}
                        </p>
                        <p className="text-[11px] text-black/80 mt-0.5 leading-relaxed">
                          {notification.message}
                        </p>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void markNotificationRead(notification.id);
                        }}
                        className="text-black/70 hover:text-primary transition-colors shrink-0"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-5">
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
                {activeReservation.date} | {activeReservation.startTime} -{' '}
                {activeReservation.endTime}
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

        <div className="glass-card p-5">
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

        <div className="glass-card p-5">
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

      <Link
        href="/dashboard/reserve"
        className="group mb-8 flex w-full items-center justify-center gap-3 rounded-2xl border border-[#a12124]/90 bg-[#a12124] px-5 py-5 text-white shadow-[0_14px_32px_rgba(161,33,36,0.16)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:bg-[#8e1d20] hover:shadow-[0_18px_34px_rgba(142,29,32,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a12124]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5]"
      >
        <svg
          className="h-6 w-6 text-white transition-transform duration-300 ease-in-out group-hover:scale-105"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span className="text-lg font-bold text-white">
          New Reservation
        </span>
      </Link>

      {upcomingReservations.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-black">Upcoming Reservations</h3>
            <Link
              href="/dashboard/reservations"
              className="text-sm text-primary font-bold hover:text-primary-hover transition-colors"
            >
              View all -&gt;
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
                  <span className="text-xs text-black">{reservation.date}</span>
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
                    {reservation.startTime} - {reservation.endTime}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-4 backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30">
            <h3 className="text-xl font-bold text-gray-800">Recent Activity</h3>
            <Link
              href="/dashboard/reservations"
              className="text-sm text-gray-600 font-bold hover:text-gray-800 transition-colors"
            >
              View all -&gt;
            </Link>
          </div>
          <div className="glass-card !rounded-xl overflow-hidden">
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
                        {reservation.date} | {reservation.startTime} -{' '}
                        {reservation.endTime}
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

        <div>
          <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 mb-4 inline-block border border-white/30">
            <h3 className="text-xl font-bold text-gray-800">
              Today&apos;s Class Schedules
              <span className="text-sm text-gray-600 font-normal ml-2">
                ({DAY_NAMES[todayDay]})
              </span>
            </h3>
          </div>
          <div className="glass-card !rounded-xl overflow-hidden">
            {todaySchedules.length === 0 ? (
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
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-black font-bold">No classes today</p>
                <p className="text-xs text-black mt-1">
                  No scheduled classes for today
                </p>
              </div>
            ) : (
              <div className="divide-y divide-dark/5">
                {todaySchedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="p-4 hover:bg-primary/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-black">
                          {schedule.subjectName}
                        </h4>
                        <p className="text-xs text-black mt-0.5">
                          {schedule.instructorName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary">
                          {formatTime12h(schedule.startTime)} -{' '}
                          {formatTime12h(schedule.endTime)}
                        </p>
                        <p className="text-[10px] text-black">
                          {schedule.roomName}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
