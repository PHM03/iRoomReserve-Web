'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { onRoomsByBuilding, Room } from '@/lib/rooms';
import { onReservationsByBuilding, Reservation } from '@/lib/reservations';
import {
  isRoomInClass,
  onSchedulesByBuilding,
  Schedule,
} from '@/lib/schedules';
import StatusBadge from '@/components/StatusBadge';
import { resolveRoomStatus } from '@/lib/roomStatus';

export default function RoomStatusPage() {
  const { firebaseUser, profile } = useAuth();
  const managedBuildings = profile?.assignedBuildings ?? [];
  const [selectedManagedBuildingId, setSelectedManagedBuildingId] = useState('');
  const effectiveManagedBuildingId = managedBuildings.some(
    (building) => building.id === selectedManagedBuildingId
  )
    ? selectedManagedBuildingId
    : managedBuildings[0]?.id ?? profile?.assignedBuildingId ?? '';
  const selectedManagedBuilding = managedBuildings.find(
    (building) => building.id === effectiveManagedBuildingId
  ) ?? managedBuildings[0];
  const buildingId = selectedManagedBuilding?.id ?? profile?.assignedBuildingId;
  const buildingName = selectedManagedBuilding?.name ?? profile?.assignedBuilding;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    if (!firebaseUser || !buildingId) {
      return;
    }

    const unsubscribeRooms = onRoomsByBuilding(buildingId, setRooms);
    const unsubscribeReservations = onReservationsByBuilding(
      buildingId,
      setReservations
    );
    const unsubscribeSchedules = onSchedulesByBuilding(buildingId, setSchedules);

    return () => {
      unsubscribeRooms();
      unsubscribeReservations();
      unsubscribeSchedules();
    };
  }, [buildingId, firebaseUser]);

  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Room Status</h2>
          <p className="text-white/40 mt-1">
            No building is assigned to your account yet.
          </p>
        </div>
      </main>
    );
  }

  const roomStatuses = rooms.map((room) => ({
    room,
    resolved: resolveRoomStatus(room, reservations, {
      activeSchedule: isRoomInClass(schedules, room.id),
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

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Room Status</h2>
          <p className="text-white/40 mt-1">
            Live room availability for{' '}
            <span className="text-teal-400 font-bold">{buildingName}</span>
          </p>
          {managedBuildings.length > 1 && (
            <div className="mt-4 max-w-xs">
              <label className="block text-xs font-bold uppercase tracking-wide text-white/35 mb-2">
                Active Building
              </label>
              <select
                value={buildingId ?? ''}
                onChange={(event) => setSelectedManagedBuildingId(event.target.value)}
                className="glass-input w-full px-4 py-3 bg-white/6 appearance-none cursor-pointer"
                style={{ backgroundImage: 'none' }}
              >
                {managedBuildings.map((building) => (
                  <option key={building.id} value={building.id} className="bg-[#1a1a2e] text-white">
                    {building.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-xs text-white/35 max-w-sm">
          Manual check-in updates this same status pipeline now, and BLE can be
          attached to the same backend flow later.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="glass-card p-5">
          <p className="text-xs text-white/40 font-bold">Total Rooms</p>
          <p className="text-2xl font-bold text-white mt-1">{rooms.length}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-white/40 font-bold">Available</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {availableCount}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-white/40 font-bold">Reserved</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            {reservedCount}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-white/40 font-bold">Ongoing</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">
            {ongoingCount}
          </p>
        </div>
      </div>

      {roomStatuses.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-sm text-white/30">No rooms configured yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roomStatuses.map(({ room, resolved }) => (
            <div
              key={room.id}
              className={`glass-card p-5 border-l-4 ${
                resolved.status === 'Available'
                  ? 'border-green-500/40'
                  : resolved.status === 'Reserved'
                    ? 'border-blue-500/40'
                    : resolved.status === 'Ongoing'
                      ? 'border-orange-500/40'
                      : 'border-red-500/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{room.name}</h3>
                  <p className="text-sm text-white/40">
                    {room.floor} | Capacity {room.capacity}
                  </p>
                </div>
                <StatusBadge status={resolved.status} />
              </div>
              <p className="text-sm text-white/55 mt-3">{resolved.detail}</p>
              <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-white/25 uppercase tracking-wide">Type</p>
                  <p className="text-white/60 mt-1">{room.roomType}</p>
                </div>
                <div>
                  <p className="text-white/25 uppercase tracking-wide">Cooling</p>
                  <p className="text-white/60 mt-1">{room.acStatus}</p>
                </div>
                <div>
                  <p className="text-white/25 uppercase tracking-wide">Display</p>
                  <p className="text-white/60 mt-1">{room.tvProjectorStatus}</p>
                </div>
                <div>
                  <p className="text-white/25 uppercase tracking-wide">Reserved By</p>
                  <p className="text-white/60 mt-1">
                    {resolved.reservation?.userName ?? 'No active reservation'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
