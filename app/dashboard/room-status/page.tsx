'use client';

import React, { useEffect, useMemo, useState } from 'react';
import BuildingSection from '@/components/room-status/BuildingSection';
import CampusSelector from '@/components/room-status/CampusSelector';
import FloorAccordion from '@/components/room-status/FloorAccordion';
import RoomList from '@/components/room-status/RoomList';
import { useAuth } from '@/context/AuthContext';
import { getManagedBuildingsForCampus } from '@/lib/campusAssignments';
import { onBuildings, type Building } from '@/lib/buildings';
import { inferCampusFromBuilding, type ReservationCampus } from '@/lib/campuses';
import { onRoomsByBuildingIds, Room } from '@/lib/rooms';
import {
  onReservationsByBuildingIds,
  Reservation,
} from '@/lib/reservations';
import {
  buildCampusOptions,
  type CampusOption,
  groupRoomStatusesByFloor,
  type RoomStatusViewItem,
} from '@/lib/roomStatusView';
import {
  isRoomInClass,
  onSchedulesByBuildingIds,
  Schedule,
} from '@/lib/schedules';
import { resolveRoomStatus } from '@/lib/roomStatus';

export default function RoomStatusPage() {
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;
  const managedBuildings = useMemo(
    () => getManagedBuildingsForCampus(profile?.campus),
    [profile?.campus]
  );
  const [buildingRecords, setBuildingRecords] = useState<Building[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<ReservationCampus | ''>('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const managedBuildingIds = useMemo(
    () => [...new Set(managedBuildings.map((building) => building.id))],
    [managedBuildings]
  );

  useEffect(() => {
    if (!uid || managedBuildingIds.length === 0) {
      return;
    }

    let cancelled = false;

    const unsubscribeBuildings = onBuildings((allBuildings) => {
      if (cancelled) return;
      setBuildingRecords(
        allBuildings.filter((building) => managedBuildingIds.includes(building.id))
      );
    });

    return () => {
      cancelled = true;
      unsubscribeBuildings();
    };
  }, [managedBuildingIds, uid]);

  const liveById = useMemo(
    () => new Map(buildingRecords.map((building) => [building.id, building])),
    [buildingRecords]
  );
  const fallbackNames = useMemo(
    () => new Map(managedBuildings.map((building) => [building.id, building.name])),
    [managedBuildings]
  );

  const managedBuildingOptions = useMemo(
    () =>
      managedBuildingIds.map((buildingId) => {
        const liveBuilding = liveById.get(buildingId);
        if (liveBuilding) {
          return liveBuilding;
        }

        const fallbackName = fallbackNames.get(buildingId) ?? buildingId;

        return {
          id: buildingId,
          name: fallbackName,
          code: '',
          address: '',
          floors: 0,
          campus:
            inferCampusFromBuilding({
              id: buildingId,
              name: fallbackName,
            }) ?? 'main',
          assignedAdminUid: null,
        } satisfies Building;
      }),
    [fallbackNames, liveById, managedBuildingIds]
  );

  const campusOptions: CampusOption[] = useMemo(
    () => buildCampusOptions(managedBuildingOptions),
    [managedBuildingOptions]
  );
  const effectiveCampusId =
    campusOptions.some((campus) => campus.id === selectedCampusId)
      ? selectedCampusId
      : campusOptions[0]?.id ?? '';
  const activeCampus = useMemo(
    () =>
      campusOptions.find((campus) => campus.id === effectiveCampusId) ??
      campusOptions[0],
    [campusOptions, effectiveCampusId]
  );
  const buildingOptions = useMemo(
    () => activeCampus?.buildings ?? [],
    [activeCampus]
  );
  const activeCampusBuildingIds = useMemo(
    () => buildingOptions.map((building) => building.buildingId),
    [buildingOptions]
  );

  useEffect(() => {
    if (!uid || activeCampusBuildingIds.length === 0) {
      return;
    }

    let cancelled = false;

    const unsubscribeRooms = onRoomsByBuildingIds(
      activeCampusBuildingIds,
      (nextRooms) => {
        if (cancelled) return;
        setRooms(nextRooms);
      }
    );
    const unsubscribeReservations = onReservationsByBuildingIds(
      activeCampusBuildingIds,
      (nextReservations) => {
        if (cancelled) return;
        setReservations(nextReservations);
      }
    );
    const unsubscribeSchedules = onSchedulesByBuildingIds(
      activeCampusBuildingIds,
      (nextSchedules) => {
        if (cancelled) return;
        setSchedules(nextSchedules);
      }
    );

    return () => {
      cancelled = true;
      unsubscribeRooms();
      unsubscribeReservations();
      unsubscribeSchedules();
    };
  }, [activeCampusBuildingIds, uid]);

  const roomStatuses: RoomStatusViewItem[] = rooms.map((room) => ({
    room,
    resolved: resolveRoomStatus(room, reservations, {
      activeSchedule: isRoomInClass(schedules, room.id),
    }),
  }));
  const buildingSections = buildingOptions.map((building) => ({
    building,
    floors: groupRoomStatusesByFloor(
      roomStatuses.filter((item) => item.room.buildingId === building.buildingId)
    ),
  }));
  const shouldShowBuildingSections =
    activeCampus?.id === 'main' || buildingSections.length > 1;
  const campusFloorGroups = shouldShowBuildingSections
    ? []
    : groupRoomStatusesByFloor(roomStatuses);

  const availableCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Available'
  ).length;
  const reservedCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Reserved'
  ).length;
  const ongoingCount = roomStatuses.filter(
    ({ resolved }) => resolved.status === 'Occupied'
  ).length;

  if (managedBuildingIds.length === 0) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
        <div className="mb-8">
          <div className="bg-white rounded-xl px-6 py-4 border border-white/30 inline-block">
            <h2 className="text-2xl font-bold text-gray-800">
              Room Status &amp; Schedule
            </h2>
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
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="bg-white rounded-xl px-6 py-4 border border-white/30">
          <h2 className="text-2xl font-bold text-gray-800">
            Room Status &amp; Schedule
          </h2>
          <p className="text-gray-600 mt-1">
            Expand a floor to render room cards for{' '}
            <span className="ui-text-teal font-bold">
              {activeCampus?.label ?? 'your assigned campus'}
            </span>
            .
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs text-black max-w-md">
          Floors stay collapsed by default so large buildings remain easy to
          scan without breaking the current reservation and live status flow.
        </div>
      </div>

      {campusOptions.length > 1 ? (
        <div className="mb-6">
          <CampusSelector
            options={campusOptions}
            value={effectiveCampusId}
            onChange={(campus) => {
              setSelectedCampusId(campus);
              setRooms([]);
              setReservations([]);
              setSchedules([]);
            }}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-5">
          <p className="text-xs text-black font-bold">Total Rooms</p>
          <p className="text-2xl font-bold text-black mt-1">{rooms.length}</p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-black font-bold">Available</p>
          <p className="text-2xl font-bold ui-text-green mt-1">
            {availableCount}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-black font-bold">Reserved</p>
          <p className="text-2xl font-bold ui-text-blue mt-1">
            {reservedCount}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-black font-bold">Occupied</p>
          <p className="text-2xl font-bold ui-text-orange mt-1">
            {ongoingCount}
          </p>
        </div>
      </div>

      {roomStatuses.length === 0 ? (
        <div className="rounded-[20px] border border-dark/10 bg-dark/5 p-12 text-center backdrop-blur-md">
          <p className="text-base font-bold text-black">
            No rooms are configured for this campus yet.
          </p>
          <p className="text-sm text-black mt-2">
            Once rooms are added, they will be grouped into collapsible floor
            sections automatically.
          </p>
        </div>
      ) : shouldShowBuildingSections ? (
        <div className="space-y-5">
          {buildingSections.map((section) => (
            <BuildingSection
              key={section.building.buildingId}
              building={section.building}
              floors={section.floors}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {campusFloorGroups.map((floorGroup) => {
            return (
              <FloorAccordion
                key={`${effectiveCampusId}:${floorGroup.id}`}
                floor={floorGroup.label}
                roomCount={floorGroup.rooms.length}
                renderContent={() => <RoomList items={floorGroup.rooms} />}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
