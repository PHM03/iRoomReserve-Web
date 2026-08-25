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
import {
  formatScheduleContextLabel,
  SCHEDULE_ACADEMIC_YEARS,
  SCHEDULE_SEMESTERS,
  type ScheduleAcademicYear,
  type ScheduleSemester,
} from '@/lib/schedules/scheduleContext';
import {
  clearRoomSchedules,
  getScheduleDisplayTitle,
  onSchedulesByBuilding,
  type Schedule,
} from '@/lib/schedules/schedules';

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
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [clearButtonPressed, setClearButtonPressed] = useState(false);
  const [lastActiveBuildingId, setLastActiveBuildingId] = useState('');
  const [selectedSemester, setSelectedSemester] =
    useState<ScheduleSemester>('1st Semester');
  const [selectedAcademicYear, setSelectedAcademicYear] =
    useState<ScheduleAcademicYear>('A.Y. 2025-2026');
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [allBuildingSchedules, setAllBuildingSchedules] = useState<Schedule[]>([]);
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
    schedCourseName,
    setSchedCourseName,
    schedSection,
    setSchedSection,
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
    scheduleSaveError,
    clearScheduleSaveError,
    toggleScheduleForm,
    handleSaveSchedule,
    handleEditSchedule,
    handleDeleteSchedule,
    campus,
    activeScheduleSemester,
    activeScheduleAcademicYear,
    currentUserId,
    switchingScheduleContext,
    handleSwitchScheduleContext,
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

  useEffect(() => {
    setSelectedSemester(activeScheduleSemester);
  }, [activeScheduleSemester]);

  useEffect(() => {
    setSelectedAcademicYear(activeScheduleAcademicYear);
  }, [activeScheduleAcademicYear]);

  useEffect(() => {
    if (!buildingId || !currentUserId) {
      setAllBuildingSchedules([]);
      return;
    }

    return onSchedulesByBuilding(
      buildingId,
      {
        academicYear: activeScheduleAcademicYear,
        semester: activeScheduleSemester,
      },
      setAllBuildingSchedules
    );
  }, [activeScheduleAcademicYear, activeScheduleSemester, buildingId, currentUserId]);

  useEffect(() => {
    if (availableFloors.length === 0) {
      return;
    }

    const hasMatchingFloor = availableFloors.some(
      (option) => option.value === selectedFloor
    );

    if (!selectedFloor || !hasMatchingFloor) {
      setSelectedFloor(getPreferredDefaultFloorValue(availableFloors));
    }
  }, [availableFloors, selectedFloor]);

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
  const selectedTopRoomId = useMemo(() => {
    const matchingRoom = selectedFloorRooms.find(
      (room) => room.id === selectedRoom || getRoomFilterValue(room) === selectedRoom
    );

    return matchingRoom?.id ?? '';
  }, [selectedFloorRooms, selectedRoom]);
  const handleScheduleFloorChange = (nextFloor: string) => {
    setSelectedFloor(nextFloor);
    setSelectedRoom('');
  };
  const handleScheduleFormRoomChange = (roomId: string) => {
    setSchedRoomId(roomId);

    const room = rooms.find((nextRoom) => nextRoom.id === roomId);
    if (!room) {
      return;
    }

    setSelectedFloor(room.floor);
    setSelectedRoom(getRoomFilterValue(room));
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

  useEffect(() => {
    if (!showScheduleForm || Boolean(editingScheduleId)) {
      return;
    }

    if (schedRoomId !== selectedTopRoomId) {
      setSchedRoomId(selectedTopRoomId);
    }
  }, [editingScheduleId, schedRoomId, selectedTopRoomId, setSchedRoomId, showScheduleForm]);

  const filteredSchedules = useMemo(() => {
    if (!selectedFloor) {
      return [];
    }

    const query = scheduleSearchQuery.trim().toLowerCase();

    return schedules.filter((schedule) => {
      const roomValue = getScheduleRoomFilterValue(schedule);

      if (
        query &&
        [
          getScheduleDisplayTitle(schedule),
          schedule.courseName,
          roomValue,
          schedule.instructorName,
        ]
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
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
  const hasPendingScheduleContextChanges =
    selectedSemester !== activeScheduleSemester ||
    selectedAcademicYear !== activeScheduleAcademicYear;
  const pendingScheduleContextLabel = formatScheduleContextLabel({
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });
  const selectedRoomDetails = rooms.find(
    (room) =>
      room.buildingId === buildingId &&
      getStoredRoomFloor(room) === selectedFloor &&
      (room.id === selectedRoom || getRoomFilterValue(room) === selectedRoom)
  );
  const selectedRoomId = selectedRoomDetails?.id ?? '';
  const selectedRoomScheduleCount = allBuildingSchedules.filter(
    (schedule) => schedule.roomId === selectedRoomId
  ).length;

  const handleClearRoomSchedules = async () => {
    if (!selectedRoomId || !buildingId) {
      return;
    }

    try {
      await clearRoomSchedules({
        roomId: selectedRoomId,
        buildingId,
        semester: activeScheduleSemester,
        academicYear: activeScheduleAcademicYear,
      });
    } catch (error) {
      console.warn('Failed to clear room schedules:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to clear the room schedule. Please try again.'
      );
      throw error;
    }
  };

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

          <div className="flex w-full flex-row flex-wrap items-end gap-3 rounded-xl bg-white px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
            <AdminFloorFilter
              label="Select Semester:"
              options={SCHEDULE_SEMESTERS.map((semester) => ({
                value: semester,
                label: semester,
              }))}
              value={selectedSemester}
              onChange={(value) => setSelectedSemester(value as ScheduleSemester)}
            />

            <AdminFloorFilter
              label="Select Academic Year:"
              options={SCHEDULE_ACADEMIC_YEARS.map((academicYear) => ({
                value: academicYear,
                label: academicYear,
              }))}
              value={selectedAcademicYear}
              onChange={(value) => setSelectedAcademicYear(value as ScheduleAcademicYear)}
            />

            <button
              type="button"
              onClick={() => setShowSwitchConfirm(true)}
              disabled={!hasPendingScheduleContextChanges || switchingScheduleContext}
              className="rounded-lg bg-[#8B0000] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#6e0000] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {switchingScheduleContext ? 'Switching...' : 'Switch Schedules'}
            </button>
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
            allSchedules={allBuildingSchedules}
            rooms={rooms}
            showScheduleForm={showScheduleForm}
            schedRoomId={schedRoomId}
            schedCourseName={schedCourseName}
            schedSection={schedSection}
            schedInstructor={schedInstructor}
            schedDay={schedDay}
            schedStart={schedStart}
            schedEnd={schedEnd}
            addingSchedule={addingSchedule}
            editingScheduleId={editingScheduleId}
            onToggleForm={toggleScheduleForm}
            onSchedRoomIdChange={handleScheduleFormRoomChange}
            onSchedCourseNameChange={setSchedCourseName}
            onSchedSectionChange={setSchedSection}
            onSchedInstructorChange={setSchedInstructor}
            onSchedDayChange={setSchedDay}
            onSchedStartChange={setSchedStart}
            onSchedEndChange={setSchedEnd}
            scheduleSaveError={scheduleSaveError}
            onClearScheduleSaveError={clearScheduleSaveError}
            onSaveSchedule={handleSaveSchedule}
            onEditSchedule={handleEditSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            selectedRoomId={selectedRoomId}
            selectedRoomName={selectedRoomDetails?.name ?? 'this room'}
            roomScheduleCount={selectedRoomScheduleCount}
            onClearRoomSchedules={handleClearRoomSchedules}
            buildingId={buildingId}
            currentUserId={currentUserId}
            activeScheduleSemester={activeScheduleSemester}
            activeScheduleAcademicYear={activeScheduleAcademicYear}
            campus={campus}
          />

          {showSwitchConfirm ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h4 className="mb-2 text-base font-bold text-gray-900">
                  Switch Class Schedules?
                </h4>
                <p className="mb-6 text-sm text-gray-500">
                  Are you sure you want to switch the class schedules to{' '}
                  <span className="font-semibold text-gray-800">
                    {pendingScheduleContextLabel}
                  </span>
                  ?
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSwitchConfirm(false)}
                    disabled={switchingScheduleContext}
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleSwitchScheduleContext({
                        academicYear: selectedAcademicYear,
                        semester: selectedSemester,
                      });
                      setShowSwitchConfirm(false);
                    }}
                    disabled={switchingScheduleContext}
                    className="rounded-lg bg-[#8B0000] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#6e0000] disabled:opacity-50"
                  >
                    {switchingScheduleContext ? 'Switching...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
