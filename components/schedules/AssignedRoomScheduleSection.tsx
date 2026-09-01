'use client';

import { useEffect, useMemo, useState } from 'react';

import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import AdminClassSchedulesSection from '@/components/admin/AdminClassSchedulesSection';
import { useAuth } from '@/context/AuthContext';
import { normalizeRole, USER_ROLES } from '@/lib/auth/roles';
import { onBuildingById } from '@/lib/buildings/buildings';
import {
  getManagedBuildingIdsForCampus,
  getManagedBuildingsForCampus,
} from '@/lib/buildings/campusAssignments';
import { inferCampusFromBuilding } from '@/lib/buildings/campuses';
import { sortFloorOptions, type FloorOption } from '@/lib/buildings/floorLabels';
import { onAllRooms, onRoomsByBuildingIds, type Room } from '@/lib/rooms/rooms';
import { getAssignedRoomDisplayLabel } from '@/lib/schedules/assignedRoomSchedule';
import {
  DEFAULT_SCHEDULE_CONTEXT,
  normalizeScheduleContext,
  type ScheduleAcademicYear,
  type ScheduleSemester,
} from '@/lib/schedules/scheduleContext';
import {
  addSchedule,
  deleteSchedule,
  getScheduleDisplayTitle,
  getSchedulesByRoomId,
  updateSchedule,
  type Schedule,
  type ScheduleInput,
} from '@/lib/schedules/schedules';

interface AssignedRoomScheduleSectionProps {
  className?: string;
  roleLabel: 'Faculty Professor' | 'Utility Staff';
  showLocationFilters?: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AssignedRoomScheduleSection({
  className = '',
  roleLabel,
  showLocationFilters = false,
}: Readonly<AssignedRoomScheduleSectionProps>) {
  const { firebaseUser, profile } = useAuth();
  const isUtilityStaff = normalizeRole(profile?.role) === USER_ROLES.UTILITY;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedRoomId, setSchedRoomId] = useState('');
  const [schedCourseName, setSchedCourseName] = useState('');
  const [schedSection, setSchedSection] = useState('');
  const [schedInstructor, setSchedInstructor] = useState('');
  const [schedProfessorEmail, setSchedProfessorEmail] = useState('');
  const [schedDay, setSchedDay] = useState(1);
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null);
  const [activeScheduleSemester, setActiveScheduleSemester] =
    useState<ScheduleSemester>(DEFAULT_SCHEDULE_CONTEXT.semester);
  const [activeScheduleAcademicYear, setActiveScheduleAcademicYear] =
    useState<ScheduleAcademicYear>(DEFAULT_SCHEDULE_CONTEXT.academicYear);

  const authorizedBuildingIds = useMemo(
    () => (isUtilityStaff ? getManagedBuildingIdsForCampus(profile?.campus) : []),
    [isUtilityStaff, profile?.campus]
  );
  const roomScopeKey = isUtilityStaff ? authorizedBuildingIds.join('|') : 'all';
  const buildingOptions = useMemo(() => {
    const buildings = new Map<string, { value: string; label: string }>();

    if (isUtilityStaff) {
      getManagedBuildingsForCampus(profile?.campus).forEach((building) => {
        buildings.set(building.id, {
          value: building.id,
          label: building.name,
        });
      });
    }

    rooms.forEach((room) => {
      if (!buildings.has(room.buildingId)) {
        buildings.set(room.buildingId, {
          value: room.buildingId,
          label: room.buildingName || room.buildingId,
        });
      }
    });

    return [...buildings.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { numeric: true })
    );
  }, [isUtilityStaff, profile?.campus, rooms]);
  const effectiveSelectedBuildingId = buildingOptions.some(
    (building) => building.value === selectedBuildingId
  )
    ? selectedBuildingId
    : buildingOptions[0]?.value ?? '';
  const floorOptions = useMemo<FloorOption[]>(() => {
    if (!showLocationFilters || !effectiveSelectedBuildingId) {
      return [];
    }

    const floors = new Set(
      rooms
        .filter((room) => room.buildingId === effectiveSelectedBuildingId)
        .map((room) => room.floor.trim())
        .filter(Boolean)
    );

    return sortFloorOptions(
      [...floors].map((floor) => ({ label: floor, value: floor }))
    );
  }, [effectiveSelectedBuildingId, rooms, showLocationFilters]);
  const effectiveSelectedFloor = floorOptions.some(
    (floor) => floor.value === selectedFloor
  )
    ? selectedFloor
    : floorOptions[0]?.value ?? '';
  const visibleRooms = useMemo(() => {
    if (!showLocationFilters) {
      return rooms;
    }

    return rooms.filter(
      (room) =>
        room.buildingId === effectiveSelectedBuildingId &&
        room.floor.trim() === effectiveSelectedFloor
    );
  }, [effectiveSelectedBuildingId, effectiveSelectedFloor, rooms, showLocationFilters]);
  const scheduleRooms = visibleRooms;
  const selectedRoom = scheduleRooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedRoomSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.roomId === selectedRoomId),
    [schedules, selectedRoomId]
  );

  useEffect(() => {
    if (!firebaseUser?.uid || (isUtilityStaff && roomScopeKey.length === 0)) {
      setRooms([]);
      setRoomsError(null);
      setRoomsLoading(false);
      return;
    }

    let cancelled = false;
    setRoomsLoading(true);
    setRoomsError(null);

    const handleRooms = (nextRooms: Room[]) => {
      if (cancelled) {
        return;
      }

      setRooms(nextRooms);
      setRoomsLoading(false);
    };
    const unsubscribe = isUtilityStaff
      ? onRoomsByBuildingIds(authorizedBuildingIds, handleRooms)
      : onAllRooms(handleRooms);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authorizedBuildingIds, firebaseUser?.uid, isUtilityStaff, roomScopeKey]);

  useEffect(() => {
    if (!showLocationFilters) {
      return;
    }

    if (!selectedBuildingId || !buildingOptions.some((building) => building.value === selectedBuildingId)) {
      setSelectedBuildingId(effectiveSelectedBuildingId);
    }
  }, [buildingOptions, effectiveSelectedBuildingId, selectedBuildingId, showLocationFilters]);

  useEffect(() => {
    if (!showLocationFilters) {
      return;
    }

    if (!floorOptions.some((floor) => floor.value === selectedFloor)) {
      setSelectedFloor(effectiveSelectedFloor);
    }
  }, [effectiveSelectedFloor, floorOptions, selectedFloor, showLocationFilters]);

  useEffect(() => {
    if (scheduleRooms.length === 0) {
      setSelectedRoomId('');
      return;
    }

    if (!scheduleRooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(scheduleRooms[0].id);
    }
  }, [scheduleRooms, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoom?.buildingId) {
      setActiveScheduleSemester(DEFAULT_SCHEDULE_CONTEXT.semester);
      setActiveScheduleAcademicYear(DEFAULT_SCHEDULE_CONTEXT.academicYear);
      return;
    }

    return onBuildingById(selectedRoom.buildingId, (building) => {
      const context = normalizeScheduleContext({
        academicYear: building?.activeScheduleAcademicYear,
        semester: building?.activeScheduleSemester,
      });
      setActiveScheduleSemester(context.semester);
      setActiveScheduleAcademicYear(context.academicYear);
    });
  }, [selectedRoom?.buildingId]);

  useEffect(() => {
    if (!firebaseUser?.uid || !selectedRoom) {
      setSchedules([]);
      setScheduleLoadError(null);
      setSchedulesLoading(false);
      return;
    }

    let cancelled = false;
    setSchedules([]);
    setSchedulesLoading(true);
    setScheduleLoadError(null);

    void getSchedulesByRoomId(selectedRoom.id)
      .then((nextSchedules) => {
        if (!cancelled) {
          setSchedules(nextSchedules);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setScheduleLoadError(
            getErrorMessage(error, 'Unable to load this room schedule.')
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSchedulesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeScheduleAcademicYear, activeScheduleSemester, firebaseUser?.uid, selectedRoom]);

  const resetScheduleForm = () => {
    setShowScheduleForm(false);
    setEditingScheduleId(null);
    setScheduleSaveError(null);
    setSchedRoomId(selectedRoomId);
    setSchedCourseName('');
    setSchedSection('');
    setSchedInstructor('');
    setSchedProfessorEmail('');
    setSchedDay(1);
    setSchedStart('');
    setSchedEnd('');
  };

  const handleAssignedRoomChange = (nextRoomId: string) => {
    resetScheduleForm();
    setSelectedRoomId(nextRoomId);
    setSchedRoomId(nextRoomId);
  };

  const handleBuildingChange = (nextBuildingId: string) => {
    setSelectedBuildingId(nextBuildingId);
    setSelectedFloor('');
    setSelectedRoomId('');
    resetScheduleForm();
  };

  const handleFloorChange = (nextFloor: string) => {
    setSelectedFloor(nextFloor);
    setSelectedRoomId('');
    resetScheduleForm();
  };

  const handleScheduleRoomChange = (nextRoomId: string) => {
    setSelectedRoomId(nextRoomId);
    setSchedRoomId(nextRoomId);
    setScheduleSaveError(null);
  };

  const handleToggleForm = () => {
    if (showScheduleForm) {
      resetScheduleForm();
      return;
    }

    setScheduleSaveError(null);
    setEditingScheduleId(null);
    setSchedRoomId(selectedRoomId);
    setShowScheduleForm(true);
  };

  const handleSaveSchedule = async (overrideScheduleIds: string[] = []) => {
    const room = scheduleRooms.find((nextRoom) => nextRoom.id === schedRoomId);
    if (
      !firebaseUser?.uid ||
      !room ||
      !schedCourseName.trim() ||
      !schedSection.trim() ||
      !schedInstructor.trim() ||
      !/^[^\s@]+@sdca\.edu\.ph$/i.test(schedProfessorEmail.trim()) ||
      !schedStart ||
      !schedEnd
    ) {
      return;
    }

    setAddingSchedule(true);
    setScheduleSaveError(null);

    try {
      const courseName = schedCourseName.trim();
      const section = schedSection.trim();
      const scheduleFields = {
        buildingId: room.buildingId,
        courseCode: courseName,
        courseName,
        dayOfWeek: schedDay,
        endTime: schedEnd,
        instructorName: schedInstructor.trim(),
        professorEmail: schedProfessorEmail.trim().toLowerCase(),
        roomId: room.id,
        roomName: room.name,
        section,
        startTime: schedStart,
        subjectName: getScheduleDisplayTitle({
          courseCode: courseName,
          section,
          subjectName: courseName,
        }),
      };

      if (editingScheduleId) {
        await updateSchedule(editingScheduleId, scheduleFields, overrideScheduleIds);
      } else {
        const data: ScheduleInput = {
          ...scheduleFields,
          academicYear: activeScheduleAcademicYear,
          createdBy: firebaseUser.uid,
          semester: activeScheduleSemester,
        };
        await addSchedule(data, overrideScheduleIds);
      }

      resetScheduleForm();
      setSchedules(await getSchedulesByRoomId(room.id));
    } catch (error: unknown) {
      setScheduleSaveError(getErrorMessage(error, 'Failed to save schedule.'));
    } finally {
      setAddingSchedule(false);
    }
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setSelectedRoomId(schedule.roomId);
    setEditingScheduleId(schedule.id);
    setSchedRoomId(schedule.roomId);
    setSchedCourseName(schedule.courseName ?? schedule.subjectName);
    setSchedSection(schedule.section ?? '');
    setSchedInstructor(schedule.instructorName);
    setSchedProfessorEmail(schedule.professorEmail ?? '');
    setSchedDay(schedule.dayOfWeek);
    setSchedStart(schedule.startTime);
    setSchedEnd(schedule.endTime);
    setScheduleSaveError(null);
    setShowScheduleForm(true);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      await deleteSchedule(scheduleId);
      resetScheduleForm();
      if (selectedRoom) {
        setSchedules(await getSchedulesByRoomId(selectedRoom.id));
      }
    } catch (error: unknown) {
      setScheduleSaveError(getErrorMessage(error, 'Failed to delete schedule.'));
      throw error;
    }
  };

  if (profile?.status?.trim().toLowerCase() !== 'approved') {
    return (
      <section className={`rounded-2xl border border-white/35 bg-white/75 p-6 shadow-xl ${className}`}>
        <h3 className="text-lg font-bold text-gray-900">Class Schedules</h3>
        <p className="mt-2 text-sm text-gray-500">
          Schedule management is available after your account is approved.
        </p>
      </section>
    );
  }

  if (!roomsLoading && isUtilityStaff && roomScopeKey.length === 0) {
    return (
      <section className={`dashboard-empty-state rounded-2xl p-8 text-center ${className}`}>
        <h3 className="text-lg font-bold text-gray-900">Class Schedules</h3>
        <p className="mt-2 text-sm text-gray-500">
          No campus has been assigned to your account yet.
        </p>
      </section>
    );
  }

  return (
    <section className={`space-y-4 ${className}`}>
      <div className="rounded-2xl border border-white/35 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              {isUtilityStaff
                ? `${roleLabel} schedule viewer`
                : `${roleLabel} schedule management`}
            </p>
            <h3 className="mt-1 text-xl font-bold text-gray-900">
              {isUtilityStaff ? 'Authorized Rooms' : 'Available Rooms'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {isUtilityStaff
                ? 'View class schedules for rooms in your authorized campus buildings.'
                : 'Manage class schedules for available rooms.'}
            </p>
          </div>
          {showLocationFilters ? (
            <div className="grid w-full gap-3 sm:max-w-2xl sm:grid-cols-3">
              <AdminBuildingSelect
                label="Building"
                options={buildingOptions}
                value={effectiveSelectedBuildingId}
                onChange={handleBuildingChange}
                disabled={roomsLoading || buildingOptions.length === 0}
                fullWidth
              />
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                  Floor
                </label>
                <select
                  aria-label="Schedule floor"
                  value={effectiveSelectedFloor}
                  onChange={(event) => handleFloorChange(event.target.value)}
                  disabled={roomsLoading || floorOptions.length === 0}
                  className="glass-input w-full px-4 py-2.5 text-sm"
                >
                  {floorOptions.map((floor) => (
                    <option key={floor.value} value={floor.value}>
                      {floor.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500"
                  htmlFor="assigned-schedule-room"
                >
                  Room
                </label>
                <select
                  id="assigned-schedule-room"
                  aria-label="Assigned schedule room"
                  value={selectedRoomId}
                  onChange={(event) => handleAssignedRoomChange(event.target.value)}
                  disabled={roomsLoading || scheduleRooms.length === 0}
                  className="glass-input w-full px-4 py-2.5 text-sm"
                >
                  {scheduleRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {getAssignedRoomDisplayLabel(room)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="w-full sm:max-w-sm">
              <label
                className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500"
                htmlFor="assigned-schedule-room"
              >
                Room
              </label>
              <select
                id="assigned-schedule-room"
                aria-label="Assigned schedule room"
                value={selectedRoomId}
                onChange={(event) => handleAssignedRoomChange(event.target.value)}
                disabled={roomsLoading || scheduleRooms.length === 0}
                className="glass-input w-full px-4 py-2.5 text-sm"
              >
                {scheduleRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {getAssignedRoomDisplayLabel(room)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {roomsError ? <p className="mt-4 text-sm font-medium text-red-700">{roomsError}</p> : null}
        {scheduleLoadError ? (
          <p className="mt-4 text-sm font-medium text-red-700">{scheduleLoadError}</p>
        ) : null}
        {schedulesLoading ? (
          <p className="mt-4 text-sm text-gray-500" role="status">
            Loading schedules...
          </p>
        ) : null}
        {selectedRoom ? (
          <p className="mt-4 text-xs text-gray-500">
            {selectedRoom.name} · {selectedRoom.buildingName} · {selectedRoom.floor} ·{' '}
            {activeScheduleAcademicYear} ({activeScheduleSemester})
          </p>
        ) : null}
      </div>

      {scheduleRooms.length > 0 ? (
        <AdminClassSchedulesSection
          schedules={selectedRoomSchedules}
          allSchedules={selectedRoomSchedules}
          rooms={scheduleRooms}
          readOnly={isUtilityStaff}
          showScheduleForm={showScheduleForm}
          schedRoomId={schedRoomId}
          schedCourseName={schedCourseName}
          schedSection={schedSection}
          schedInstructor={schedInstructor}
          schedProfessorEmail={schedProfessorEmail}
          schedDay={schedDay}
          schedStart={schedStart}
          schedEnd={schedEnd}
          addingSchedule={addingSchedule}
          editingScheduleId={editingScheduleId}
          onToggleForm={handleToggleForm}
          onSchedRoomIdChange={handleScheduleRoomChange}
          onSchedCourseNameChange={setSchedCourseName}
          onSchedSectionChange={setSchedSection}
          onSchedInstructorChange={setSchedInstructor}
          onSchedProfessorEmailChange={setSchedProfessorEmail}
          onSchedDayChange={setSchedDay}
          onSchedStartChange={setSchedStart}
          onSchedEndChange={setSchedEnd}
          scheduleSaveError={scheduleSaveError}
          onClearScheduleSaveError={() => setScheduleSaveError(null)}
          onSaveSchedule={handleSaveSchedule}
          onEditSchedule={handleEditSchedule}
          onDeleteSchedule={handleDeleteSchedule}
          selectedRoomId={selectedRoomId}
          selectedRoomName={selectedRoom?.name ?? 'this room'}
          roomScheduleCount={selectedRoomSchedules.length}
          onClearRoomSchedules={async () => {}}
          buildingId={selectedRoom?.buildingId ?? ''}
          currentUserId={firebaseUser?.uid}
          activeScheduleSemester={activeScheduleSemester}
          activeScheduleAcademicYear={activeScheduleAcademicYear}
          campus={
            selectedRoom
              ? inferCampusFromBuilding({
                  id: selectedRoom.buildingId,
                  name: selectedRoom.buildingName,
                })
              : null
          }
          enableExcelImport={false}
          enableClearRoom={false}
        />
      ) : null}
    </section>
  );
}
