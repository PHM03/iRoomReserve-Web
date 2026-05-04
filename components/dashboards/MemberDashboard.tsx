'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Toast from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { getManagedBuildingIdsForCampus } from '@/lib/campusAssignments';
import { normalizeRole, USER_ROLES } from '@/lib/domain/roles';
import {
  onReservationsByUser,
  Reservation,
} from '@/lib/reservations';
import { useBluetoothReservationCheckIn } from '@/hooks/useBluetoothReservationCheckIn';
import {
  formatTime12h,
  getSchedulesByRoomId,
  Schedule,
} from '@/lib/schedules';
import { onRoomsByBuilding, onRoomsByIds, Room } from '@/lib/rooms';
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

type ScheduleCampusFilter = 'SDCA Digi Campus' | 'SDCA Main Campus';
type ScheduleBuildingFilter = 'gd1' | 'gd2' | 'gd3';

const SCHEDULE_DAY_OPTIONS = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
] as const;

const DIGI_FLOOR_OPTIONS = [
  { label: 'Ground Floor', value: 'Ground Floor' },
  { label: '2nd Floor', value: '2nd Floor' },
  { label: '3rd Floor', value: '3rd Floor' },
  { label: '4th Floor', value: '4th Floor' },
] as const;

const MAIN_BUILDING_OPTIONS = [
  { label: 'GD1', value: 'gd1' },
  { label: 'GD2', value: 'gd2' },
  { label: 'GD3', value: 'gd3' },
] as const;

const MAIN_FLOOR_OPTIONS_BY_BUILDING: Record<
  ScheduleBuildingFilter,
  ReadonlyArray<{ label: string; value: string }>
> = {
  gd1: [
    { label: 'Basement', value: 'Basement Floor' },
    { label: 'Ground Floor', value: 'Ground Floor' },
    { label: '1st Floor', value: '1st Floor' },
    { label: '2nd Floor', value: '2nd Floor' },
    { label: '3rd Floor', value: '3rd Floor' },
    { label: '4th Floor', value: '4th Floor' },
    { label: '5th Floor', value: '5th Floor' },
    { label: '6th Floor', value: '6th Floor' },
    { label: '7th Floor', value: '7th Floor' },
    { label: '8th Floor', value: '8th Floor' },
  ],
  gd2: [
    { label: 'Ground Floor', value: 'Ground Floor' },
    { label: '1st Floor', value: '1st Floor' },
    { label: '2nd Floor', value: '2nd Floor' },
    { label: '3rd Floor', value: '3rd Floor' },
    { label: '4th Floor', value: '4th Floor' },
    { label: '5th Floor', value: '5th Floor' },
    { label: '6th Floor', value: '6th Floor' },
    { label: '7th Floor', value: '7th Floor' },
    { label: '8th Floor', value: '8th Floor' },
    { label: '9th Floor', value: '9th Floor' },
    { label: '10th Floor', value: '10th Floor' },
  ],
  gd3: [
    { label: 'Ground Floor', value: 'Ground Floor' },
    { label: '1st Floor', value: '1st Floor' },
    { label: '2nd Floor', value: '2nd Floor' },
    { label: '3rd Floor', value: '3rd Floor' },
    { label: '4th Floor', value: '4th Floor' },
    { label: '5th Floor', value: '5th Floor' },
    { label: '6th Floor', value: '6th Floor' },
    { label: '7th Floor', value: '7th Floor' },
    { label: '8th Floor', value: '8th Floor' },
    { label: '9th Floor', value: '9th Floor' },
    { label: '10th Floor', value: '10th Floor' },
    { label: '11th Floor', value: '11th Floor' },
  ],
};

function getDefaultSelectedDay(): string {
  const currentDay = new Date().getDay();
  return SCHEDULE_DAY_OPTIONS.find((option) => option.value === currentDay)?.label ?? 'Monday';
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
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomOptions, setRoomOptions] = useState<Room[]>([]);
  const [loadedRoomFilterKey, setLoadedRoomFilterKey] = useState<string>('');
  const [loadedScheduleKey, setLoadedScheduleKey] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>(getDefaultSelectedDay);
  const [selectedCampus, setSelectedCampus] = useState<ScheduleCampusFilter | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<ScheduleBuildingFilter | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedFloor) {
      return;
    }

    const targetBuildingId =
      selectedCampus === 'SDCA Digi Campus'
        ? getManagedBuildingIdsForCampus('digi')[0] ?? null
        : selectedCampus === 'SDCA Main Campus'
          ? selectedBuilding
          : null;

    if (!targetBuildingId) {
      return;
    }

    const roomFilterKey = `${selectedCampus}:${targetBuildingId}:${selectedFloor}`;
    let cancelled = false;
    const unsubscribe = onRoomsByBuilding(targetBuildingId, (nextRooms) => {
      if (cancelled) return;
      const filteredRooms = nextRooms
        .filter((room) => room.floor === selectedFloor)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
      setRoomOptions(filteredRooms);
      setLoadedRoomFilterKey(roomFilterKey);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedCampus, selectedBuilding, selectedFloor]);

  useEffect(() => {
    if (!selectedRoom) {
      return;
    }

    const scheduleKey = `${selectedRoom}:${selectedDay}`;
    let cancelled = false;

    void getSchedulesByRoomId(selectedRoom)
      .then((nextSchedules) => {
        if (cancelled) return;
        setSchedules(nextSchedules);
        setLoadedScheduleKey(scheduleKey);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Failed to load room schedules:', error);
        setSchedules([]);
        setLoadedScheduleKey(scheduleKey);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRoom, selectedDay]);

  const roomLookup = Object.fromEntries(
    rooms.map((room) => [room.id, room] as const)
  ) as Record<string, Room | undefined>;
  const selectedDayOptionIndex = SCHEDULE_DAY_OPTIONS.findIndex(
    (option) => option.label === selectedDay
  );
  const selectedDayValue =
    SCHEDULE_DAY_OPTIONS[selectedDayOptionIndex]?.value ?? SCHEDULE_DAY_OPTIONS[0].value;
  const selectedFloorOptions =
    selectedCampus === 'SDCA Digi Campus'
      ? DIGI_FLOOR_OPTIONS
      : selectedCampus === 'SDCA Main Campus' && selectedBuilding
        ? MAIN_FLOOR_OPTIONS_BY_BUILDING[selectedBuilding]
        : [];
  const roomFilterKey =
    selectedFloor && selectedCampus
      ? `${selectedCampus}:${selectedCampus === 'SDCA Digi Campus' ? getManagedBuildingIdsForCampus('digi')[0] ?? '' : selectedBuilding ?? ''}:${selectedFloor}`
      : '';
  const isRoomOptionsLoading = Boolean(
    selectedFloor && roomFilterKey && loadedRoomFilterKey !== roomFilterKey
  );
  const availableRooms = loadedRoomFilterKey === roomFilterKey ? roomOptions : [];
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

  const todaySchedules = schedules.filter(
    (schedule) => schedule.dayOfWeek === selectedDayValue
  );
  const currentScheduleKey = selectedRoom ? `${selectedRoom}:${selectedDay}` : '';
  const isScheduleLoaded = currentScheduleKey !== '' && loadedScheduleKey === currentScheduleKey;

  const handleDayStep = (direction: -1 | 1) => {
    const baseIndex = selectedDayOptionIndex >= 0 ? selectedDayOptionIndex : 0;
    const nextIndex =
      (baseIndex + direction + SCHEDULE_DAY_OPTIONS.length) % SCHEDULE_DAY_OPTIONS.length;
    setSelectedDay(SCHEDULE_DAY_OPTIONS[nextIndex].label);
  };

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

        {!isStudent && (
          <div>
            <div className="flex items-center justify-between mb-4 bg-white rounded-xl px-6 py-4 border border-white/30">
              <h3 className="text-xl font-bold text-gray-800">Today&apos;s Class Schedules</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDayStep(-1)}
                  className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center"
                  title="Previous day"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <select
                  aria-label="Select day"
                  className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                >
                  {SCHEDULE_DAY_OPTIONS.map((option) => (
                    <option key={option.label} value={option.label}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleDayStep(1)}
                  className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center"
                  title="Next day"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <select
                aria-label="Select Campus"
                className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={selectedCampus ?? ''}
                onChange={(e) => {
                  const nextCampus = e.target.value ? (e.target.value as ScheduleCampusFilter) : null;
                  setSelectedCampus(nextCampus);
                  setSelectedBuilding(null);
                  setSelectedFloor(null);
                  setSelectedRoom(null);
                }}
              >
                <option value="">Select Building</option>
                <option value="SDCA Digi Campus">SDCA Digi Campus</option>
                <option value="SDCA Main Campus">SDCA Main Campus</option>
              </select>

              {selectedCampus === 'SDCA Main Campus' && (
                <select
                  aria-label="Select building"
                  className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={selectedBuilding ?? ''}
                  onChange={(e) => {
                    const nextBuilding = e.target.value ? (e.target.value as ScheduleBuildingFilter) : null;
                    setSelectedBuilding(nextBuilding);
                    setSelectedFloor(null);
                    setSelectedRoom(null);
                  }}
                >
                  <option value="">Select Building</option>
                  {MAIN_BUILDING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}

              {(selectedCampus === 'SDCA Digi Campus' || (selectedCampus === 'SDCA Main Campus' && selectedBuilding)) && (
                <select
                  aria-label="Select Floor"
                  className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={selectedFloor ?? ''}
                  onChange={(e) => {
                    setSelectedFloor(e.target.value || null);
                    setSelectedRoom(null);
                  }}
                >
                  <option value="">Select Floor</option>
                  {selectedFloorOptions.map((floor) => (
                    <option key={floor.value} value={floor.value}>{floor.label}</option>
                  ))}
                </select>
              )}

              {selectedFloor && (
                <select
                  aria-label="Select Room"
                  className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={selectedRoom ?? ''}
                  onChange={(e) => setSelectedRoom(e.target.value || null)}
                  disabled={isRoomOptionsLoading || availableRooms.length === 0}
                >
                  <option value="">
                    {isRoomOptionsLoading
                      ? 'Loading rooms...'
                      : availableRooms.length === 0
                        ? 'No rooms available'
                        : 'Select Room'}
                  </option>
                  {availableRooms.map((room) => (
                    <option key={room.id} value={room.id}>{room.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="bg-white border border-gray-200 shadow-sm !rounded-xl overflow-hidden">
              {!selectedRoom ? (
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
                  <p className="text-sm text-black font-bold">Select a room to view its schedule</p>
                </div>
              ) : !isScheduleLoaded ? (
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
                  <p className="text-sm text-black font-bold">Loading classes</p>
                  <p className="text-xs text-black mt-1">Fetching {selectedDay}&apos;s schedule for the selected room</p>
                </div>
              ) : todaySchedules.length === 0 ? (
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
                  <p className="text-xs text-black mt-1">No scheduled classes for the selected room on {selectedDay}</p>
                </div>
              ) : (
                <div className="divide-y divide-dark/5">
                  {todaySchedules.map((schedule) => (
                    <div key={schedule.id} className="p-4 hover:bg-primary/10 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-black">{schedule.subjectName}</h4>
                          <p className="text-xs text-black mt-0.5">{schedule.instructorName}</p>
                          <p className="text-xs text-black mt-0.5">{schedule.roomName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">
                            {formatTime12h(schedule.startTime)} - {formatTime12h(schedule.endTime)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
