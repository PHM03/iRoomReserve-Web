import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import type { AdminTab } from '@/components/NavBar';
import { getManagedBuildingsForCampus } from '@/lib/campusAssignments';
import {
  onPendingReservationsByBuilding,
  onReservationsByBuilding,
  approveReservation,
  rejectReservation,
  Reservation,
} from '@/lib/reservations';
import {
  onUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  Notification,
} from '@/lib/notifications';
import {
  Room,
  RoomInput,
  addRoom,
  updateRoom,
  deleteRoom,
  updateRoomStatus,
  onRoomsByBuilding,
} from '@/lib/rooms';
import {
  Feedback,
  onFeedbackByBuilding,
  respondToFeedback,
} from '@/lib/feedback';
import { getBuildingById } from '@/lib/buildings';
import {
  Schedule,
  ScheduleInput,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  onSchedulesByBuilding,
  isRoomInClass,
} from '@/lib/schedules';
import {
  RoomHistoryEntry,
  onRoomHistoryByBuilding,
} from '@/lib/roomHistory';
import {
  AdminRequest,
  onAdminRequestsByBuilding,
  respondToAdminRequest,
} from '@/lib/adminRequests';

interface UseAdminDashboardOptions {
  activeTab: AdminTab;
}

export function useAdminDashboard({ activeTab }: UseAdminDashboardOptions) {
  const { firebaseUser, profile } = useAuth();
  const { setActiveTab } = useAdminTab();
  const managedBuildings = getManagedBuildingsForCampus(profile?.campus);
  const buildingId = managedBuildings[0]?.id;
  const buildingName = managedBuildings[0]?.name;

  const [requests, setRequests] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [addRoomStep, setAddRoomStep] = useState(0);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState('');
  const [newRoomType, setNewRoomType] = useState('');
  const [newRoomAcStatus, setNewRoomAcStatus] = useState('');
  const [newRoomTvStatus, setNewRoomTvStatus] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);
  const [buildingFloors, setBuildingFloors] = useState(0);

  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editCapacity, setEditCapacity] = useState('');

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const [roomSearch, setRoomSearch] = useState('');
  const [roomFloorFilter, setRoomFloorFilter] = useState<string>('all');

  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all');

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [roomHistory, setRoomHistory] = useState<RoomHistoryEntry[]>([]);

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedRoomId, setSchedRoomId] = useState('');
  const [schedSubject, setSchedSubject] = useState('');
  const [schedInstructor, setSchedInstructor] = useState('');
  const [schedDay, setSchedDay] = useState<number>(1);
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'open' | 'responded' | 'closed'>('all');
  const [inboxReplyingTo, setInboxReplyingTo] = useState<string | null>(null);
  const [inboxReplyText, setInboxReplyText] = useState('');
  const [inboxSubmitting, setInboxSubmitting] = useState(false);
  const [inboxExpandedId, setInboxExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!buildingId || !firebaseUser?.uid) return;

    let cancelled = false;

    const unsubReservations = onPendingReservationsByBuilding(buildingId, (nextRequests) => {
      if (cancelled) return;
      setRequests(nextRequests);
    });
    const unsubAllReservations = onReservationsByBuilding(buildingId, (nextReservations) => {
      if (cancelled) return;
      setAllReservations(nextReservations);
    });
    const unsubRooms = onRoomsByBuilding(buildingId, (nextRooms) => {
      if (cancelled) return;
      setRooms(nextRooms);
    });
    const unsubFeedback = onFeedbackByBuilding(buildingId, (nextFeedback) => {
      if (cancelled) return;
      setFeedbackList(nextFeedback);
    });
    const unsubNotifs = onUnreadNotifications(firebaseUser.uid, (nextNotifications) => {
      if (cancelled) return;
      setNotifications(nextNotifications);
    });
    const unsubSchedules = onSchedulesByBuilding(buildingId, (nextSchedules) => {
      if (cancelled) return;
      setSchedules(nextSchedules);
    });
    const unsubHistory = onRoomHistoryByBuilding(buildingId, (nextHistory) => {
      if (cancelled) return;
      setRoomHistory(nextHistory);
    });
    const unsubAdminRequests = onAdminRequestsByBuilding(buildingId, (nextAdminRequests) => {
      if (cancelled) return;
      setAdminRequests(nextAdminRequests);
    });

    return () => {
      cancelled = true;
      unsubReservations();
      unsubAllReservations();
      unsubRooms();
      unsubFeedback();
      unsubNotifs();
      unsubSchedules();
      unsubHistory();
      unsubAdminRequests();
    };
  }, [buildingId, firebaseUser?.uid]);

  useEffect(() => {
    if (buildingId && activeTab === 'add-rooms') {
      getBuildingById(buildingId).then((building) => {
        if (building) setBuildingFloors(building.floors);
      });
    }
  }, [buildingId, activeTab]);

  const handleApprove = async (id: string) => {
    const approverEmail = profile?.email || firebaseUser?.email;
    if (!approverEmail) return;
    setActionLoading(id);
    try {
      await approveReservation(id, approverEmail);
    } catch (err) {
      console.warn('Failed to approve:', err);
    }
    setActionLoading(null);
  };

  const handleReject = async (id: string) => {
    const approverEmail = profile?.email || firebaseUser?.email;
    if (!approverEmail) return;
    const reason = window.prompt('Enter a reason for rejecting this reservation.');
    if (!reason?.trim()) return;
    setActionLoading(id);
    try {
      await rejectReservation(id, approverEmail, reason.trim());
    } catch (err) {
      console.warn('Failed to reject:', err);
    }
    setActionLoading(null);
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser) return;
    await markAllNotificationsRead(firebaseUser.uid);
  };

  const handleDismissNotification = async (notifId: string) => {
    await markNotificationRead(notifId);
  };

  const resetAddRoomWizard = () => {
    setAddRoomStep(0);
    setNewRoomName('');
    setNewRoomFloor('');
    setNewRoomCapacity('');
    setNewRoomType('');
    setNewRoomAcStatus('');
    setNewRoomTvStatus('');
  };

  const handleAddRoom = async () => {
    if (!buildingId || !buildingName || !newRoomName.trim() || !newRoomFloor.trim() || !newRoomType) return;
    setAddingRoom(true);
    try {
      const data: RoomInput = {
        name: newRoomName.trim(),
        floor: newRoomFloor.trim(),
        roomType: newRoomType,
        acStatus: newRoomAcStatus || 'No Air Conditioning',
        tvProjectorStatus: newRoomTvStatus || 'No Television or Projector',
        capacity: parseInt(newRoomCapacity) || 30,
        status: 'Available',
        buildingId,
        buildingName,
      };
      await addRoom(data);
      resetAddRoomWizard();
    } catch (err) {
      console.warn('Failed to add room:', err);
    }
    setAddingRoom(false);
  };

  const handleEditRoom = async (roomId: string) => {
    try {
      await updateRoom(roomId, {
        name: editName.trim(),
        floor: editFloor.trim(),
        capacity: parseInt(editCapacity) || 30,
      });
      setEditingRoomId(null);
    } catch (err) {
      console.warn('Failed to update room:', err);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      await deleteRoom(roomId);
    } catch (err) {
      console.warn('Failed to delete:', err);
    }
  };

  const handleStatusChange = async (roomId: string, status: Room['status']) => {
    try {
      await updateRoomStatus(roomId, status);
    } catch (err) {
      console.warn('Failed to update status:', err);
      alert('Failed to update room status. Check the console for details.');
    }
  };

  const handleRespondFeedback = async (feedbackId: string) => {
    if (!responseText.trim()) return;
    try {
      await respondToFeedback(feedbackId, responseText.trim());
      setRespondingId(null);
      setResponseText('');
    } catch (err) {
      console.warn('Failed to respond:', err);
    }
  };

  const handleAddSchedule = async () => {
    if (!buildingId || !schedRoomId || !schedSubject.trim() || !schedInstructor.trim() || !schedStart || !schedEnd) return;
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
        setEditingScheduleId(null);
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
      setShowScheduleForm(false);
      setSchedRoomId('');
      setSchedSubject('');
      setSchedInstructor('');
      setSchedDay(1);
      setSchedStart('');
      setSchedEnd('');
    } catch (err) {
      console.warn('Failed to save schedule:', err);
      alert('Failed to save schedule. Check the console for details.');
    }
    setAddingSchedule(false);
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

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await deleteSchedule(id);
    } catch (err) {
      console.warn('Failed to delete schedule:', err);
    }
  };

  const computeEffectiveStatus = (room: Room): { status: string; detail: string } => {
    if (room.status === 'Unavailable') return { status: 'Unavailable', detail: 'Manual override' };
    if (room.status === 'Occupied') return { status: 'Occupied', detail: 'Checked in' };
    if (room.status === 'Reserved') return { status: 'Reserved', detail: 'Reserved' };

    const activeClass = isRoomInClass(schedules, room.id);
    if (activeClass) return { status: 'Reserved', detail: `Class: ${activeClass.subjectName}` };

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const activeReservation = allReservations.find(
      (reservation) =>
        reservation.roomId === room.id &&
        reservation.status === 'approved' &&
        reservation.date === today &&
        reservation.startTime <= currentTime &&
        reservation.endTime > currentTime
    );

    if (activeReservation) {
      return activeReservation.checkedInAt
        ? { status: 'Ongoing', detail: `Checked in: ${activeReservation.userName}` }
        : { status: 'Reserved', detail: `Reserved: ${activeReservation.userName}` };
    }

    return { status: 'Available', detail: '' };
  };

  const ongoingCount = rooms.filter((room) => computeEffectiveStatus(room).status === 'Ongoing').length;
  const reservedCount = rooms.filter((room) => computeEffectiveStatus(room).status === 'Reserved').length;
  const unavailableCount = rooms.filter((room) => room.status === 'Unavailable').length;
  const availableCount = rooms.length - ongoingCount - reservedCount - unavailableCount;
  const pendingCount = requests.length;

  const uniqueFloors = Array.from(new Set(rooms.map((room) => room.floor))).sort((left, right) => {
    const floorOrder = (floor: string) => {
      if (floor.toLowerCase().includes('ground')) return 0;
      const match = floor.match(/(\d+)/);
      return match ? parseInt(match[1]) : 999;
    };
    return floorOrder(left) - floorOrder(right);
  });

  const filteredRooms = rooms.filter((room) => {
    if (roomFloorFilter !== 'all' && room.floor !== roomFloorFilter) return false;
    if (roomSearch && !room.name.toLowerCase().includes(roomSearch.toLowerCase())) return false;
    return true;
  });

  const filteredHistory = roomHistory.filter((entry) => {
    if (historyFilter !== 'all' && entry.status !== historyFilter) return false;
    if (historyTypeFilter !== 'all' && entry.type !== historyTypeFilter) return false;
    if (
      historySearch &&
      !entry.userName.toLowerCase().includes(historySearch.toLowerCase()) &&
      !entry.roomName.toLowerCase().includes(historySearch.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return {
    firebaseUser,
    profile,
    setActiveTab,
    buildingId,
    buildingName,
    requests,
    allReservations,
    rooms,
    feedbackList,
    notifications,
    showNotifications,
    setShowNotifications,
    actionLoading,
    addRoomStep,
    setAddRoomStep,
    newRoomName,
    setNewRoomName,
    newRoomFloor,
    setNewRoomFloor,
    newRoomCapacity,
    setNewRoomCapacity,
    newRoomType,
    setNewRoomType,
    newRoomAcStatus,
    setNewRoomAcStatus,
    newRoomTvStatus,
    setNewRoomTvStatus,
    addingRoom,
    buildingFloors,
    editingRoomId,
    setEditingRoomId,
    editName,
    setEditName,
    editFloor,
    setEditFloor,
    editCapacity,
    setEditCapacity,
    respondingId,
    setRespondingId,
    responseText,
    setResponseText,
    roomSearch,
    setRoomSearch,
    roomFloorFilter,
    setRoomFloorFilter,
    historyFilter,
    setHistoryFilter,
    historySearch,
    setHistorySearch,
    historyTypeFilter,
    setHistoryTypeFilter,
    schedules,
    roomHistory,
    showScheduleForm,
    setShowScheduleForm,
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
    setEditingScheduleId,
    adminRequests,
    inboxFilter,
    setInboxFilter,
    inboxReplyingTo,
    setInboxReplyingTo,
    inboxReplyText,
    setInboxReplyText,
    inboxSubmitting,
    setInboxSubmitting,
    inboxExpandedId,
    setInboxExpandedId,
    handleApprove,
    handleReject,
    handleMarkAllRead,
    handleDismissNotification,
    resetAddRoomWizard,
    handleAddRoom,
    handleEditRoom,
    handleDeleteRoom,
    handleStatusChange,
    handleRespondFeedback,
    handleAddSchedule,
    handleEditSchedule,
    handleDeleteSchedule,
    computeEffectiveStatus,
    ongoingCount,
    reservedCount,
    availableCount,
    pendingCount,
    uniqueFloors,
    filteredRooms,
    filteredHistory,
    setAdminRequests,
    respondToAdminRequest,
  };
}
