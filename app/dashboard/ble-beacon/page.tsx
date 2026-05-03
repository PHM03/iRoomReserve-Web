'use client';

import React, { useEffect, useMemo, useState } from 'react';
import BleAdminMonitor from '@/components/BleAdminMonitor';
import { useAuth } from '@/context/AuthContext';
import { getManagedBuildingsForCampus } from '@/lib/campusAssignments';
import { onRoomsByBuilding, Room } from '@/lib/rooms';

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

  useEffect(() => {
    if (!buildingId || !uid) {
      return;
    }

    let cancelled = false;

    const unsubscribeRooms = onRoomsByBuilding(buildingId, (nextRooms) => {
      if (cancelled) return;
      setRooms(nextRooms);
    });

    return () => {
      cancelled = true;
      unsubscribeRooms();
    };
  }, [buildingId, uid]);

  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
        <div className="mb-8">
          <div className="bg-white rounded-xl px-6 py-4 border border-white/30 inline-block">
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
      <div className="mb-8">
        <div className="bg-white rounded-xl px-6 py-4 border border-white/30 inline-block">
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

      <BleAdminMonitor buildingName={buildingName} rooms={rooms} />
    </main>
  );
}
