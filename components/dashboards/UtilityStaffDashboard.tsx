'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import BleAdminMonitor from '@/components/BleAdminMonitor';
import { useAuth } from '@/context/AuthContext';
import {
  DAY_NAMES,
  formatTime12h,
  isRoomInClass,
  onSchedulesByBuilding,
  Schedule,
} from '@/lib/schedules';
import {
  onReservationsByBuilding,
  Reservation,
} from '@/lib/reservations';
import {
  AdminRequest,
  onAdminRequestsByBuilding,
} from '@/lib/adminRequests';
import {
  onRoomsByBuilding,
  Room,
} from '@/lib/rooms';
import StatusBadge from '@/components/StatusBadge';
import {
  getCurrentTimeString,
  getLocalDateString,
  resolveRoomStatus,
} from '@/lib/roomStatus';
import { getManagedBuildingsForCampus } from '@/lib/campusAssignments';

interface UtilityStaffDashboardProps {
  firstName: string;
}

export default function UtilityStaffDashboard({
  firstName,
}: UtilityStaffDashboardProps) {
  const { firebaseUser, profile } = useAuth();
  const managedBuildings = getManagedBuildingsForCampus(profile?.campus);
  const [selectedManagedBuildingId, setSelectedManagedBuildingId] = useState('');
  const effectiveManagedBuildingId = managedBuildings.some(
    (building) => building.id === selectedManagedBuildingId
  )
    ? selectedManagedBuildingId
    : managedBuildings[0]?.id ?? '';
  const selectedManagedBuilding = managedBuildings.find(
    (building) => building.id === effectiveManagedBuildingId
  ) ?? managedBuildings[0];
  const buildingId = selectedManagedBuilding?.id;
  const buildingName = selectedManagedBuilding?.name;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);

  useEffect(() => {
    if (!buildingId || !firebaseUser) {
      return;
    }

    const unsubscribeRooms = onRoomsByBuilding(buildingId, setRooms);
    const unsubscribeSchedules = onSchedulesByBuilding(buildingId, setSchedules);
    const unsubscribeReservations = onReservationsByBuilding(
      buildingId,
      setReservations
    );
    const unsubscribeRequests = onAdminRequestsByBuilding(
      buildingId,
      setAdminRequests
    );

    return () => {
      unsubscribeRooms();
      unsubscribeSchedules();
      unsubscribeReservations();
      unsubscribeRequests();
    };
  }, [buildingId, firebaseUser]);

  const today = new Date();
  const todayDateString = getLocalDateString(today);
  const currentDay = today.getDay();
  const currentTime = getCurrentTimeString(today);

  const todaySchedules = schedules.filter(
    (schedule) => schedule.dayOfWeek === currentDay
  );
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
    ({ resolved }) => resolved.status === 'Ongoing'
  ).length;

  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-black">Hello, {firstName} 🔑</h2>
          <p className="text-black mt-1">Utility Staff Dashboard</p>
        </div>
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 ui-text-yellow"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-black mb-2">
            No Campus Assigned
          </h3>
          <p className="text-sm text-black max-w-sm mx-auto">
            Your account has been approved, but no campus has been assigned to
            you yet. Please contact the Super Admin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-black">Hello, {firstName} 🔑</h2>
        <p className="text-black mt-1">
          Managing: <span className="ui-text-teal font-bold">{buildingName}</span>
        </p>
        {managedBuildings.length > 1 && (
          <div className="mt-4 max-w-xs">
            <label className="block text-xs font-bold uppercase tracking-wide text-black mb-2">
              Active Building
            </label>
            <select
              value={buildingId ?? ''}
              onChange={(event) => setSelectedManagedBuildingId(event.target.value)}
              className="glass-input w-full px-4 py-3 bg-dark/6 appearance-none cursor-pointer"
              style={{ backgroundImage: 'none' }}
            >
              {managedBuildings.map((building) => (
                <option key={building.id} value={building.id} className="bg-white text-black">
                  {building.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="glass-card p-5 border-l-4 border-teal-500/60">
          <p className="text-2xl font-bold ui-text-teal">{rooms.length}</p>
          <p className="text-xs text-black font-bold">Total Rooms</p>
        </div>
        <div className="glass-card p-5 border-l-4 border-green-500/60">
          <p className="text-2xl font-bold ui-text-green">{availableCount}</p>
          <p className="text-xs text-black font-bold">Available</p>
        </div>
        <div className="glass-card p-5 border-l-4 border-blue-500/60">
          <p className="text-2xl font-bold ui-text-blue">{reservedCount}</p>
          <p className="text-xs text-black font-bold">Reserved</p>
        </div>
        <div className="glass-card p-5 border-l-4 border-orange-500/60">
          <p className="text-2xl font-bold ui-text-orange">{ongoingCount}</p>
          <p className="text-xs text-black font-bold">Ongoing</p>
        </div>
        <div className="glass-card p-5 border-l-4 border-yellow-500/60">
          <p className="text-2xl font-bold ui-text-yellow">{openRequests.length}</p>
          <p className="text-xs text-black font-bold">Open Requests</p>
        </div>
      </div>

      <div className="glass-card p-5 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-black">Room Status Overview</h3>
            <p className="text-sm text-black mt-1">
              Monitor live room states and approved reservations for {buildingName}.
            </p>
          </div>
          <Link
            href="/dashboard/room-status"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all"
          >
            Open Room Status
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="rounded-xl border border-dark/10 bg-dark/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status="Available" />
            </div>
            <p className="text-sm text-black">
              Rooms ready for the next reservation.
            </p>
          </div>
          <div className="rounded-xl border border-dark/10 bg-dark/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status="Reserved" />
            </div>
            <p className="text-sm text-black">
              Approved classes or reservations are holding the room.
            </p>
          </div>
          <div className="rounded-xl border border-dark/10 bg-dark/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status="Ongoing" />
            </div>
            <p className="text-sm text-black">
              A reservation has checked in and is actively using the room.
            </p>
          </div>
        </div>
      </div>

      <section className="mb-8">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-black">BLE Beacon Status</h3>
          <p className="text-sm text-black mt-1">
            Full beacon telemetry, connection history, and refresh controls for {buildingName}.
          </p>
        </div>
        <BleAdminMonitor buildingName={buildingName} rooms={rooms} />
      </section>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-black">
            Today&apos;s Class Schedules
            <span className="text-sm text-black font-normal ml-2">
              ({DAY_NAMES[currentDay]})
            </span>
          </h3>
          <span className="text-xs text-black">
            {todaySchedules.length} class{todaySchedules.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {todaySchedules.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-3xl mb-2">📚</div>
            <p className="text-sm text-black">No classes scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {todaySchedules.map((schedule) => {
              const isActive =
                schedule.startTime <= currentTime && schedule.endTime > currentTime;
              const isUpcoming = schedule.startTime > currentTime;

              return (
                <div
                  key={schedule.id}
                  className={`glass-card p-4 border-l-4 ${
                    isActive
                      ? 'border-orange-500/60'
                      : isUpcoming
                        ? 'border-teal-500/40'
                        : 'border-dark/10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-black">
                        {schedule.subjectName}
                      </p>
                      <p className="text-xs text-black mt-0.5">
                        {schedule.roomName} | {schedule.instructorName}
                      </p>
                      <p className="text-xs text-black mt-1">
                        {formatTime12h(schedule.startTime)} -{' '}
                        {formatTime12h(schedule.endTime)}
                      </p>
                    </div>
                    {isActive && <StatusBadge status="Reserved" />}
                    {isUpcoming && !isActive && <StatusBadge status="Available" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-black">
            Today&apos;s Room Reservations
          </h3>
          <span className="text-xs text-black">
            {todayReservations.length} reservation
            {todayReservations.length !== 1 ? 's' : ''}
          </span>
        </div>

        {todayReservations.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-sm text-black">No reservations for today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayReservations.map((reservation) => {
              const reservationRoom = rooms.find(
                (room) => room.id === reservation.roomId
              );
              const roomStatus = resolveRoomStatus(
                reservationRoom ?? {
                  id: reservation.roomId,
                  status: reservation.checkedInAt ? 'Ongoing' : 'Reserved',
                },
                reservations,
                { now: today }
              );

              return (
                <div
                  key={reservation.id}
                  className="glass-card p-4 sm:p-5 border-l-4 border-blue-500/30"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-dark/5 border border-dark/10 flex items-center justify-center text-black font-bold text-sm shrink-0">
                        {reservation.userName
                          .split(' ')
                          .map((name) => name[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-black text-sm">
                            {reservation.userName}
                          </h4>
                          <StatusBadge status={reservation.status} />
                          <StatusBadge status={roomStatus.status} />
                        </div>
                        <p className="text-xs text-black mt-0.5">
                          {reservation.roomName} | {reservation.startTime} -{' '}
                          {reservation.endTime}
                        </p>
                        <p className="text-xs text-black mt-0.5">
                          Purpose: {reservation.purpose}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-black">{roomStatus.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-black">Admin Requests</h3>
          {openRequests.length > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ui-badge-blue">
              {openRequests.length} open
            </span>
          )}
        </div>

        {adminRequests.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-sm text-black">
              No admin requests for this building.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {adminRequests.slice(0, 10).map((request) => {
              const requestStatusStyle =
                request.status === 'open'
                  ? 'ui-badge-blue'
                  : request.status === 'responded'
                    ? 'ui-badge-green'
                    : 'ui-badge-gray';
              const requestTypeIcon =
                request.type === 'equipment'
                  ? '🔧'
                  : request.type === 'general'
                    ? '💬'
                    : '📋';

              return (
                <div key={request.id} className="glass-card p-4 sm:p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-dark/5 border border-dark/10 flex items-center justify-center text-black font-bold text-sm shrink-0">
                        {request.userName
                          .split(' ')
                          .map((name) => name[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-bold text-black text-sm">
                            {request.userName}
                          </h4>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${requestStatusStyle} capitalize`}
                          >
                            {request.status}
                          </span>
                        </div>
                        <p className="text-xs text-black">
                          <span className="mr-1">{requestTypeIcon}</span>
                          {request.type} | {request.subject}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-black mb-2">{request.message}</p>
                  {request.adminResponse && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                      <p className="text-xs font-bold text-primary mb-1">
                        Admin Response
                      </p>
                      <p className="text-sm text-black">
                        {request.adminResponse}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
