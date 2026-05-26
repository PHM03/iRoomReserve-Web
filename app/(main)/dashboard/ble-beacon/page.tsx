'use client';

import React, { useEffect, useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import { getManagedBuildingOptionLabel } from '@/components/admin/dashboard/shared';
import BleAdminMonitor from '@/components/ble/BleAdminMonitor';
import { useAuth } from '@/context/AuthContext';
import { getManagedBuildingsForCampus } from '@/lib/buildings/campusAssignments';
import { onRoomsByBuilding, Room } from '@/lib/rooms/rooms';
import { onReservationsByBuilding, Reservation } from '@/lib/reservations/reservations';

export default function BleBeaconPage() {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;
  const managedBuildings = useMemo(
    () => getManagedBuildingsForCampus(profile?.campus),
    [profile?.campus]
  );
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
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (!buildingId || !uid) {
      return;
    }

    let cancelled = false;

    const unsubscribeRooms = onRoomsByBuilding(buildingId, (nextRooms) => {
      if (cancelled) return;
      setRooms(nextRooms);
    });
    const unsubscribeReservations = onReservationsByBuilding(
      buildingId,
      (nextReservations) => {
        if (cancelled) return;
        setReservations(nextReservations);
      }
    );

    return () => {
      cancelled = true;
      unsubscribeRooms();
      unsubscribeReservations();
    };
  }, [buildingId, uid]);

  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
        <div className="mb-8">
          <div className="inline-block rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
            <h2 className="text-2xl font-bold text-gray-800">BLE Beacon Status</h2>
            <p className="text-gray-600 mt-1">
              No campus is assigned to your account yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
      <div className="relative z-[60] mb-8">
        <div className="inline-block rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-gray-800">BLE Beacon Status</h2>
          <p className="text-gray-600 mt-1">
            Full beacon telemetry, connection history, and refresh controls for{' '}
            <span className="ui-text-teal font-bold">{buildingName}</span>.
          </p>
        </div>
        {managedBuildings.length > 1 && (
          <div className="mt-4 max-w-xs">
            <label className="block text-xs font-bold uppercase tracking-wide text-black mb-2">
              Active Building
            </label>
            <AdminBuildingSelect
              label=""
              options={managedBuildings.map((building) => ({
                value: building.id,
                label: getManagedBuildingOptionLabel(building),
              }))}
              value={buildingId ?? ''}
              onChange={setSelectedManagedBuildingId}
              className="w-full"
              fullWidth
            />
          </div>
        )}
      </div>

      <BleAdminMonitor
        buildingName={buildingName}
        reservations={reservations}
        rooms={rooms}
      />
    </main>
  );
}
