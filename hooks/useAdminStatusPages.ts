'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import {
  onBuildingById,
  updateBuildingScheduleContext,
} from '@/lib/buildings/buildings';
import { getManagedBuildingsForCampus } from '@/lib/buildings/campusAssignments';
import { getFloorDisplayLabel } from '@/lib/buildings/floorLabels';
import {
  ADMIN_RESERVATION_HEARTBEAT_TIMEOUT_MS,
  isRoomReservationHeartbeatHealthy,
  normalizeRoomCheckInMethod,
} from '@/lib/rooms/roomStatus';
import {
  Schedule,
  ScheduleInput,
  addSchedule,
  deleteSchedule,
  getScheduleDisplayTitle,
  isRoomInClass,
  onSchedulesByBuilding,
  onSchedulesByBuildingRoomIds,
  updateSchedule,
  DAY_NAMES,
} from '@/lib/schedules/schedules';
import {
  findScheduleConflicts,
  SCHEDULE_CONFLICT_MESSAGE,
} from '@/lib/schedules/scheduleConflicts';
import {
  DEFAULT_SCHEDULE_CONTEXT,
  normalizeScheduleContext,
  type ScheduleAcademicYear,
  type ScheduleSemester,
} from '@/lib/schedules/scheduleContext';
import { validateScheduleTimes } from '@/lib/schedules/scheduleTimeRules';
import {
  confirmFinishedReservation,
  onReservationsByBuilding,
  Reservation,
} from '@/lib/reservations/reservations';
import { onRoomsByBuilding, Room, updateRoomStatus } from '@/lib/rooms/rooms';

function getManagedBuildingDisplayLabel(input: {
  id?: string | null;
  name?: string | null;
}) {
  const searchValue = `${input.id ?? ''} ${input.name ?? ''}`.toLowerCase();

  if (
    searchValue.includes('sdca digital campus') ||
    searchValue.includes('sdca-digital-campus')
  ) {
    return 'Digital Campus';
  }

  if (/\bgd[\s-]?1\b/.test(searchValue)) {
    return 'GD1';
  }

  if (/\bgd[\s-]?2\b/.test(searchValue)) {
    return 'GD2';
  }

  if (/\bgd[\s-]?3\b/.test(searchValue)) {
    return 'GD3';
  }

  return input.name?.trim() || input.id?.trim() || 'Assigned Building';
}

export function getManagedBuildingOptionLabel(building: {
  id: string;
  name: string;
}) {
  const displayLabel = getManagedBuildingDisplayLabel(building);
  return displayLabel === building.name
    ? displayLabel
    : `${displayLabel} - ${building.name}`;
}

interface UseAdminStatusPagesOptions {
  campusOverride?: 'main' | 'digi';
  scheduleSelectionRequired?: boolean;
  selectedScheduleFloor?: string;
  selectedScheduleRoom?: string;
}

function getRoomScheduleFilterValue(room: Room) {
  return room.name.trim() || room.id;
}

function getStoredRoomFloor(room: Room) {
  return room.floor;
}

export function useAdminStatusPages(options: UseAdminStatusPagesOptions = {}) {
  const {
    campusOverride,
    scheduleSelectionRequired = false,
    selectedScheduleFloor = '',
    selectedScheduleRoom = '',
  } = options;
  const { firebaseUser, profile } = useAuth();
  const { selectedBuildingId, setSelectedBuildingId } = useAdminTab();
  const managedCampus = campusOverride ?? profile?.campus;
  const managedBuildings = useMemo(
    () => getManagedBuildingsForCampus(managedCampus),
    [managedCampus]
  );

  const effectiveManagedBuildingId = managedBuildings.some(
    (building) => building.id === selectedBuildingId
  )
    ? selectedBuildingId
    : managedBuildings[0]?.id ?? '';
  const selectedManagedBuilding =
    managedBuildings.find((building) => building.id === effectiveManagedBuildingId) ??
    managedBuildings[0];
  const buildingId = selectedManagedBuilding?.id;
  const buildingName = selectedManagedBuilding?.name;
  const activeBuildingLabel = getManagedBuildingDisplayLabel({
    id: buildingId,
    name: buildingName,
  });
  const [activeScheduleSemester, setActiveScheduleSemester] =
    useState<ScheduleSemester>(DEFAULT_SCHEDULE_CONTEXT.semester);
  const [activeScheduleAcademicYear, setActiveScheduleAcademicYear] =
    useState<ScheduleAcademicYear>(DEFAULT_SCHEDULE_CONTEXT.academicYear);
  const [switchingScheduleContext, setSwitchingScheduleContext] = useState(false);
  const activeScheduleContext = {
    academicYear: activeScheduleAcademicYear,
    semester: activeScheduleSemester,
  };

  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedRoomId, setSchedRoomId] = useState('');
  const [schedCourseName, setSchedCourseName] = useState('');
  const [schedCourseCode, setSchedCourseCode] = useState('');
  const [schedSection, setSchedSection] = useState('');
  const [schedInstructor, setSchedInstructor] = useState('');
  const [schedDay, setSchedDay] = useState<number>(1);
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null);
  const selectedScheduleFloorValue = selectedScheduleFloor;
  const normalizedSelectedScheduleRoom = selectedScheduleRoom.trim();
  const selectedScheduleRoomIds = useMemo(() => {
    if (!scheduleSelectionRequired) {
      return null;
    }

    if (normalizedSelectedScheduleRoom && selectedScheduleFloorValue) {
      return rooms
        .filter(
          (room) =>
            room.buildingId === buildingId &&
            getStoredRoomFloor(room) === selectedScheduleFloorValue &&
            (room.id === normalizedSelectedScheduleRoom ||
              getRoomScheduleFilterValue(room) === normalizedSelectedScheduleRoom)
        )
        .map((room) => room.id);
    }

    if (selectedScheduleFloorValue) {
      return rooms
        .filter(
          (room) =>
            room.buildingId === buildingId &&
            getStoredRoomFloor(room) === selectedScheduleFloorValue
        )
        .map((room) => room.id);
    }

    return [];
  }, [
    selectedScheduleFloorValue,
    normalizedSelectedScheduleRoom,
    buildingId,
    rooms,
    scheduleSelectionRequired,
  ]);

  // Stable string key so the schedule subscription only restarts when the
  // actual set of room IDs changes, not on every Firestore rooms snapshot
  // (which always produces a new array reference).
  const selectedScheduleRoomKey = selectedScheduleRoomIds
    ? [...selectedScheduleRoomIds].sort().join(',')
    : null;

  useEffect(() => {
    if (!buildingId || !firebaseUser?.uid) {
      setAllReservations([]);
      setRooms([]);
      return;
    }

    let cancelled = false;

    const unsubAllReservations = onReservationsByBuilding(
      buildingId,
      (nextReservations) => {
        if (cancelled) return;
        setAllReservations(nextReservations);
      }
    );
    const unsubRooms = onRoomsByBuilding(buildingId, (nextRooms) => {
      if (cancelled) return;
      setRooms(nextRooms);
    });

    return () => {
      cancelled = true;
      unsubAllReservations();
      unsubRooms();
    };
  }, [buildingId, firebaseUser?.uid]);

  useEffect(() => {
    if (!buildingId || !firebaseUser?.uid) {
      const fallbackContext = normalizeScheduleContext();
      setActiveScheduleSemester(fallbackContext.semester);
      setActiveScheduleAcademicYear(fallbackContext.academicYear);
      return;
    }

    let cancelled = false;
    const unsubscribe = onBuildingById(buildingId, (building) => {
      if (cancelled) {
        return;
      }

      const nextContext = normalizeScheduleContext({
        academicYear: building?.activeScheduleAcademicYear,
        semester: building?.activeScheduleSemester,
      });
      setActiveScheduleSemester(nextContext.semester);
      setActiveScheduleAcademicYear(nextContext.academicYear);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [buildingId, firebaseUser?.uid]);

  useEffect(() => {
    if (!buildingId || !firebaseUser?.uid) {
      setSchedules([]);
      return;
    }

    if (scheduleSelectionRequired) {
      const hasScheduleSelection =
        Boolean(selectedScheduleFloorValue) ||
        Boolean(normalizedSelectedScheduleRoom);

      console.log('[schedules effect]', {
        selectedScheduleFloorValue,
        normalizedSelectedScheduleRoom,
        selectedScheduleRoomIds,
        selectedScheduleRoomKey,
        hasScheduleSelection,
        roomsLoaded: rooms.length,
      });

      if (!hasScheduleSelection || !selectedScheduleRoomIds?.length) {
        setSchedules([]);
        return;
      }

      // ── DEBUG: trace room-ID resolution ───────────────────────────────────
      console.group('[DEBUG] Schedule subscription starting');
      console.log('1. Context', {
        buildingId,
        selectedScheduleFloorValue,
        normalizedSelectedScheduleRoom,
      });
      console.log('2. Rooms loaded from Firestore (this building)', rooms.map((r) => ({
        id: r.id,
        name: r.name,
        floor: r.floor,
        buildingId: r.buildingId,
      })));
      console.log('3. Resolved selectedScheduleRoomIds (passed to Firestore query)',
        selectedScheduleRoomIds,
      );
      console.groupEnd();
      // ─────────────────────────────────────────────────────────────────────

      let cancelled = false;
      const unsubscribe = onSchedulesByBuildingRoomIds(
        buildingId,
        selectedScheduleRoomIds,
        activeScheduleContext,
        (nextSchedules) => {
          console.log('[schedules] onSchedulesByBuildingRoomIds callback', {
            buildingId,
            roomIds: selectedScheduleRoomIds,
            count: nextSchedules.length,
          });
          if (cancelled) return;
          setSchedules(nextSchedules);
        }
      );

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    let cancelled = false;
    const unsubscribe = onSchedulesByBuilding(buildingId, activeScheduleContext, (nextSchedules) => {
      if (cancelled) return;
      setSchedules(nextSchedules);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    buildingId,
    firebaseUser?.uid,
    selectedScheduleFloorValue,
    normalizedSelectedScheduleRoom,
    scheduleSelectionRequired,
    selectedScheduleRoomKey,
    activeScheduleAcademicYear,
    activeScheduleSemester,
  ]);

  const resetScheduleForm = () => {
    setShowScheduleForm(false);
    setEditingScheduleId(null);
    setScheduleSaveError(null);
    setSchedRoomId('');
    setSchedCourseName('');
    setSchedCourseCode('');
    setSchedSection('');
    setSchedInstructor('');
    setSchedDay(1);
    setSchedStart('');
    setSchedEnd('');
  };

  const toggleScheduleForm = () => {
    if (showScheduleForm) {
      resetScheduleForm();
      return;
    }

    setShowScheduleForm(true);
  };

  const handleStatusChange = async (roomId: string, status: Room['status']) => {
    try {
      await updateRoomStatus(roomId, status);
    } catch (error) {
      console.warn('Failed to update status:', error);
      alert('Failed to update room status. Check the console for details.');
    }
  };

  const pendingFinishReservationsByRoomId = useMemo(() => {
    const nextMap = new Map<string, Reservation>();

    allReservations.forEach((reservation) => {
      if (
        reservation.status !== 'completed' ||
        !reservation.checkedInAt ||
        reservation.occupancyReleasedAt
      ) {
        return;
      }

      const existingReservation = nextMap.get(reservation.roomId);
      if (
        !existingReservation ||
        (reservation.updatedAt?.seconds ?? 0) >
          (existingReservation.updatedAt?.seconds ?? 0)
      ) {
        nextMap.set(reservation.roomId, reservation);
      }
    });

    return nextMap;
  }, [allReservations]);

  const handleConfirmFinishedReservation = async (reservationId: string) => {
    try {
      await confirmFinishedReservation(reservationId);
    } catch (error) {
      console.warn('Failed to confirm finished reservation:', error);
      alert('Failed to confirm the finished reservation. Check the console for details.');
    }
  };

  const handleSaveSchedule = async () => {
    if (
      !buildingId ||
      !schedRoomId ||
      !schedCourseName.trim() ||
      !schedCourseCode.trim() ||
      !schedSection.trim() ||
      !schedInstructor.trim() ||
      !schedStart ||
      !schedEnd
    ) {
      return;
    }

    // Client-side campus time validation (defence-in-depth before API call)
    const timeError = validateScheduleTimes(schedStart, schedEnd, managedCampus ?? null);
    if (timeError) {
      setScheduleSaveError(timeError);
      return;
    }

    const conflictingSchedules = findScheduleConflicts(
      schedules,
      {
        dayOfWeek: schedDay,
        endTime: schedEnd,
        roomId: schedRoomId,
        startTime: schedStart,
      },
      { excludeScheduleId: editingScheduleId }
    );

    if (conflictingSchedules.length > 0) {
      setScheduleSaveError(SCHEDULE_CONFLICT_MESSAGE);
      return;
    }

    setScheduleSaveError(null);
    setAddingSchedule(true);

    try {
      const room = rooms.find((nextRoom) => nextRoom.id === schedRoomId);

      if (editingScheduleId) {
        await updateSchedule(editingScheduleId, {
          roomId: schedRoomId,
          roomName: room?.name || '',
          subjectName: getScheduleDisplayTitle({
            courseCode: schedCourseCode.trim(),
            section: schedSection.trim(),
            subjectName: schedCourseName.trim(),
          }),
          courseName: schedCourseName.trim(),
          courseCode: schedCourseCode.trim(),
          section: schedSection.trim(),
          instructorName: schedInstructor.trim(),
          dayOfWeek: schedDay,
          startTime: schedStart,
          endTime: schedEnd,
        });
      } else {
        const data: ScheduleInput = {
          roomId: schedRoomId,
          roomName: room?.name || '',
          buildingId,
          subjectName: getScheduleDisplayTitle({
            courseCode: schedCourseCode.trim(),
            section: schedSection.trim(),
            subjectName: schedCourseName.trim(),
          }),
          courseName: schedCourseName.trim(),
          courseCode: schedCourseCode.trim(),
          section: schedSection.trim(),
          instructorName: schedInstructor.trim(),
          dayOfWeek: schedDay,
          startTime: schedStart,
          endTime: schedEnd,
          semester: activeScheduleSemester,
          academicYear: activeScheduleAcademicYear,
          createdBy: firebaseUser?.uid || '',
        };

        await addSchedule(data);
      }

      resetScheduleForm();
    } catch (error) {
      console.warn('Failed to save schedule:', error);
      setScheduleSaveError(
        error instanceof Error
          ? error.message
          : 'Failed to save schedule. Check the console for details.'
      );
    } finally {
      setAddingSchedule(false);
    }
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setScheduleSaveError(null);
    setEditingScheduleId(schedule.id);
    setSchedRoomId(schedule.roomId);
    setSchedCourseName(schedule.courseName ?? schedule.subjectName);
    setSchedCourseCode(schedule.courseCode ?? '');
    setSchedSection(schedule.section ?? '');
    setSchedInstructor(schedule.instructorName);
    setSchedDay(schedule.dayOfWeek);
    setSchedStart(schedule.startTime);
    setSchedEnd(schedule.endTime);
    setShowScheduleForm(true);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      await deleteSchedule(scheduleId);
    } catch (error) {
      console.warn('Failed to delete schedule:', error);
      alert('Failed to delete schedule. Please try again.');
      return;
    }

    resetScheduleForm();
  };

  const handleSwitchScheduleContext = async (input: {
    academicYear: ScheduleAcademicYear;
    semester: ScheduleSemester;
  }) => {
    if (!buildingId) {
      return;
    }

    setSwitchingScheduleContext(true);
    try {
      await updateBuildingScheduleContext(buildingId, input);
    } finally {
      setSwitchingScheduleContext(false);
    }
  };

  const computeEffectiveStatus = (
    room: Room
  ): { status: string; detail: string } => {
    const now = new Date();
    const heartbeatHealthy = isRoomReservationHeartbeatHealthy(
      room,
      ADMIN_RESERVATION_HEARTBEAT_TIMEOUT_MS,
      now
    );
    const pendingFinishReservation =
      pendingFinishReservationsByRoomId.get(room.id) ?? null;

    if (room.status === 'Unavailable') {
      return {
        status: 'Unavailable',
        detail: 'Manual override'
      };
    }

    if (room.status === 'Occupied') {
      if (
        normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth' &&
        !heartbeatHealthy
      ) {
        return {
          status: 'Available',
          detail: 'Bluetooth beacon disconnected'
        };
      }

      return {
        status: 'Occupied',
        detail:
          pendingFinishReservation
            ? `Completed by ${pendingFinishReservation.userName}; waiting for staff confirmation`
            : normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth'
              ? 'Bluetooth beacon connected'
              : 'Checked in',
      };
    }

    if (room.status === 'Reserved') {
      return {
        status: 'Reserved',
        detail: 'Reserved'
      };
    }

    const activeClass = isRoomInClass(schedules, room.id);
    if (activeClass) {
      return {
        status: 'Reserved',
        detail: `Class: ${getScheduleDisplayTitle(activeClass)}`
      };
    }

    const today = now.toISOString().split('T')[0];
    const currentTime =
      now.getHours().toString().padStart(2, '0') +
      ':' +
      now.getMinutes().toString().padStart(2, '0');
    const activeReservation = allReservations.find(
      (reservation) =>
        reservation.roomId === room.id &&
        reservation.status === 'approved' &&
        reservation.date === today &&
        reservation.startTime <= currentTime &&
        reservation.endTime > currentTime
    );

    if (activeReservation) {
      const activeCheckInMethod = normalizeRoomCheckInMethod(
        activeReservation.checkInMethod ?? room.checkInMethod
      );

      if (
        activeReservation.checkedInAt &&
        activeCheckInMethod === 'bluetooth' &&
        !heartbeatHealthy
      ) {
        return {
          status: 'Available',
          detail: 'Bluetooth beacon disconnected'
        };
      }

      return activeReservation.checkedInAt
        ? {
          status: 'Occupied',
          detail: `Checked in: ${activeReservation.userName}`
        }
        : {
          status: 'Reserved',
          detail: `Reserved: ${activeReservation.userName}`
        };
    }

    return {
      status: 'Available',
      detail: ''
    };
  };

  const uniqueFloors = useMemo(
    () =>
      Array.from(new Set(rooms.map((room) => room.floor))).sort((left, right) => {
        const floorOrder = (floor: string) => {
          if (floor.toLowerCase().includes('ground')) {
            return 0;
          }

          const match = floor.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 999;
        };

        return floorOrder(left) - floorOrder(right);
      }),
    [rooms]
  );

  const statusMonitorFloorGroups = useMemo(() => {
    const roomsByFloor = new Map<string, Room[]>();

    rooms.forEach((room) => {
      const floorRooms = roomsByFloor.get(room.floor) ?? [];
      floorRooms.push(room);
      roomsByFloor.set(room.floor, floorRooms);
    });

    return uniqueFloors
      .map((floor) => ({
        floor,
        label: getFloorDisplayLabel(floor, {
          id: buildingId,
          name: buildingName,
        }),
        rooms: roomsByFloor.get(floor) ?? [],
      }))
      .filter((floorGroup) => floorGroup.rooms.length > 0);
  }, [buildingId, buildingName, rooms, uniqueFloors]);

  const scheduleCountsByDay = useMemo(
    () =>
      DAY_NAMES.map((_, dayIndex) =>
        schedules.filter((schedule) => schedule.dayOfWeek === dayIndex)
      ),
    [schedules]
  );

  return {
    managedBuildings,
    buildingId,
    buildingName,
    activeBuildingLabel,
    campus: managedCampus ?? null,
    activeScheduleSemester,
    activeScheduleAcademicYear,
    switchingScheduleContext,
    selectedBuildingId: effectiveManagedBuildingId,
    setSelectedBuildingId,
    allReservations,
    rooms,
    schedules,
    showScheduleForm,
    schedRoomId,
    setSchedRoomId,
    schedCourseName,
    setSchedCourseName,
    schedCourseCode,
    setSchedCourseCode,
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
    statusMonitorFloorGroups,
    scheduleCountsByDay,
    toggleScheduleForm,
    resetScheduleForm,
    clearScheduleSaveError: () => setScheduleSaveError(null),
    handleStatusChange,
    handleSaveSchedule,
    handleEditSchedule,
    handleDeleteSchedule,
    handleSwitchScheduleContext,
    computeEffectiveStatus,
    pendingFinishReservationsByRoomId,
    handleConfirmFinishedReservation,
  };
}
