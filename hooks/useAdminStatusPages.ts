'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import { getManagedBuildingsForCampus } from '@/lib/campusAssignments';
import { normalizeRoomCheckInMethod } from '@/lib/roomStatus';
import {
  Schedule,
  ScheduleInput,
  addSchedule,
  deleteSchedule,
  isRoomInClass,
  onSchedulesByBuilding,
  updateSchedule,
  DAY_NAMES,
} from '@/lib/schedules';
import { onReservationsByBuilding, Reservation } from '@/lib/reservations';
import { onRoomsByBuilding, Room, updateRoomStatus } from '@/lib/rooms';

function getManagedBuildingDisplayLabel(input: {
  id?: string | null;
  name?: string | null;
}) {
  const searchValue = `${input.id ?? ''} ${input.name ?? ''}`.toLowerCase();

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

export function useAdminStatusPages() {
  const { firebaseUser, profile } = useAuth();
  const { selectedBuildingId, setSelectedBuildingId } = useAdminTab();
  const managedBuildings = useMemo(
    () => getManagedBuildingsForCampus(profile?.campus),
    [profile?.campus]
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

  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedRoomId, setSchedRoomId] = useState('');
  const [schedSubject, setSchedSubject] = useState('');
  const [schedInstructor, setSchedInstructor] = useState('');
  const [schedDay, setSchedDay] = useState<number>(1);
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  useEffect(() => {
    if (!buildingId || !firebaseUser?.uid) {
      setAllReservations([]);
      setRooms([]);
      setSchedules([]);
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
    const unsubSchedules = onSchedulesByBuilding(buildingId, (nextSchedules) => {
      if (cancelled) return;
      setSchedules(nextSchedules);
    });

    return () => {
      cancelled = true;
      unsubAllReservations();
      unsubRooms();
      unsubSchedules();
    };
  }, [buildingId, firebaseUser?.uid]);

  const resetScheduleForm = () => {
    setShowScheduleForm(false);
    setEditingScheduleId(null);
    setSchedRoomId('');
    setSchedSubject('');
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
    } catch (err) {
      console.warn('Failed to update status:', err);
      alert('Failed to update room status. Check the console for details.');
    }
  };

  const handleSaveSchedule = async () => {
    if (
      !buildingId ||
      !schedRoomId ||
      !schedSubject.trim() ||
      !schedInstructor.trim() ||
      !schedStart ||
      !schedEnd
    ) {
      return;
    }

    setAddingSchedule(true);

    try {
      const room = rooms.find((nextRoom) => nextRoom.id === schedRoomId);

      if (editingScheduleId) {
        await updateSchedule(editingScheduleId, {
          roomId: schedRoomId,
          roomName: room?.name || '',
          subjectName: schedSubject.trim(),
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
          subjectName: schedSubject.trim(),
          instructorName: schedInstructor.trim(),
          dayOfWeek: schedDay,
          startTime: schedStart,
          endTime: schedEnd,
          createdBy: firebaseUser?.uid || '',
        };

        await addSchedule(data);
      }

      resetScheduleForm();
    } catch (err) {
      console.warn('Failed to save schedule:', err);
      alert('Failed to save schedule. Check the console for details.');
    } finally {
      setAddingSchedule(false);
    }
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    setSchedRoomId(schedule.roomId);
    setSchedSubject(schedule.subjectName);
    setSchedInstructor(schedule.instructorName);
    setSchedDay(schedule.dayOfWeek);
    setSchedStart(schedule.startTime);
    setSchedEnd(schedule.endTime);
    setShowScheduleForm(true);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Delete this schedule?')) {
      return;
    }

    try {
      await deleteSchedule(scheduleId);
    } catch (err) {
      console.warn('Failed to delete schedule:', err);
    }
  };

  const computeEffectiveStatus = (
    room: Room
  ): { status: string; detail: string } => {
    if (room.status === 'Unavailable') {
      return { status: 'Unavailable', detail: 'Manual override' };
    }

    if (room.status === 'Occupied') {
      if (
        normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth' &&
        room.beaconConnected === false
      ) {
        return { status: 'Available', detail: 'Bluetooth beacon disconnected' };
      }

      return {
        status: 'Occupied',
        detail:
          normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth'
            ? 'Bluetooth beacon connected'
            : 'Checked in',
      };
    }

    if (room.status === 'Reserved') {
      return { status: 'Reserved', detail: 'Reserved' };
    }

    const activeClass = isRoomInClass(schedules, room.id);
    if (activeClass) {
      return { status: 'Reserved', detail: `Class: ${activeClass.subjectName}` };
    }

    const now = new Date();
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
        room.beaconConnected === false
      ) {
        return { status: 'Available', detail: 'Bluetooth beacon disconnected' };
      }

      return activeReservation.checkedInAt
        ? { status: 'Occupied', detail: `Checked in: ${activeReservation.userName}` }
        : { status: 'Reserved', detail: `Reserved: ${activeReservation.userName}` };
    }

    return { status: 'Available', detail: '' };
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
        rooms: roomsByFloor.get(floor) ?? [],
      }))
      .filter((floorGroup) => floorGroup.rooms.length > 0);
  }, [rooms, uniqueFloors]);

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
    selectedBuildingId: effectiveManagedBuildingId,
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
    statusMonitorFloorGroups,
    scheduleCountsByDay,
    toggleScheduleForm,
    resetScheduleForm,
    handleStatusChange,
    handleSaveSchedule,
    handleEditSchedule,
    handleDeleteSchedule,
    computeEffectiveStatus,
  };
}
