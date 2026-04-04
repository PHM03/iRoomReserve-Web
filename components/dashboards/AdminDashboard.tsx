'use client';

import React, { useEffect, useMemo, useState } from 'react';
import BleAdminMonitor from '@/components/BleAdminMonitor';
import BleSummaryCard from '@/components/BleSummaryCard';
import FloorAccordion from '@/components/room-status/FloorAccordion';
import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import type { AdminTab } from '@/components/NavBar';
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
  DAY_NAMES,
  formatTime12h,
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
import { getManagedBuildingsForCampus } from '@/lib/campusAssignments';
import { normalizeRoomCheckInMethod } from '@/lib/roomStatus';

// ─── Helpers ────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const style = role === 'Faculty'
    ? 'ui-badge-green'
    : 'ui-badge-blue';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = (() => {
    switch (status) {
      case 'Ongoing': return 'ui-badge-orange';
      case 'Reserved': return 'ui-badge-blue';
      case 'Unavailable': return 'ui-badge-red';
      case 'Available': return 'ui-badge-green';
      case 'approved': return 'ui-badge-green';
      case 'rejected': return 'ui-badge-red';
      case 'pending': return 'ui-badge-yellow';
      case 'completed': return 'ui-badge-blue';
      default: return 'ui-badge-gray';
    }
  })();
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${style}`}>
      {status}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'ui-text-yellow' : 'text-black'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function formatOrdinalFloor(level: number) {
  switch (level) {
    case 1:
      return '1st Floor';
    case 2:
      return '2nd Floor';
    case 3:
      return '3rd Floor';
    default:
      return `${level}th Floor`;
  }
}

function getBuildingFloorOptions(buildingId?: string, buildingFloors?: number) {
  switch (buildingId) {
    case 'gd1':
      return [
        'Basement Floor',
        'Ground Floor',
        ...Array.from({ length: 7 }, (_, index) => formatOrdinalFloor(index + 2)),
      ];
    case 'gd2':
      return [
        'Ground Floor',
        ...Array.from({ length: 9 }, (_, index) => formatOrdinalFloor(index + 2)),
      ];
    case 'gd3':
      return [
        'Ground Floor',
        ...Array.from({ length: 10 }, (_, index) => formatOrdinalFloor(index + 2)),
      ];
    default:
      return Array.from({ length: buildingFloors || 5 }, (_, index) => {
        if (index === 0) return 'Ground Floor';
        return formatOrdinalFloor(index);
      });
  }
}

const ROOM_TYPE_OPTIONS = [
  'Conference Room',
  'Glass Room',
  'Classroom',
  'Specialized Room',
  'Gymnasium',
] as const;

const ROOM_TYPE_LABELS: Record<(typeof ROOM_TYPE_OPTIONS)[number], string> = {
  'Conference Room': 'Conference Room',
  'Glass Room': 'Glass Room',
  Classroom: 'Classroom',
  'Specialized Room': 'Specialized Room (Computer Lab, Studio Theatre, DRA Hall, etc.)',
  Gymnasium: 'Gymnasium',
};

const ROOM_AC_OPTIONS = [
  'Working',
  'Not Working',
  'No Air Conditioning',
] as const;

const ROOM_DISPLAY_OPTIONS = [
  'Working',
  'Not Working',
  'No Television or Projector',
] as const;

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

function getManagedBuildingOptionLabel(building: { id: string; name: string }) {
  const displayLabel = getManagedBuildingDisplayLabel(building);
  return displayLabel === building.name ? displayLabel : `${displayLabel} - ${building.name}`;
}

// ─── Component ──────────────────────────────────────────────────
interface AdminDashboardProps {
  firstName: string;
  activeTab: AdminTab;
}

export default function AdminDashboard({ firstName, activeTab }: AdminDashboardProps) {
  const { firebaseUser, profile } = useAuth();
  const { setActiveTab } = useAdminTab();
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
  const selectedManagedBuilding = managedBuildings.find(
    (building) => building.id === effectiveManagedBuildingId
  ) ?? managedBuildings[0];
  const buildingId = selectedManagedBuilding?.id;
  const buildingName = selectedManagedBuilding?.name;
  const activeBuildingLabel = getManagedBuildingDisplayLabel({
    id: buildingId,
    name: buildingName,
  });

  // ─── State ──────────────────────────────────────────────────
  const [requests, setRequests] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingReservationId, setRejectingReservationId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reservationActionError, setReservationActionError] = useState('');

  // Add Room wizard state
  const [addRoomStep, setAddRoomStep] = useState(0); // 0=button, 1=floor, 2=form
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState('');
  const [newRoomType, setNewRoomType] = useState('');
  const [newRoomAcStatus, setNewRoomAcStatus] = useState('');
  const [newRoomTvStatus, setNewRoomTvStatus] = useState('');
  const [newRoomBeaconId, setNewRoomBeaconId] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);
  const [buildingFloors, setBuildingFloors] = useState(0);

  // Edit Room state
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editCapacity, setEditCapacity] = useState('');
  const [editRoomType, setEditRoomType] = useState('');
  const [editAcStatus, setEditAcStatus] = useState('');
  const [editTvStatus, setEditTvStatus] = useState('');
  const [editBeaconId, setEditBeaconId] = useState('');
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

  // Feedback response state
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  // Room search & filter state
  const [roomSearch, setRoomSearch] = useState('');
  const [roomFloorFilter, setRoomFloorFilter] = useState<string>('all');

  // History filter state
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter] = useState<string>('all');

  // Schedules state
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [roomHistory, setRoomHistory] = useState<RoomHistoryEntry[]>([]);

  // Schedule form state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedRoomId, setSchedRoomId] = useState('');
  const [schedSubject, setSchedSubject] = useState('');
  const [schedInstructor, setSchedInstructor] = useState('');
  const [schedDay, setSchedDay] = useState<number>(1);
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  // Inbox state
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'open' | 'responded' | 'closed'>('all');
  const [inboxReplyingTo, setInboxReplyingTo] = useState<string | null>(null);
  const [inboxReplyText, setInboxReplyText] = useState('');
  const [inboxSubmitting, setInboxSubmitting] = useState(false);
  const [inboxExpandedId, setInboxExpandedId] = useState<string | null>(null);

  useEffect(() => {
    // Selected building is derived from the current profile and local picker state.
  }, [managedBuildings]);

  // ─── Real-time Listeners ────────────────────────────────────
  useEffect(() => {
    if (!buildingId || !firebaseUser) return;

    const unsubReservations = onPendingReservationsByBuilding(buildingId, setRequests);
    const unsubAllReservations = onReservationsByBuilding(buildingId, setAllReservations);
    const unsubRooms = onRoomsByBuilding(buildingId, (r) => setRooms(r));
    const unsubFeedback = onFeedbackByBuilding(buildingId, setFeedbackList);
    const unsubNotifs = onUnreadNotifications(firebaseUser.uid, setNotifications);
    const unsubSchedules = onSchedulesByBuilding(buildingId, setSchedules);
    const unsubHistory = onRoomHistoryByBuilding(buildingId, setRoomHistory);
    const unsubAdminRequests = onAdminRequestsByBuilding(buildingId, setAdminRequests);

    return () => {
      unsubReservations();
      unsubAllReservations();
      unsubRooms();
      unsubFeedback();
      unsubNotifs();
      unsubSchedules();
      unsubHistory();
      unsubAdminRequests();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, firebaseUser?.uid]);

  // Load building floors when on add-rooms tab
  useEffect(() => {
    if (buildingId && activeTab === 'add-rooms') {
      getBuildingById(buildingId).then((b) => {
        if (b) setBuildingFloors(b.floors);
      });
    }
  }, [buildingId, activeTab]);

  // ─── Handlers ───────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    const approverEmail = profile?.email || firebaseUser?.email;
    if (!approverEmail) return;
    setReservationActionError('');
    setActionLoading(id);
    try {
      await approveReservation(id, approverEmail);
    } catch (err) {
      console.warn('Failed to approve:', err);
      setReservationActionError(
        err instanceof Error ? err.message : 'Failed to approve reservation.'
      );
    }
    setActionLoading(null);
  };

  const handleReject = async (id: string) => {
    const approverEmail = profile?.email || firebaseUser?.email;
    if (!approverEmail) return;
    if (!rejectReason.trim()) {
      setReservationActionError('Please enter a reason before rejecting this reservation.');
      return;
    }
    setReservationActionError('');
    setActionLoading(id);
    try {
      await rejectReservation(id, approverEmail, rejectReason.trim());
      setRejectingReservationId(null);
      setRejectReason('');
    } catch (err) {
      console.warn('Failed to reject:', err);
      setReservationActionError(
        err instanceof Error ? err.message : 'Failed to reject reservation.'
      );
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
    setNewRoomBeaconId('');
  };

  const resetEditRoomForm = () => {
    setEditingRoomId(null);
    setEditName('');
    setEditFloor('');
    setEditCapacity('');
    setEditRoomType('');
    setEditAcStatus('');
    setEditTvStatus('');
    setEditBeaconId('');
  };

  const startEditingRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setEditName(room.name);
    setEditFloor(room.floor);
    setEditCapacity(String(room.capacity));
    setEditRoomType(room.roomType || '');
    setEditAcStatus(room.acStatus || 'No Air Conditioning');
    setEditTvStatus(room.tvProjectorStatus || 'No Television or Projector');
    setEditBeaconId(room.beaconId || '');
  };

  const handleAddRoomBuildingChange = (nextBuildingId: string) => {
    if (!nextBuildingId || nextBuildingId === buildingId) {
      return;
    }

    setSelectedManagedBuildingId(nextBuildingId);
    setNewRoomFloor('');

    if (addRoomStep === 2) {
      setAddRoomStep(1);
    }
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
        beaconId: newRoomBeaconId.trim() || null,
      };
      await addRoom(data);
      resetAddRoomWizard();
    } catch (err) {
      console.warn('Failed to add room:', err);
    }
    setAddingRoom(false);
  };

  const handleEditRoom = async (roomId: string) => {
    if (!editName.trim() || !editFloor.trim() || !editRoomType) return;
    setSavingRoomId(roomId);

    try {
      const payload = {
        name: editName.trim(),
        floor: editFloor.trim(),
        roomType: editRoomType,
        acStatus: editAcStatus || 'No Air Conditioning',
        tvProjectorStatus: editTvStatus || 'No Television or Projector',
        capacity: parseInt(editCapacity, 10) || 30,
        beaconId: editBeaconId.trim() || null,
      };

      await updateRoom(roomId, payload);
      setRooms((currentRooms) =>
        currentRooms.map((room) =>
          room.id === roomId ? { ...room, ...payload } : room
        )
      );
      resetEditRoomForm();
    } catch (err) {
      console.warn('Failed to update room:', err);
      alert('Failed to update room. Please try again.');
    } finally {
      setSavingRoomId(null);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    setDeletingRoomId(roomId);

    try {
      await deleteRoom(roomId);
      setRooms((currentRooms) => currentRooms.filter((room) => room.id !== roomId));
      setSchedules((currentSchedules) =>
        currentSchedules.filter((schedule) => schedule.roomId !== roomId)
      );

      if (editingRoomId === roomId) {
        resetEditRoomForm();
      }

      if (schedRoomId === roomId) {
        setSchedRoomId('');
      }
    } catch (err) {
      console.warn('Failed to delete:', err);
      alert(
        err instanceof Error
          ? err.message
          : 'Failed to delete room. Please try again.'
      );
    } finally {
      setDeletingRoomId(null);
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
      const room = rooms.find((r) => r.id === schedRoomId);
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

  const handleEditSchedule = (s: Schedule) => {
    setEditingScheduleId(s.id);
    setSchedRoomId(s.roomId);
    setSchedSubject(s.subjectName);
    setSchedInstructor(s.instructorName);
    setSchedDay(s.dayOfWeek);
    setSchedStart(s.startTime);
    setSchedEnd(s.endTime);
    setShowScheduleForm(true);
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    try { await deleteSchedule(id); } catch (err) { console.warn('Failed to delete schedule:', err); }
  };

  // ─── Computed Values ────────────────────────────────────────
  const computeEffectiveStatus = (room: Room): { status: string; detail: string } => {
    // Manual overrides take priority
    if (room.status === 'Unavailable') return { status: 'Unavailable', detail: 'Manual override' };
    if (room.status === 'Ongoing') {
      if (
        normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth' &&
        room.beaconConnected === false
      ) {
        return { status: 'Available', detail: 'Bluetooth beacon disconnected' };
      }

      return {
        status: 'Ongoing',
        detail:
          normalizeRoomCheckInMethod(room.checkInMethod) === 'bluetooth'
            ? 'Bluetooth beacon connected'
            : 'Checked in',
      };
    }
    if (room.status === 'Reserved') return { status: 'Reserved', detail: 'Reserved' };
    // Check active class schedules
    const activeClass = isRoomInClass(schedules, room.id);
    if (activeClass) return { status: 'Reserved', detail: `Class: ${activeClass.subjectName}` };
    // Check active reservations
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const activeReservation = allReservations.find(
      (r) => r.roomId === room.id && r.status === 'approved' && r.date === today && r.startTime <= currentTime && r.endTime > currentTime
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
        ? { status: 'Ongoing', detail: `Checked in: ${activeReservation.userName}` }
        : { status: 'Reserved', detail: `Reserved: ${activeReservation.userName}` };
    }
    return { status: 'Available', detail: '' };
  };

  const ongoingCount = rooms.filter((r) => computeEffectiveStatus(r).status === 'Ongoing').length;
  const reservedCount = rooms.filter((r) => computeEffectiveStatus(r).status === 'Reserved').length;
  const unavailableCount = rooms.filter((r) => r.status === 'Unavailable').length;
  const availableCount = rooms.length - ongoingCount - reservedCount - unavailableCount;
  const pendingCount = requests.length;

  // Filtered rooms for search & floor filter
  const uniqueFloors = Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => {
    const floorOrder = (f: string) => {
      if (f.toLowerCase().includes('ground')) return 0;
      const match = f.match(/(\d+)/);
      return match ? parseInt(match[1]) : 999;
    };
    return floorOrder(a) - floorOrder(b);
  });

  const filteredRooms = rooms.filter((r) => {
    if (roomFloorFilter !== 'all' && r.floor !== roomFloorFilter) return false;
    if (roomSearch && !r.name.toLowerCase().includes(roomSearch.toLowerCase())) return false;
    return true;
  });

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

  const filteredHistory = roomHistory.filter((r) => {
    if (historyFilter !== 'all' && r.status !== historyFilter) return false;
    if (historyTypeFilter !== 'all' && r.type !== historyTypeFilter) return false;
    if (historySearch && !r.userName.toLowerCase().includes(historySearch.toLowerCase()) && !r.roomName.toLowerCase().includes(historySearch.toLowerCase())) return false;
    return true;
  });
  const addRoomFloorOptions = getBuildingFloorOptions(buildingId, buildingFloors);

  // ─── No Building Assigned State ─────────────────────────────
  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-black">Welcome, {firstName} 🏛️</h2>
          <p className="text-black mt-1">Administrator Dashboard</p>
        </div>
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 ui-text-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-black mb-2">No Building Assigned</h3>
          <p className="text-sm text-black max-w-sm mx-auto">
            Your account has been approved, but the Super Admin has not yet assigned a building to you.
            Please contact the Super Admin to get a building assignment.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
      {/* ─── Header with Notification Bell ───────────────────────── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Welcome, {firstName} 🏛️</h2>
          <p className="text-black mt-1">
            Managing: <span className="text-primary font-bold">{buildingName}</span>
          </p>
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

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 rounded-xl glass-card !p-2.5 hover:!border-primary/40 transition-all"
          >
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {notifications.length}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 !rounded-xl overflow-hidden z-50 border border-dark/12 shadow-2xl shadow-black/20" style={{ background: 'rgba(248, 246, 242, 0.98)', backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center justify-between p-4 border-b border-dark/10">
                <h4 className="font-bold text-black text-sm">Notifications</h4>
                {notifications.length > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-primary font-bold hover:text-primary-hover transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm text-black/80">No new notifications</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="p-3 border-b border-dark/5 hover:bg-primary/8 transition-colors flex items-start gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/12 border border-primary/18 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-black">{notif.title}</p>
                        <p className="text-[11px] text-black/80 mt-0.5 leading-relaxed">{notif.message}</p>
                      </div>
                      <button
                        onClick={() => handleDismissNotification(notif.id)}
                        className="text-black/70 hover:text-primary transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: ADD ROOMS ──────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'add-rooms' && (
        <div>
          <h3 className="text-xl font-bold text-black mb-6">Manage Rooms</h3>

          {/* ─── Step 0: New Room Button ─────────────────────────── */}
          {addRoomStep === 0 && (
            <div className="mb-8 space-y-3">
              <button
                onClick={() => setAddRoomStep(1)}
                className="w-full glass-card p-6 !rounded-2xl flex items-center justify-center gap-3 group hover:!border-primary/40 transition-all cursor-pointer"
              >
                <svg className="w-6 h-6 text-black group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-lg font-bold text-black group-hover:text-primary transition-colors">
                  New Room
                </span>
              </button>

              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-black">
                  Active Building
                </p>
                <p className="mt-1 text-sm font-bold text-black">{activeBuildingLabel}</p>
                {buildingName && activeBuildingLabel !== buildingName ? (
                  <p className="mt-1 text-xs text-black">{buildingName}</p>
                ) : null}
              </div>
            </div>
          )}

          {/* ─── Step 1: Select Floor ────────────────────────────── */}
          {addRoomStep === 1 && (
            <div className="glass-card p-6 mb-8 !rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-lg font-bold text-black">Select Floor</h4>
                  <p className="text-xs text-black mt-0.5">Step 1 of 2 — Choose which floor the room is on</p>
                </div>
                <button
                  onClick={resetAddRoomWizard}
                  className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Progress Bar */}
              <div className="flex gap-2 mb-6">
                <div className="h-1 flex-1 rounded-full bg-primary" />
                <div className="h-1 flex-1 rounded-full bg-dark/10" />
              </div>
              <div className="mb-6">
                <label className="block text-xs font-bold text-black mb-1.5">
                  Building
                </label>
                {managedBuildings.length > 1 ? (
                  <select
                    value={buildingId ?? ''}
                    onChange={(event) => handleAddRoomBuildingChange(event.target.value)}
                    className="glass-input w-full px-4 py-2.5 text-sm appearance-none cursor-pointer"
                  >
                    {managedBuildings.map((building) => (
                      <option key={building.id} value={building.id}>
                        {getManagedBuildingOptionLabel(building)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-sm font-bold text-black">{activeBuildingLabel}</p>
                    {buildingName && activeBuildingLabel !== buildingName ? (
                      <p className="mt-1 text-xs text-black">{buildingName}</p>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {addRoomFloorOptions.map((floorLabel, index) => (
                  <button
                    key={floorLabel}
                    onClick={() => {
                      setNewRoomFloor(floorLabel);
                      setAddRoomStep(2);
                    }}
                    className="glass-card !bg-dark/5 p-4 !rounded-xl text-center group hover:!border-primary/40 transition-all cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                      <span className="text-primary font-bold text-sm">
                        {floorLabel === 'Basement Floor'
                          ? 'B'
                          : floorLabel === 'Ground Floor'
                            ? 'G'
                            : index}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-black group-hover:text-primary transition-colors">{floorLabel}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Step 2: Room Information Form ───────────────────── */}
          {addRoomStep === 2 && (
            <div className="glass-card p-6 mb-8 !rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-lg font-bold text-black">Room Information</h4>
                  <p className="text-xs text-black mt-0.5">
                    Step 2 of 2 — <span className="text-primary">{newRoomFloor}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAddRoomStep(1)}
                    className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={resetAddRoomWizard}
                    className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="flex gap-2 mb-6">
                <div className="h-1 flex-1 rounded-full bg-primary" />
                <div className="h-1 flex-1 rounded-full bg-primary" />
              </div>

              <div className="mb-6">
                <label className="block text-xs font-bold text-black mb-1.5">
                  Building
                </label>
                {managedBuildings.length > 1 ? (
                  <select
                    value={buildingId ?? ''}
                    onChange={(event) => handleAddRoomBuildingChange(event.target.value)}
                    className="glass-input w-full px-4 py-2.5 text-sm appearance-none cursor-pointer"
                  >
                    {managedBuildings.map((building) => (
                      <option key={building.id} value={building.id}>
                        {getManagedBuildingOptionLabel(building)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-sm font-bold text-black">{activeBuildingLabel}</p>
                    {buildingName && activeBuildingLabel !== buildingName ? (
                      <p className="mt-1 text-xs text-black">{buildingName}</p>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {/* Room Name & Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black mb-1.5">Room Name *</label>
                    <input
                      type="text"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      placeholder="e.g. Room 312"
                      className="glass-input w-full px-4 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black mb-1.5">Room Type *</label>
                    <select
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value)}
                      className="glass-input w-full px-4 py-2.5 text-sm appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select room type</option>
                      {ROOM_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {ROOM_TYPE_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-black mb-1.5">
                    Beacon ID
                  </label>
                  <input
                    type="text"
                    value={newRoomBeaconId}
                    onChange={(e) => setNewRoomBeaconId(e.target.value)}
                    placeholder="e.g. ESP32_ROOM_301"
                    className="glass-input w-full px-4 py-2.5 text-sm"
                  />
                  <p className="mt-1.5 text-xs text-black">
                    Use the exact ESP32 BLE device name for Bluetooth room
                    check-in.
                  </p>
                </div>

                {/* Facilities Section */}
                <div>
                  <h5 className="text-sm font-bold text-black uppercase tracking-wider mb-4">Facilities</h5>

                  {/* Air Conditioner Status */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-black mb-2">Air Conditioner Status</label>
                    <div className="flex flex-wrap gap-2">
                      {ROOM_AC_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setNewRoomAcStatus(opt)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${newRoomAcStatus === opt
                            ? 'bg-primary/20 text-primary border border-primary/40'
                            : 'bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 hover:text-primary'
                            }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Television or Projector Status */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-black mb-2">Television or Projector</label>
                    <div className="flex flex-wrap gap-2">
                      {ROOM_DISPLAY_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setNewRoomTvStatus(opt)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${newRoomTvStatus === opt
                            ? 'bg-primary/20 text-primary border border-primary/40'
                            : 'bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 hover:text-primary'
                            }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Capacity */}
                  <div>
                    <label className="block text-xs font-bold text-black mb-1.5">Capacity</label>
                    <input
                      type="number"
                      value={newRoomCapacity}
                      onChange={(e) => setNewRoomCapacity(e.target.value)}
                      placeholder="30"
                      className="glass-input w-full sm:w-40 px-4 py-2.5 text-sm"
                      min={1}
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleAddRoom}
                  disabled={addingRoom || !newRoomName.trim() || !newRoomType}
                  className="btn-primary w-full py-3 px-4 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {addingRoom ? 'Adding Room...' : 'Add Room'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Search & Floor Filter ──────────────────────────── */}
          {rooms.length > 0 && (
            <div className="mb-6 space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-black pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Search rooms by name..."
                  className="glass-input w-full pl-10 pr-4 py-2.5 text-sm"
                />
              </div>
              {/* Floor Filter Pills */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setRoomFloorFilter('all')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                    roomFloorFilter === 'all'
                      ? 'bg-primary/20 text-primary border border-primary/40'
                      : 'bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 hover:text-primary'
                  }`}
                >
                  All ({rooms.length})
                </button>
                {uniqueFloors.map((floor) => {
                  const count = rooms.filter((r) => r.floor === floor).length;
                  return (
                    <button
                      key={floor}
                      onClick={() => setRoomFloorFilter(floor)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                        roomFloorFilter === floor
                          ? 'bg-primary/20 text-primary border border-primary/40'
                          : 'bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 hover:text-primary'
                      }`}
                    >
                      {floor} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Room List */}
          {rooms.length === 0 && addRoomStep === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">🏠</div>
              <h4 className="text-lg font-bold text-black mb-1">No Rooms Yet</h4>
              <p className="text-sm text-black">Click &quot;New Room&quot; above to add your first room.</p>
            </div>
          ) : filteredRooms.length === 0 && rooms.length > 0 ? (
            <div className="glass-card p-8 text-center">
              <div className="text-3xl mb-3">🔍</div>
              <h4 className="text-lg font-bold text-black mb-1">No Rooms Found</h4>
              <p className="text-sm text-black">Try adjusting your search or filter.</p>
            </div>
          ) : filteredRooms.length > 0 && (
            <div className="space-y-3">
              {filteredRooms.map((room) => (
                <div key={room.id} className="glass-card p-4 sm:p-5">
                  {editingRoomId === room.id ? (
                    /* Editing Mode */
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-black">
                            Room Name *
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 text-sm"
                            placeholder="e.g. Room 312"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-black">
                            Floor *
                          </label>
                          <select
                            value={editFloor}
                            onChange={(e) => setEditFloor(e.target.value)}
                            className="glass-input w-full cursor-pointer appearance-none px-4 py-2.5 text-sm"
                          >
                            <option value="" disabled>Select floor</option>
                            {addRoomFloorOptions.map((floorOption) => (
                              <option key={floorOption} value={floorOption}>
                                {floorOption}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-xs font-bold text-black">
                            Room Type *
                          </label>
                          <select
                            value={editRoomType}
                            onChange={(e) => setEditRoomType(e.target.value)}
                            className="glass-input w-full cursor-pointer appearance-none px-4 py-2.5 text-sm"
                          >
                            <option value="" disabled>Select room type</option>
                            {ROOM_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {ROOM_TYPE_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-xs font-bold text-black">
                            Beacon ID
                          </label>
                          <input
                            type="text"
                            value={editBeaconId}
                            onChange={(e) => setEditBeaconId(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 text-sm"
                            placeholder="e.g. ESP32_ROOM_301"
                          />
                          <p className="mt-1.5 text-xs text-black">
                            Match this to the beacon&apos;s exact BLE device name.
                          </p>
                        </div>
                      </div>

                      <div>
                        <h5 className="mb-4 text-sm font-bold uppercase tracking-wider text-black">
                          Facilities
                        </h5>

                        <div className="mb-4">
                          <label className="mb-2 block text-xs font-bold text-black">
                            Air Conditioner Status
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {ROOM_AC_OPTIONS.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setEditAcStatus(option)}
                                className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                                  editAcStatus === option
                                    ? 'border border-primary/40 bg-primary/20 text-primary'
                                    : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="mb-4">
                          <label className="mb-2 block text-xs font-bold text-black">
                            Television or Projector
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {ROOM_DISPLAY_OPTIONS.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setEditTvStatus(option)}
                                className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                                  editTvStatus === option
                                    ? 'border border-primary/40 bg-primary/20 text-primary'
                                    : 'border border-dark/10 bg-dark/5 text-black hover:bg-primary/10 hover:text-primary'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-bold text-black">
                            Capacity
                          </label>
                          <input
                            type="number"
                            value={editCapacity}
                            onChange={(e) => setEditCapacity(e.target.value)}
                            className="glass-input w-full px-4 py-2.5 text-sm sm:w-40"
                            placeholder="30"
                            min={1}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleEditRoom(room.id)}
                          disabled={
                            savingRoomId === room.id ||
                            !editName.trim() ||
                            !editFloor.trim() ||
                            !editRoomType
                          }
                          className="px-4 py-2 rounded-xl text-sm font-bold ui-button-green"
                        >
                          {savingRoomId === room.id ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          onClick={resetEditRoomForm}
                          disabled={savingRoomId === room.id}
                          className="px-4 py-2 rounded-xl text-sm font-bold bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-lg shrink-0">
                          🚪
                        </div>
                        <div>
                          <h4 className="font-bold text-black text-sm">{room.name}</h4>
                          <p className="text-xs text-black">
                            {room.floor} · {room.roomType || 'Room'} · Capacity: {room.capacity}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={room.status} />
                        <button
                          onClick={() => startEditingRoom(room)}
                          disabled={deletingRoomId === room.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-black hover:text-primary hover:bg-primary/10 border border-dark/10 transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          disabled={deletingRoomId === room.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold ui-button-ghost ui-text-red ui-button-ghost-danger disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingRoomId === room.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: FEEDBACK ───────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'feedback' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-black">Room Feedback</h3>
            <span className="text-sm text-black">{feedbackList.length} total</span>
          </div>

          {feedbackList.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">💬</div>
              <h4 className="text-lg font-bold text-black mb-1">No Feedback Yet</h4>
              <p className="text-sm text-black">Feedback from room users will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {feedbackList.map((fb) => (
                <div key={fb.id} className="glass-card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-dark/5 border border-dark/10 flex items-center justify-center text-black font-bold text-sm">
                        {fb.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-black text-sm">{fb.userName}</h4>
                        <p className="text-xs text-black">{fb.roomName}</p>
                      </div>
                    </div>
                    <StarRating rating={fb.rating} />
                  </div>

                  <p className="text-sm text-black mb-3 leading-relaxed">{fb.message}</p>

                  {fb.adminResponse ? (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-3">
                      <p className="text-xs font-bold text-primary mb-1">Admin Response</p>
                      <p className="text-sm text-black">{fb.adminResponse}</p>
                    </div>
                  ) : (
                    <>
                      {respondingId === fb.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            placeholder="Type your response..."
                            className="glass-input w-full px-4 py-3 text-sm resize-none"
                            rows={3}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setRespondingId(null); setResponseText(''); }}
                              className="px-4 py-2 rounded-xl text-sm font-bold bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleRespondFeedback(fb.id)}
                              disabled={!responseText.trim()}
                              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                            >
                              Send Response
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRespondingId(fb.id)}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary/70 hover:text-primary hover:bg-primary/5 border border-primary/20 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Reply
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: DASHBOARD OVERVIEW ───────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <div className="glass-card p-4"><p className="text-xs text-black font-bold">Total Rooms</p><p className="text-2xl font-bold text-black mt-1">{rooms.length}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-black font-bold">Reserved</p><p className="text-2xl font-bold ui-text-blue mt-1">{reservedCount}</p></div>
            <div className="glass-card p-4"><p className="text-xs text-black font-bold">Available</p><p className="text-2xl font-bold ui-text-green mt-1">{availableCount}</p></div>
            <button onClick={() => setActiveTab('pending')} className="glass-card p-4 text-left hover:!border-yellow-500/40 transition-all cursor-pointer"><p className="text-xs text-black font-bold">Pending Requests</p><p className="text-2xl font-bold ui-text-yellow mt-1">{pendingCount}</p><p className="text-[10px] text-black mt-0.5">Click to review →</p></button>
            <div className="glass-card p-4"><p className="text-xs text-black font-bold">Ongoing</p><p className="text-2xl font-bold ui-text-orange mt-1">{ongoingCount}</p></div>
          </div>

          {/* Live Room Status Grid */}
          <h3 className="text-lg font-bold text-black mb-4">Live Room Status <span className="text-sm text-black font-normal ml-2">({buildingName})</span></h3>
          {rooms.length === 0 ? (
            <div className="glass-card p-8 text-center mb-8"><p className="text-sm text-black">No rooms configured yet.</p></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
              {rooms.map((room) => {
                const effective = computeEffectiveStatus(room);
                const borderColor = effective.status === 'Ongoing' ? 'border-orange-500/40' : effective.status === 'Reserved' ? 'border-blue-500/40' : effective.status === 'Unavailable' ? 'border-red-500/40' : 'border-green-500/40';
                return (
                  <div key={room.id} className={`glass-card p-4 border-l-4 ${borderColor}`}>
                    <div className="flex justify-between items-start">
                      <div><h4 className="font-bold text-black">{room.name}</h4><p className="text-xs text-black">{room.floor} · Cap: {room.capacity}</p></div>
                      <StatusBadge status={effective.status} />
                    </div>
                    {effective.detail && <p className="text-xs text-black mt-2">{effective.detail}</p>}
                  </div>
                );
              })}
            </div>
          )}

          <BleSummaryCard
            buildingName={buildingName}
            className="mb-8"
            onViewDetails={() => setActiveTab('status-scheduling')}
          />

          {/* Today's Class Schedules */}
          {(() => {
            const todaySchedules = schedules.filter((s) => s.dayOfWeek === new Date().getDay());
            return (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-black">Today&apos;s Class Schedules <span className="text-sm text-black font-normal ml-1">({DAY_NAMES[new Date().getDay()]})</span></h3>
                  <span className="text-xs text-black">{todaySchedules.length} class{todaySchedules.length !== 1 ? 'es' : ''}</span>
                </div>
                {todaySchedules.length === 0 ? (
                  <div className="glass-card p-6 text-center mb-8"><p className="text-sm text-black">No classes scheduled for today.</p></div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                    {todaySchedules.map((s) => {
                      const now = new Date();
                      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                      const isActive = s.startTime <= currentTime && s.endTime > currentTime;
                      return (
                        <div key={s.id} className={`glass-card p-4 border-l-4 ${isActive ? 'border-orange-500/60' : 'border-dark/10'}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-bold text-black">{s.subjectName}</p>
                              <p className="text-xs text-black mt-0.5">{s.roomName} · {s.instructorName}</p>
                              <p className="text-xs text-black mt-1">{formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}</p>
                            </div>
                            {isActive && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ui-badge-orange">In Progress</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Pending Requests Preview */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-black">Pending Requests</h3>
            {requests.length > 0 && (
              <button onClick={() => setActiveTab('pending')} className="text-sm text-primary font-bold hover:text-primary-hover transition-colors">
                View all ({requests.length}) →
              </button>
            )}
          </div>
          {requests.length === 0 ? (
            <div className="glass-card p-8 text-center"><p className="text-sm text-black">No requests waiting for approval.</p></div>
          ) : (
            <div className="space-y-3">
              {requests.slice(0, 3).map((req) => (
                <button
                  key={req.id}
                  onClick={() => setActiveTab('pending')}
                  className="glass-card p-4 w-full text-left hover:!border-yellow-500/30 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center ui-text-yellow font-bold text-sm shrink-0">
                      {req.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-black text-sm">{req.userName}</h4>
                        <RoleBadge role={req.userRole} />
                      </div>
                      <p className="text-xs text-black mt-0.5">{req.roomName} · {req.date} · {req.startTime} – {req.endTime}</p>
                    </div>
                    <svg className="w-5 h-5 text-black shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
              {requests.length > 3 && (
                <button
                  onClick={() => setActiveTab('pending')}
                  className="w-full text-center py-2 text-sm font-bold text-primary/70 hover:text-primary transition-colors"
                >
                  +{requests.length - 3} more pending...
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: STATUS & SCHEDULING ──────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'status-scheduling' && (
        <div>
          <h3 className="text-xl font-bold text-black mb-6">
            Room Status Monitor
            <span className="text-sm text-black font-normal ml-2">({buildingName})</span>
          </h3>

          {rooms.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-sm text-black">No rooms configured. Add rooms first.</p>
            </div>
          ) : (
            <div className="space-y-4 mb-8">
              {statusMonitorFloorGroups.map((floorGroup) => (
                <FloorAccordion
                  key={floorGroup.floor}
                  floor={floorGroup.floor}
                  roomCount={floorGroup.rooms.length}
                  renderContent={() => (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {floorGroup.rooms.map((room) => {
                        const effective = computeEffectiveStatus(room);
                        const statusBorder = effective.status === 'Ongoing'
                          ? 'border-orange-500/40'
                          : effective.status === 'Reserved'
                            ? 'border-blue-500/40'
                            : effective.status === 'Unavailable'
                              ? 'border-red-500/40'
                              : 'border-green-500/40';

                        return (
                          <div key={room.id} className={`glass-card p-5 border-l-4 ${statusBorder}`}>
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="text-lg font-bold text-black">{room.name}</h4>
                                <p className="text-sm text-black">{room.floor} | Cap: {room.capacity}</p>
                              </div>
                              <StatusBadge status={effective.status} />
                            </div>
                            {effective.detail && <p className="text-xs text-black mb-2">{effective.detail}</p>}
                            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-dark/5">
                              <button onClick={() => handleStatusChange(room.id, 'Available')} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${room.status === 'Available' ? 'ui-button-green' : 'ui-button-gray'}`}>Available</button>
                              <button onClick={() => handleStatusChange(room.id, 'Reserved')} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${room.status === 'Reserved' ? 'ui-button-blue' : 'ui-button-gray'}`}>Reserved</button>
                              <button onClick={() => handleStatusChange(room.id, 'Ongoing')} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${room.status === 'Ongoing' ? 'ui-button-orange' : 'ui-button-gray'}`}>Ongoing</button>
                              <button onClick={() => handleStatusChange(room.id, 'Unavailable')} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${room.status === 'Unavailable' ? 'ui-button-red' : 'ui-button-gray'}`}>Unavailable</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                />
              ))}
            </div>
          )}

          {/* ─── Class Schedule Manager ─────────────────────────────── */}
          <BleAdminMonitor
            buildingName={buildingName}
            rooms={rooms}
            className="mb-10"
          />

          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-black">Class Schedules</h3>
              <button onClick={() => {
                if (showScheduleForm) {
                  setShowScheduleForm(false);
                  setEditingScheduleId(null);
                  setSchedRoomId('');
                  setSchedSubject('');
                  setSchedInstructor('');
                  setSchedDay(1);
                  setSchedStart('');
                  setSchedEnd('');
                } else {
                  setShowScheduleForm(true);
                }
              }} className="btn-primary px-4 py-2 text-sm">
                {showScheduleForm ? 'Cancel' : '+ Add Schedule'}
              </button>
            </div>

            {showScheduleForm && (
              <div className="glass-card p-5 mb-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">Room</label>
                    <select value={schedRoomId} onChange={(e) => setSchedRoomId(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm">
                      <option value="">Select room...</option>
                      {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.floor})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">Day</label>
                    <select value={schedDay} onChange={(e) => setSchedDay(Number(e.target.value))} className="glass-input w-full px-4 py-2.5 text-sm">
                      {DAY_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">Subject</label>
                    <input value={schedSubject} onChange={(e) => setSchedSubject(e.target.value)} placeholder="e.g. IT 101" className="glass-input w-full px-4 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">Instructor</label>
                    <input value={schedInstructor} onChange={(e) => setSchedInstructor(e.target.value)} placeholder="e.g. Prof. Santos" className="glass-input w-full px-4 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">Start Time</label>
                    <input type="time" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-black mb-1">End Time</label>
                    <input type="time" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm" />
                  </div>
                </div>
                <button onClick={handleAddSchedule} disabled={addingSchedule || !schedRoomId || !schedSubject.trim()} className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50">
                  {addingSchedule ? 'Saving...' : editingScheduleId ? 'Update Schedule' : 'Add Schedule'}
                </button>
              </div>
            )}

            {schedules.length === 0 ? (
              <div className="glass-card p-8 text-center"><p className="text-sm text-black">No class schedules assigned yet.</p></div>
            ) : (
              <div className="space-y-4">
                {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                  const daySchedules = schedules.filter((s) => s.dayOfWeek === day);
                  if (daySchedules.length === 0) return null;
                  return (
                    <div key={day}>
                      <h4 className="text-sm font-bold text-black mb-2">{DAY_NAMES[day]}</h4>
                      <div className="space-y-2">
                        {daySchedules.map((s) => (
                          <div key={s.id} className="glass-card p-4 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-black">{s.subjectName}</p>
                              <p className="text-xs text-black">{s.roomName} · {s.instructorName} · {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}</p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => handleEditSchedule(s)} className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all" title="Edit">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => handleDeleteSchedule(s.id)} className="p-2 rounded-lg ui-button-ghost ui-button-ghost-danger transition-all" title="Delete">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: ROOM HISTORY ───────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'room-history' && (
        <div>
          <h3 className="text-xl font-bold text-black mb-6">Room History</h3>

          {/* Filters */}
          <div className="glass-card p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input type="text" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Search by name or room..." className="glass-input w-full px-4 py-2.5 text-sm" />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {['all', 'approved', 'rejected', 'active', 'completed', 'cancelled'].map((filter) => (
                  <button key={filter} onClick={() => setHistoryFilter(filter)} className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all ${historyFilter === filter ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-dark/5 text-black border border-dark/10 hover:bg-primary/10'}`}>
                    {filter === 'all' ? 'All Status' : filter}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">📋</div>
              <h4 className="text-lg font-bold text-black mb-1">No Reservations Found</h4>
              <p className="text-sm text-black">
                {historySearch || historyFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Reservation history will appear here.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block glass-card overflow-hidden !rounded-xl">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-dark/10">
                      <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">User</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Room</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Time</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Purpose</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-black uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((res) => (
                      <tr key={res.id} className="border-b border-dark/5 hover:bg-primary/10 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-black">{res.userName}</span>
                            <RoleBadge role={res.userRole} />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-black">{res.roomName}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${res.type === 'reservation' ? 'ui-badge-blue' : 'ui-badge-purple'}`}>
                            {res.type === 'reservation' ? 'Reservation' : 'Class'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-black">{res.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-black">{res.startTime} – {res.endTime}</td>
                        <td className="px-6 py-4 text-sm text-black max-w-[200px] truncate">{res.purpose}</td>
                        <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={res.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {filteredHistory.map((res) => (
                  <div key={res.id} className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-black text-sm">{res.userName}</span>
                        <RoleBadge role={res.userRole} />
                      </div>
                      <StatusBadge status={res.status} />
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-black">Room:</span>
                        <span className="font-bold text-black">{res.roomName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-black">Type:</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${res.type === 'reservation' ? 'ui-badge-blue' : 'ui-badge-purple'}`}>
                          {res.type === 'reservation' ? 'Reservation' : 'Class'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-black">Date:</span>
                        <span className="text-black">{res.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-black">Time:</span>
                        <span className="text-black">{res.startTime} – {res.endTime}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-black">Purpose:</span>
                        <span className="text-black truncate max-w-[180px]">{res.purpose}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 text-center">
            <p className="text-xs text-black">Showing {filteredHistory.length} of {roomHistory.length} entries</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: PENDING RESERVATIONS ──────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'pending' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-black flex items-center gap-3">
                Pending Reservations
                {requests.length > 0 && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ui-badge-yellow">
                    {requests.length} pending
                  </span>
                )}
              </h3>
              <p className="text-black mt-1 text-sm">
                Review and approve reservation requests for <span className="ui-text-teal font-bold">{buildingName}</span>
              </p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="glass-card p-12 !rounded-xl text-center">
              <svg className="w-16 h-16 text-black mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <p className="text-sm text-black font-bold">All caught up!</p>
              <p className="text-xs text-black mt-1">No pending reservation requests</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reservationActionError && (
                <p className="text-xs ui-text-red font-bold">{reservationActionError}</p>
              )}
              {requests.map((req) => (
                <div key={req.id} className="glass-card !rounded-xl overflow-hidden border-l-4 border-yellow-500/40">
                  <div className="p-5">
                    {/* User Info Row */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center ui-text-yellow font-bold text-sm shrink-0">
                          {req.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="font-bold text-black">{req.userName}</h4>
                            <RoleBadge role={req.userRole} />
                          </div>
                          <p className="text-xs text-black">Reservation Request</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ui-badge-yellow">
                        Pending
                      </span>
                    </div>

                    {/* Reservation Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                      <div className="bg-dark/3 rounded-xl p-3 border border-dark/5">
                        <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Room</p>
                        <p className="text-sm font-bold text-black">{req.roomName}</p>
                        <p className="text-xs text-black mt-0.5">{req.buildingName}</p>
                      </div>
                      <div className="bg-dark/3 rounded-xl p-3 border border-dark/5">
                        <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Date</p>
                        <p className="text-sm font-bold text-black">{req.date}</p>
                      </div>
                      <div className="bg-dark/3 rounded-xl p-3 border border-dark/5">
                        <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Time</p>
                        <p className="text-sm font-bold text-black">{req.startTime} – {req.endTime}</p>
                      </div>
                      <div className="bg-dark/3 rounded-xl p-3 border border-dark/5">
                        <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Purpose</p>
                        <p className="text-sm font-bold text-black truncate">{req.purpose || 'Not specified'}</p>
                      </div>
                    </div>

                    {/* Additional Details */}
                    {req.equipment && Object.keys(req.equipment).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {req.equipment && Object.keys(req.equipment).length > 0 && (
                          <div className="bg-dark/3 rounded-xl p-3 border border-dark/5">
                            <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Equipment</p>
                            <p className="text-sm text-black">{Object.entries(req.equipment).map(([k, v]) => `${k} (×${v})`).join(', ')}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-4 border-t border-dark/5">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={actionLoading === req.id}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold ui-button-green disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setReservationActionError('');
                          setRejectingReservationId(
                            rejectingReservationId === req.id ? null : req.id
                          );
                          setRejectReason('');
                        }}
                        disabled={actionLoading === req.id}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold ui-button-red disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Reject
                      </button>
                    </div>

                    {rejectingReservationId === req.id && (
                      <div className="mt-4 space-y-3 pt-4 border-t border-dark/5">
                        <label className="block text-xs font-bold text-black">
                          Reason for rejection
                        </label>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="glass-input w-full px-4 py-3 min-h-[110px] resize-none"
                          placeholder="Explain why this reservation request is being rejected."
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={actionLoading === req.id || !rejectReason.trim()}
                            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-bold ui-button-red disabled:opacity-50"
                          >
                            Confirm Rejection
                          </button>
                          <button
                            onClick={() => {
                              setRejectingReservationId(null);
                              setRejectReason('');
                            }}
                            className="px-4 py-2 text-sm font-bold text-black hover:text-primary transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: INBOX ──────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'inbox' && (() => {
        const filteredInbox = inboxFilter === 'all'
          ? adminRequests
          : adminRequests.filter((r) => r.status === inboxFilter);
        const openCount = adminRequests.filter((r) => r.status === 'open').length;

        const handleInboxReply = async (requestId: string) => {
          if (!inboxReplyText.trim()) return;
          setInboxSubmitting(true);
          try {
            await respondToAdminRequest(requestId, inboxReplyText.trim());
            setInboxReplyingTo(null);
            setInboxReplyText('');
          } catch (err) {
            console.error('Failed to respond:', err);
          }
          setInboxSubmitting(false);
        };

        const typeIcon = (type: string) => {
          switch (type) {
            case 'equipment': return '🔧';
            case 'general': return '💬';
            default: return '📋';
          }
        };

        const formatDate = (ts: { toDate?: () => Date } | undefined): string => {
          if (!ts || typeof ts.toDate !== 'function') return '';
          const d = ts.toDate();
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
            ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        };

        return (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-black flex items-center gap-3">
                  Inbox
                  {openCount > 0 && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ui-badge-blue">
                      {openCount} new
                    </span>
                  )}
                </h3>
                <p className="text-black mt-1 text-sm">
                  Messages from users in <span className="ui-text-teal font-bold">{buildingName}</span>
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              {(['all', 'open', 'responded', 'closed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setInboxFilter(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all whitespace-nowrap ${
                    inboxFilter === f
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-dark/5 text-black border border-dark/10 hover:text-primary'
                  }`}
                >
                  {f === 'all' ? `All (${adminRequests.length})` : `${f} (${adminRequests.filter(r => r.status === f).length})`}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="space-y-4">
              {filteredInbox.length === 0 ? (
                <div className="glass-card p-12 !rounded-xl text-center">
                  <svg className="w-14 h-14 text-black mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-sm text-black font-bold">No messages</p>
                  <p className="text-xs text-black mt-1">
                    {inboxFilter === 'all' ? 'Your inbox is empty' : `No ${inboxFilter} messages`}
                  </p>
                </div>
              ) : (
                filteredInbox.map((req) => {
                  const isExpanded = inboxExpandedId === req.id;
                  return (
                    <div key={req.id} className="glass-card !rounded-xl overflow-hidden">
                      {/* Clickable Header */}
                      <button
                        onClick={() => setInboxExpandedId(isExpanded ? null : req.id)}
                        className="w-full p-5 text-left hover:bg-primary/10 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-dark/5 border border-dark/10 flex items-center justify-center text-black font-bold text-sm shrink-0">
                              {req.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <h4 className="text-sm font-bold text-black">{req.userName}</h4>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  req.status === 'open' ? 'ui-badge-blue' :
                                  req.status === 'responded' ? 'ui-badge-green' :
                                  'ui-badge-gray'
                                } capitalize`}>
                                  {req.status}
                                </span>
                              </div>
                              <p className="text-xs text-black">
                                <span className="mr-1">{typeIcon(req.type)}</span>
                                {req.type} · {req.subject}
                                {req.createdAt && <span className="ml-2 text-black">· {formatDate(req.createdAt)}</span>}
                              </p>
                            </div>
                          </div>
                          <svg className={`w-5 h-5 text-black transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="border-t border-dark/5 px-5 pb-5">
                          {/* User's Message */}
                          <div className="mt-4">
                            <p className="text-xs font-bold text-black mb-2">Message</p>
                            <p className="text-sm text-black leading-relaxed bg-dark/3 border border-dark/5 rounded-xl p-3">{req.message}</p>
                          </div>

                          {/* Admin Response */}
                          {req.adminResponse && (
                            <div className="mt-4">
                              <p className="text-xs font-bold ui-text-green mb-2">Your Response</p>
                              <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-3">
                                <p className="text-sm text-black leading-relaxed">{req.adminResponse}</p>
                              </div>
                            </div>
                          )}

                          {/* Reply Section */}
                          {req.status === 'open' && (
                            <>
                              {inboxReplyingTo === req.id ? (
                                <div className="space-y-3 mt-4 pt-4 border-t border-dark/5">
                                  <textarea
                                    value={inboxReplyText}
                                    onChange={(e) => setInboxReplyText(e.target.value)}
                                    className="glass-input w-full px-4 py-3 min-h-[100px] resize-none"
                                    placeholder="Type your response..."
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleInboxReply(req.id)}
                                      disabled={inboxSubmitting || !inboxReplyText.trim()}
                                      className="btn-primary px-5 py-2 text-sm flex items-center gap-2"
                                    >
                                      {inboxSubmitting ? (
                                        <>
                                          <svg className="animate-spin h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                          </svg>
                                          Sending...
                                        </>
                                      ) : (
                                        <>
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                          </svg>
                                          Send Response
                                        </>
                                      )}
                                    </button>
                                    <button
                                      onClick={() => { setInboxReplyingTo(null); setInboxReplyText(''); }}
                                      className="px-4 py-2 text-sm font-bold text-black hover:text-primary transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setInboxReplyingTo(req.id)}
                                  className="mt-4 px-4 py-2 rounded-xl text-sm font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                  </svg>
                                  Reply
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}
    </main>
  );
}
