'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AdminFloorFilter from '@/components/admin/AdminFloorFilter';
import AdminClassSchedulesSection from '@/components/admin/AdminClassSchedulesSection';
import {
  getBuildingFloorOptions,
  getPreferredDefaultFloorValue,
} from '@/lib/buildings/floorLabels';
import AdminNoBuildingAssigned from '@/components/admin/AdminNoBuildingAssigned';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useAdminStatusPages } from '@/hooks/useAdminStatusPages';
import type { Room } from '@/lib/rooms/rooms';
import type { Schedule } from '@/lib/schedules/schedules';

type ScheduleFilterFields = Schedule & {
  floor?: unknown;
  floorLabel?: unknown;
  floorName?: unknown;
  floorNumber?: unknown;
  level?: unknown;
  room?: unknown;
  roomFloor?: unknown;
};

type CampusOverride = 'main' | 'digi';

let lastLoggedScheduleId: string | null = null;

function getCampusOverride(value: string | null): CampusOverride | undefined {
  return value === 'main' || value === 'digi' ? value : undefined;
}

function normalizeScheduleFilterValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as { label?: unknown; name?: unknown };
    return (
      normalizeScheduleFilterValue(record.name) ||
      normalizeScheduleFilterValue(record.label)
    );
  }

  return '';
}

function logFirstScheduleObject(schedule?: Schedule) {
  if (
    process.env.NODE_ENV === 'production' ||
    !schedule ||
    schedule.id === lastLoggedScheduleId
  ) {
    return;
  }

  lastLoggedScheduleId = schedule.id;
  console.log('Schedule object:', schedule);
}

function getScheduleRoomFilterValue(schedule: Schedule) {
  const scheduleFields = schedule as ScheduleFilterFields;
  return (
    normalizeScheduleFilterValue(scheduleFields.roomName) ||
    normalizeScheduleFilterValue(scheduleFields.room) ||
    normalizeScheduleFilterValue(scheduleFields.roomId)
  );
}

function getRoomFilterValue(room: Room) {
  return normalizeScheduleFilterValue(room.name) || normalizeScheduleFilterValue(room.id);
}

function getStoredRoomFloor(room: Room) {
  return room.floor;
}

export default function AdminClassSchedulesPage() {
  const searchParams = useSearchParams();
  const campusOverride = getCampusOverride(searchParams.get('campus'));
  const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('Ground Floor');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [clearButtonPressed, setClearButtonPressed] = useState(false);
  const [lastActiveBuildingId, setLastActiveBuildingId] = useState('');
  const {
    managedBuildings,
    buildingId,
    buildingName,
    activeBuildingLabel,
    setSelectedBuildingId,
    rooms,
    schedules,
    showScheduleForm,
    schedRoomId,
    setSchedRoomId,
    schedSubject,
    setSchedSubject,
    schedInstructor,
    setSchedInstructor,
    schedDay,
    setSchedDay,
    schedStart,
    setSchedStart,
    schedEnd,
    setSchedEnd,
    addingSchedule,
    editingScheduleId,
    toggleScheduleForm,
    handleSaveSchedule,
    handleEditSchedule,
    handleDeleteSchedule,
    campus,
  } = useAdminStatusPages({
    campusOverride,
    scheduleSelectionRequired: true,
    selectedScheduleFloor: selectedFloor,
    selectedScheduleRoom: selectedRoom,
  });

  const availableFloors = getBuildingFloorOptions({
    id: buildingId,
    name: buildingName
  });

  // Reset floor/room selections when the active building changes.
  if (buildingId && buildingId !== lastActiveBuildingId) {
    setLastActiveBuildingId(buildingId);
    setSelectedFloor(getPreferredDefaultFloorValue(availableFloors));
    setSelectedRoom('');
  }

  logFirstScheduleObject(schedules[0]);

  // Debug: surface the active filter values and schedule counts at runtime.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[page] schedules filter state', {
      selectedFloor,
      selectedRoom,
      roomsCount: rooms.length,
      schedulesCount: schedules.length,
    });
  }
  const hasActiveScheduleFilters = Boolean(selectedRoom || selectedFloor);
  const selectedFloorRooms = useMemo(
    () =>
      selectedFloor
        ? rooms.filter(
            (room) =>
              room.buildingId === buildingId &&
              getStoredRoomFloor(room) === selectedFloor
          )
        : [],
    [buildingId, rooms, selectedFloor]
  );
  const availableRooms = useMemo(() => {
    if (!selectedFloor) {
      return [];
    }

    return [
      ...new Set(
        selectedFloorRooms.map(getRoomFilterValue).filter(Boolean)
      ),
    ].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  }, [selectedFloor, selectedFloorRooms]);
  const roomOptions = useMemo(
    () =>
      availableRooms.map((room) => ({
        value: room,
        label: room,
      })),
    [availableRooms]
  );
  const selectedRoomIds = useMemo(
    () =>
      new Set(
        selectedRoom
          ? selectedFloorRooms
              .filter(
                (room) =>
                  room.id === selectedRoom || getRoomFilterValue(room) === selectedRoom
              )
              .map((room) => room.id)
          : selectedFloorRooms.map((room) => room.id)
      ),
    [selectedFloorRooms, selectedRoom]
  );
  const handleScheduleFloorChange = (nextFloor: string) => {
    setSelectedFloor(nextFloor);
    setSelectedRoom('');
  };
  useEffect(() => {
    if (!selectedFloor || availableRooms.length === 0) {
      if (selectedRoom) {
        setSelectedRoom('');
      }
      return;
    }

    if (!availableRooms.includes(selectedRoom)) {
      setSelectedRoom(availableRooms[0]);
    }
  }, [availableRooms, selectedFloor, selectedRoom]);

  const filteredSchedules = useMemo(() => {
    if (!selectedFloor) {
      return [];
    }

    const query = scheduleSearchQuery.trim().toLowerCase();

    return schedules.filter((schedule) => {
      const roomValue = getScheduleRoomFilterValue(schedule);

      if (
        query &&
        ![schedule.subjectName, roomValue, schedule.instructorName]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query))
      ) {
        return false;
      }

      if (!selectedRoomIds.has(schedule.roomId)) {
        return false;
      }

      return true;
    });
  }, [
    scheduleSearchQuery,
    schedules,
    selectedFloor,
    selectedRoomIds,
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10">
      {!buildingId || !buildingName ? (
        <AdminNoBuildingAssigned />
      ) : (
        <div className="flex w-full flex-col gap-4">
          <AdminPageHeader
            title="Class Schedules"
            description={
              <>
                Manage class schedule assignments for{' '}
                <span className="font-bold text-[#8B0000]">{buildingName}</span>.
              </>
            }
            managedBuildings={managedBuildings}
            buildingId={buildingId}
            buildingName={buildingName}
            activeBuildingLabel={activeBuildingLabel}
            onBuildingChange={setSelectedBuildingId}
            integratedBuildingField
          />

          <div className="w-full rounded-xl bg-white px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <div className="relative">
              <svg
                className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
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
                placeholder="Search by subject, room, or professor..."
                value={scheduleSearchQuery}
                onChange={(event) => setScheduleSearchQuery(event.target.value)}
                className="w-full border-0 bg-transparent py-2 pl-7 pr-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex w-full flex-row flex-wrap items-center gap-3 rounded-xl bg-white px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <AdminFloorFilter
              label="Floor:"
              options={availableFloors}
              value={selectedFloor}
              onChange={handleScheduleFloorChange}
              placeholder="Select Floor"
            />

            <AdminFloorFilter
              label="Room:"
              options={roomOptions}
              value={selectedRoom}
              onChange={setSelectedRoom}
              placeholder="Select a floor first"
              disabled={!selectedFloor}
            />

            <button
              onClick={() => {
                if (!hasActiveScheduleFilters) {
                  return;
                }

                setClearButtonPressed(true);
                setSelectedRoom('');
                setSelectedFloor('');
                window.setTimeout(() => setClearButtonPressed(false), 150);
              }}
              aria-disabled={!hasActiveScheduleFilters}
              className={`rounded-lg border px-[14px] py-2 text-sm font-bold transition-all duration-200 ease-in-out ${
                clearButtonPressed
                  ? 'border-[#8B0000] bg-[#8B0000] text-white'
                  : hasActiveScheduleFilters
                    ? 'cursor-pointer border-[#8B0000] bg-transparent text-[#8B0000] pointer-events-auto hover:bg-[#fff0f0]'
                    : 'pointer-events-none cursor-default border-[#cccccc] bg-transparent text-[#999999]'
              }`}
            >
              Clear
            </button>
          </div>

          <AdminClassSchedulesSection
            schedules={filteredSchedules}
            rooms={rooms}
            showScheduleForm={showScheduleForm}
            schedRoomId={schedRoomId}
            schedSubject={schedSubject}
            schedInstructor={schedInstructor}
            schedDay={schedDay}
            schedStart={schedStart}
            schedEnd={schedEnd}
            addingSchedule={addingSchedule}
            editingScheduleId={editingScheduleId}
            onToggleForm={toggleScheduleForm}
            onSchedRoomIdChange={setSchedRoomId}
            onSchedSubjectChange={setSchedSubject}
            onSchedInstructorChange={setSchedInstructor}
            onSchedDayChange={setSchedDay}
            onSchedStartChange={setSchedStart}
            onSchedEndChange={setSchedEnd}
            onSaveSchedule={handleSaveSchedule}
            onEditSchedule={handleEditSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            campus={campus}
          />
        </div>
      )}
    </main>
  );
}
