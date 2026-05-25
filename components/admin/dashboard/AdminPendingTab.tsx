'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import {
  sortFloorOptions,
  type FloorOption,
} from '@/lib/buildings/floorLabels';
import {
  approveReservation,
  deleteReservation,
  rejectReservation,
  type Reservation,
} from '@/lib/reservations/reservations';
import { getRoomsByBuilding, type Room } from '@/lib/rooms/rooms';
import { DAY_NAMES, getSchedulesByRoomId, type Schedule } from '@/lib/schedules/schedules';
import { extractTimeString, formatTimeRange } from '@/lib/utils/dateTime';
import { formatReservationDates, RoleBadge, getManagedBuildingOptionLabel } from './shared';

interface BuildingOption {
  id: string;
  name: string;
}

interface AdminPendingTabProps {
  activeBuildingLabel: string;
  approverEmail?: string | null;
  buildingId: string;
  currentUserId?: string | null;
  requests: Reservation[];
  managedBuildings: BuildingOption[];
  onBuildingChange: (buildingId: string) => void;
  onReload: () => Promise<void>;
}

type ApproveConfirmStep = 'no-conflict' | 'conflict-warning' | 'conflict-reminder';

interface ClassScheduleConflict {
  date: string;
  dayName: string;
  roomName: string;
  schedule: Schedule;
}

type ConfirmModal =
  | {
      type: 'approve';
      id: string;
      step: ApproveConfirmStep;
      conflict?: ClassScheduleConflict;
    }
  | {
      type: 'reject';
      id: string;
    };

function ChevronDownIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function getReservationDates(request: Reservation) {
  return request.dates?.length ? request.dates : request.date ? [request.date] : [];
}

function getDayOfWeekFromDate(dateString: string) {
  const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    ).getDay();
  }

  const parsedDate = new Date(dateString);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.getDay();
}

function getTodayDateKey() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

function isExpiredReservation(request: Reservation) {
  const reservationDates = getReservationDates(request);
  if (reservationDates.length === 0) {
    return false;
  }

  const todayDateKey = getTodayDateKey();
  return reservationDates.every((date) => date < todayDateKey);
}

function getMinutesFromTime(value: string) {
  const match = extractTimeString(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
) {
  const leftStartMinutes = getMinutesFromTime(leftStart);
  const leftEndMinutes = getMinutesFromTime(leftEnd);
  const rightStartMinutes = getMinutesFromTime(rightStart);
  const rightEndMinutes = getMinutesFromTime(rightEnd);

  if (
    leftStartMinutes === null ||
    leftEndMinutes === null ||
    rightStartMinutes === null ||
    rightEndMinutes === null
  ) {
    return false;
  }

  return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
}

function findClassScheduleConflict(request: Reservation, schedules: Schedule[]) {
  for (const date of getReservationDates(request)) {
    const dayOfWeek = getDayOfWeekFromDate(date);
    if (dayOfWeek === null) continue;

    const schedule = schedules.find(
      (candidate) =>
        candidate.roomId === request.roomId &&
        candidate.dayOfWeek === dayOfWeek &&
        timeRangesOverlap(
          request.startTime,
          request.endTime,
          candidate.startTime,
          candidate.endTime
        )
    );

    if (schedule) {
      return {
        date,
        dayName: DAY_NAMES[dayOfWeek],
        roomName: schedule.roomName || request.roomName,
        schedule,
      };
    }
  }

  return null;
}

export default function AdminPendingTab({
  activeBuildingLabel,
  approverEmail,
  buildingId,
  currentUserId,
  requests,
  managedBuildings,
  onBuildingChange,
  onReload,
}: Readonly<AdminPendingTabProps>) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingReservationId, setRejectingReservationId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reservationActionError, setReservationActionError] = useState('');
  const [expandedReservationIds, setExpandedReservationIds] = useState<string[]>([]);
  const [approveCheckLoading, setApproveCheckLoading] = useState<string | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [userTypeFilter, setUserTypeFilter] = useState<string[]>([]);
  const [floorFilter, setFloorFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [buildingRooms, setBuildingRooms] = useState<Room[]>([]);

  const isAnyFilterActive =
    userTypeFilter.length > 0 ||
    floorFilter !== '' ||
    roomFilter !== '';

  useEffect(() => {
    let cancelled = false;

    if (!buildingId) {
      setBuildingRooms([]);
      return () => {
        cancelled = true;
      };
    }

    void getRoomsByBuilding(buildingId)
      .then((rooms) => {
        if (!cancelled) {
          setBuildingRooms(rooms);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Failed to load rooms for pending filters:', error);
          setBuildingRooms([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  const floorOptions = useMemo<FloorOption[]>(
    () =>
      sortFloorOptions(
        Array.from(new Set(buildingRooms.map((room) => room.floor).filter(Boolean))).map(
          (floor) => ({
            value: floor,
            label: floor,
          })
        )
      ),
    [buildingRooms]
  );

  useEffect(() => {
    if (floorOptions.length === 0) {
      if (floorFilter) {
        setFloorFilter('');
      }
      return;
    }

    const hasMatchingFloor = floorOptions.some((option) => option.value === floorFilter);
    if (!floorFilter || !hasMatchingFloor) {
      setFloorFilter('');
    }
  }, [floorFilter, floorOptions]);

  const roomOptions = useMemo(() => {
    const matchingRoomIds = new Set(
      buildingRooms
        .filter((room) => !floorFilter || room.floor === floorFilter)
        .map((room) => room.id)
    );
    const seen = new Set<string>();

    return requests
      .filter((request) => matchingRoomIds.size === 0 || matchingRoomIds.has(request.roomId))
      .map((request) => request.roomName)
      .filter((name) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .sort();
  }, [buildingRooms, floorFilter, requests]);

  useEffect(() => {
    if (roomOptions.length === 0) {
      if (roomFilter) {
        setRoomFilter('');
      }
      return;
    }

    if (!roomFilter || !roomOptions.includes(roomFilter)) {
      setRoomFilter('');
    }
  }, [roomFilter, roomOptions]);

  const clearFilters = () => {
    setUserTypeFilter([]);
    setFloorFilter('');
    setRoomFilter('');
  };

  const toggleUserType = (type: string) => {
    setUserTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const openConfirm = (
    type: 'approve' | 'reject',
    id: string,
    step: ApproveConfirmStep = 'no-conflict',
    conflict?: ClassScheduleConflict
  ) => {
    setReservationActionError('');
    if (type === 'reject') {
      setRejectingReservationId(id);
      setRejectReason('');
    }
    setConfirmModal(type === 'approve' ? { type, id, step, conflict } : { type, id });
  };

  const closeConfirm = () => {
    setConfirmModal(null);
    setRejectingReservationId(null);
    setRejectReason('');
  };

  const toggleReservationExpanded = (id: string) => {
    setExpandedReservationIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id]
    );
  };

  const openApproveConfirm = async (request: Reservation) => {
    if (!approverEmail) return;
    setReservationActionError('');
    setApproveCheckLoading(request.id);
    try {
      const schedules = await getSchedulesByRoomId(request.roomId);
      const conflict = findClassScheduleConflict(request, schedules);
      if (conflict) {
        openConfirm('approve', request.id, 'conflict-warning', conflict);
        return;
      }
      openConfirm('approve', request.id, 'no-conflict');
    } catch (error) {
      console.warn('Failed to check class schedules:', error);
      setReservationActionError(
        error instanceof Error ? error.message : 'Failed to check class schedule conflicts.'
      );
    } finally {
      setApproveCheckLoading(null);
    }
  };

  const handleApprove = async (id: string) => {
    if (!approverEmail) return;
    setReservationActionError('');
    setActionLoading(id);
    try {
      await approveReservation(id, approverEmail);
      await onReload();
    } catch (error) {
      console.warn('Failed to approve:', error);
      setReservationActionError(
        error instanceof Error ? error.message : 'Failed to approve reservation.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
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
      await onReload();
    } catch (error) {
      console.warn('Failed to reject:', error);
      setReservationActionError(
        error instanceof Error ? error.message : 'Failed to reject reservation.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentUserId) return;
    setReservationActionError('');
    setActionLoading(id);
    try {
      await deleteReservation(id, currentUserId);
      await onReload();
    } catch (error) {
      console.warn('Failed to delete reservation:', error);
      setReservationActionError(
        error instanceof Error ? error.message : 'Failed to delete reservation.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Filtered list Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const q = searchQuery.trim().toLowerCase();
  const filteredRequests = requests.filter((r) => {
    if (q && !(
      r.userName.toLowerCase().includes(q) ||
      r.roomName.toLowerCase().includes(q) ||
      (r.purpose ?? '').toLowerCase().includes(q)
    )) return false;

    if (userTypeFilter.length > 0) {
      const role = (r.userRole ?? '').toLowerCase();
      if (!userTypeFilter.some((t) => role.includes(t.toLowerCase()))) return false;
    }

    if (floorFilter) {
      const matchingRoom = buildingRooms.find((room) => room.id === r.roomId);
      if (!matchingRoom || matchingRoom.floor !== floorFilter) return false;
    }
    if (roomFilter && r.roomName !== roomFilter) return false;

    return true;
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const avatarColor = (name: string) => {
    const colors = ['#8B0000', '#1a6b3a', '#1a3a6b', '#6b1a6b', '#6b4e1a', '#1a5c6b'];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[h];
  };

  const statusBadge = (status: string) => {
    if (status === 'expired') return {
      bg: '#f3f4f6',
      color: '#4b5563',
      border: '#d1d5db',
      label: 'Expired'
    };
    if (status === 'approved') return {
      bg: '#d1fae5',
      color: '#065f46',
      border: '#6ee7b7',
      label: 'Approved'
    };
    if (status === 'rejected') return {
      bg: '#fee2e2',
      color: '#991b1b',
      border: '#fca5a5',
      label: 'Rejected'
    };
    return {
      bg: '#fef9c3',
      color: '#92400e',
      border: '#fde68a',
      label: 'Pending'
    };
  };

  return (
    <div>
      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Header with building switcher Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="mb-6 flex w-full flex-col gap-3 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-xl font-bold text-gray-900">Pending Reservations</h3>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: '#fef9c3',
                color: '#92400e',
                border: '1px solid #fde68a'
              }}
            >
              {requests.length} pending
            </span>
          </div>
        </div>
        {managedBuildings.length > 1 ? (
          <div className="w-full lg:ml-auto lg:w-72">
            <AdminBuildingSelect
              label="Active Building:"
              options={managedBuildings.map((building) => ({
                value: building.id,
                label: getManagedBuildingOptionLabel(building),
              }))}
              value={buildingId}
              onChange={onBuildingChange}
              fullWidth
            />
          </div>
        ) : (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#a12124]/30 bg-[#a12124]/10 px-3 py-1 text-xs font-bold text-[#7f1d1d] shadow-sm lg:ml-auto">
            <span>Active Building: {activeBuildingLabel}</span>
          </div>
        )}
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Search bar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div
        className="mb-5 w-full"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '12px 20px',
        }}
      >
        <div className="flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            id="pending-reservations-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, room, or purpose..."
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none border-none"
            style={{
              border: 'none',
              outline: 'none'
            }}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Clear search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Filters Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div
        className="mb-5 w-full"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '14px 20px',
        }}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>

          {/* User Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 shrink-0">Type</span>
            {(['Student', 'Faculty'] as const).map((type) => {
              const active = userTypeFilter.includes(type);
              return (
                <button key={type} type="button" onClick={() => toggleUserType(type)} style={{
                  borderRadius: '20px',
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: active ? '1.5px solid #8B0000' : '1.5px solid #e0e0e0',
                  background: active ? '#8B0000' : '#f5f5f5',
                  color: active ? '#ffffff' : '#666666',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  lineHeight: 1
                }}>
                  {type}
                </button>
              );
            })}
          </div>
          {/* Floor */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 shrink-0">Floor</span>
            <select
              id="filter-floor"
              value={floorFilter}
              onChange={(e) => {
                setFloorFilter(e.target.value);
              }}
              className="glass-input text-sm"
              style={{
                padding: '6px 12px',
                minWidth: '150px'
              }}
            >
              <option value="">All Floors</option>
              {floorOptions.map((floor) => (
                <option key={floor.value} value={floor.value}>
                  {floor.label}
                </option>
              ))}
            </select>
          </div>

          {/* Room */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 shrink-0">Room</span>
            <select id="filter-room" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="glass-input text-sm" style={{
              padding: '6px 12px',
              minWidth: '140px'
            }}>
              <option value="">All Rooms</option>
              {roomOptions.map((room) => <option key={room} value={room}>{room}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={clearFilters}
            style={{
              marginLeft: 'auto',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: isAnyFilterActive ? '1.5px solid #8B0000' : '1.5px solid #d1d5db',
              background: 'transparent',
              color: isAnyFilterActive ? '#8B0000' : '#9ca3af',
              cursor: isAnyFilterActive ? 'pointer' : 'default',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap'
            }}
            aria-label="Clear all filters"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Empty states Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {requests.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.82)',
          border: '1px dashed rgba(52,52,52,0.22)',
          borderRadius: '16px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 16px 44px rgba(15,23,42,0.12)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          padding: '48px 24px',
          textAlign: 'center'
        }}>
          <svg width="48" height="48" fill="none" stroke="#ccc" viewBox="0 0 24 24" style={{ margin: '0 auto 12px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
          <p style={{
            fontSize: '14px',
            fontWeight: 700,
            color: '#444'
          }}>All caught up!</p>
          <p style={{
            fontSize: '12px',
            color: '#999',
            marginTop: '4px'
          }}>No pending reservation requests</p>
        </div>
      ) : filteredRequests.length === 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.82)',
            border: '1px dashed rgba(52,52,52,0.22)',
            borderRadius: '16px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 16px 44px rgba(15,23,42,0.12)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            padding: '56px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center'
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cccccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px' }}>
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
          </svg>
            <p style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#555555',
              marginBottom: '6px'
            }}>No reservations found</p>
            <p style={{
              fontSize: '13px',
              color: '#999999',
              marginBottom: isAnyFilterActive ? '20px' : '0'
            }}>Try adjusting your search or filters</p>
          {isAnyFilterActive && (
              <button type="button" onClick={clearFilters} style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1.5px solid #8B0000',
                background: 'transparent',
                color: '#8B0000',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff5f5'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <style>{`@keyframes fadeInCard{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Confirm modal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {confirmModal && (
            <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px'
                  }}
              onClick={(e) => { if (e.target === e.currentTarget) closeConfirm(); }}
            >
              <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 32px', maxWidth: '440px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                {confirmModal.type === 'approve' ? (
                  <>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
                      {confirmModal.step === 'conflict-warning' ? 'Class Schedule Conflict' : 'Are you sure?'}
                    </h4>
                    {confirmModal.step === 'no-conflict' && (
                      <>
                        <p style={{ fontSize: '12px', color: '#15803d', fontWeight: 700, marginBottom: '8px' }}>
                          No class conflicts. Good to approve!
                        </p>
                        <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>
                          This will approve the reservation and notify the requester.
                        </p>
                      </>
                    )}
                    {confirmModal.step === 'conflict-warning' && confirmModal.conflict && (
                      <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>
                        There is a class in {confirmModal.conflict.roomName} on {confirmModal.conflict.dayName} from {formatTimeRange(confirmModal.conflict.schedule.startTime, confirmModal.conflict.schedule.endTime)} ({confirmModal.conflict.schedule.subjectName} by {confirmModal.conflict.schedule.instructorName}). Approve anyway?
                      </p>
                    )}
                    {confirmModal.step === 'conflict-reminder' && confirmModal.conflict && (
                      <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>
                        Just a reminder Ã¢â‚¬â€ there may be no class held on {formatReservationDates([confirmModal.conflict.date], confirmModal.conflict.date)} but a schedule exists. Still approve?
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
                      Reject Reservation?
                    </h4>
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
                      Please provide a reason for rejecting this reservation.
                    </p>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>Reason for rejection</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Explain why this request is being rejectedÃ¢â‚¬Â¦"
                          style={{
                            width: '100%',
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            fontSize: '13px',
                            minHeight: '90px',
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                    />
                        {reservationActionError && <p style={{
                          fontSize: '12px',
                          color: '#e53935',
                          marginTop: '4px'
                        }}>{reservationActionError}</p>}
                  </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button onClick={closeConfirm} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #e0e0e0', background: 'transparent', fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer' }}>Cancel</button>
                  {confirmModal.type === 'approve' && confirmModal.step === 'conflict-warning' ? (
                    <button
                      onClick={() => setConfirmModal({ ...confirmModal, step: 'conflict-reminder' })}
                      style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#8B0000', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Yes, Continue
                    </button>
                  ) : (
                  <button
                    disabled={actionLoading === confirmModal.id || (confirmModal.type === 'reject' && !rejectReason.trim())}
                    onClick={async () => {
                      if (confirmModal.type === 'approve') {
                        await handleApprove(confirmModal.id);
                      } else {
                        await handleReject(confirmModal.id);
                      }
                      if (!reservationActionError) closeConfirm();
                    }}
                        style={{
                          padding: '8px 20px',
                          borderRadius: '8px',
                          border: 'none',
                          background: confirmModal.type === 'approve' ? '#8B0000' : '#e53935',
                          color: '#fff',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          opacity: actionLoading === confirmModal.id ? 0.6 : 1
                        }}
                  >
                    {actionLoading === confirmModal.id ? 'Processing...' : confirmModal.type === 'approve' ? confirmModal.step === 'conflict-reminder' ? 'Approve Anyway' : 'Yes, Approve' : 'Yes, Reject'}
                  </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ã¢â€â‚¬Ã¢â€â‚¬ Cards list Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
              <div style={{
                background: 'rgba(255,255,255,0.76)',
                border: '1px solid rgba(255,255,255,0.36)',
                borderRadius: '16px',
                boxShadow: '0 24px 60px rgba(15,23,42,0.17), 0 2px 10px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.42)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 24px',
                  borderBottom: '1px solid rgba(255,255,255,0.45)'
                }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#111'
                  }}>Pending Reservations</span>
                  <span style={{
                    fontSize: '13px',
                    color: '#999'
                  }}>Showing {filteredRequests.length} result{filteredRequests.length !== 1 ? 's' : ''}</span>
            </div>
                <div style={{
                  padding: '16px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
              {reservationActionError && !confirmModal && (
                    <p style={{
                      fontSize: '12px',
                      color: '#e53935',
                      fontWeight: 600
                    }}>{reservationActionError}</p>
              )}
              {filteredRequests.map((request) => {
                const isExpired = request.status === 'pending' && isExpiredReservation(request);
                const badge = statusBadge(isExpired ? 'expired' : request.status);
                const initials = request.userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                const avatarBg = avatarColor(request.userName);
                const isExpanded = expandedReservationIds.includes(request.id);
                const dateLabel = formatReservationDates(request.dates, request.date);
                const timeLabel = formatTimeRange(request.startTime, request.endTime);
                return (
                  <div
                    key={request.id}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => toggleReservationExpanded(request.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleReservationExpanded(request.id);
                      }
                    }}
                    style={{ background: 'rgba(255,255,255,0.74)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.38)', boxShadow: '0 12px 30px rgba(15,23,42,0.12)', padding: isExpanded ? '20px 24px' : '14px 18px', transition: 'box-shadow 0.2s, background 0.2s, transform 0.2s', animation: 'fadeInCard 0.25s ease both', cursor: 'pointer', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 18px 44px rgba(15,23,42,0.18)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.9)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 30px rgba(15,23,42,0.12)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.74)'; }}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isExpanded ? '16px' : 0, gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div style={{ width: isExpanded ? '44px' : '36px', height: isExpanded ? '44px' : '36px', borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: isExpanded ? '14px' : '12px', flexShrink: 0 }}>{initials}</div>
                        <div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexWrap: 'wrap'
                          }}>
                            <span style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              color: '#111'
                            }}>{request.userName}</span>
                            <RoleBadge role={request.userRole} />
                          </div>
                          {isExpanded && <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>Reservation Request</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                        <span style={{ fontSize: '13px', color: '#222', fontWeight: 600 }}>{request.roomName}</span>
                        <span style={{ fontSize: '13px', color: '#555' }}>{dateLabel}</span>
                        <span style={{ fontSize: '13px', color: '#555' }}>{timeLabel}</span>
                        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
                        <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {isExpanded && (
                      <>
                    {/* Info grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '8px',
                      marginBottom: '12px'
                    }}>
                      {[
                        { label: 'ROOM', main: request.roomName, sub: request.buildingName },
                        { label: 'DATE', main: dateLabel },
                        { label: 'TIME', main: timeLabel },
                        { label: 'PURPOSE', main: request.purpose || 'Not specified' },
                      ].map(({ label, main, sub }) => (
                        <div key={label} style={{
                          background: '#fafafa',
                          borderRadius: '8px',
                          border: '1px solid #f0f0f0',
                          padding: '10px 14px'
                        }}>
                          <p style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            color: '#999',
                            textTransform: 'uppercase',
                            marginBottom: '4px'
                          }}>{label}</p>
                          <p style={{
                            fontSize: '14px',
                            color: '#222',
                            fontWeight: 500,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>{main}</p>
                          {sub && <p style={{
                            fontSize: '12px',
                            color: '#888',
                            marginTop: '2px'
                          }}>{sub}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Equipment */}
                    {request.equipment && Object.keys(request.equipment).length > 0 && (
                      <div style={{
                        background: '#fafafa',
                        borderRadius: '8px',
                        border: '1px solid #f0f0f0',
                        padding: '10px 14px',
                        marginBottom: '12px'
                      }}>
                        <p style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          color: '#999',
                          textTransform: 'uppercase',
                          marginBottom: '8px'
                        }}>Equipment</p>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px'
                        }}>
                          {Object.entries(request.equipment).map(([key, val]) => (
                            <span key={key} style={{
                              background: '#f0f0f0',
                              borderRadius: '20px',
                              padding: '2px 10px',
                              fontSize: '12px',
                              color: '#444',
                              fontWeight: 500
                            }}>{key} x{val}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Concept paper */}
                    {request.approvalDocumentUrl && (
                      <div style={{
                        background: '#fafafa',
                        borderRadius: '8px',
                        border: '1px solid #f0f0f0',
                        padding: '10px 14px',
                        marginBottom: '12px'
                      }}>
                        <p style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          color: '#999',
                          textTransform: 'uppercase',
                          marginBottom: '6px'
                        }}>Concept Paper / Letter of Approval</p>
                        <a href={request.approvalDocumentUrl} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#8B0000', fontWeight: 600, textDecoration: 'none' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                          {request.approvalDocumentName || 'Open attachment'}
                        </a>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '10px',
                      paddingTop: '14px',
                      borderTop: '1px solid #f0f0f0'
                    }}>
                      {isExpired ? (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm('Delete this expired reservation request?')) {
                              return;
                            }
                            await handleDelete(request.id);
                          }}
                          disabled={actionLoading === request.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 20px',
                            borderRadius: '8px',
                            border: '1px solid #e53935',
                            background: 'transparent',
                            color: '#e53935',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            opacity: actionLoading === request.id ? 0.6 : 1,
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={(e) => { if (!actionLoading) (e.currentTarget as HTMLButtonElement).style.background = '#fff0f0'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                          {actionLoading === request.id ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openApproveConfirm(request);
                            }}
                            disabled={actionLoading === request.id || approveCheckLoading === request.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#8B0000', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: actionLoading === request.id || approveCheckLoading === request.id ? 0.6 : 1, transition: 'background 0.15s' }}
                            onMouseEnter={(e) => { if (!actionLoading && !approveCheckLoading) (e.currentTarget as HTMLButtonElement).style.background = '#6e0000'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#8B0000'; }}
                          >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                            {approveCheckLoading === request.id ? 'Checking...' : 'Approve'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openConfirm('reject', request.id);
                            }}
                            disabled={actionLoading === request.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 20px',
                              borderRadius: '8px',
                              border: '1px solid #e53935',
                              background: 'transparent',
                              color: '#e53935',
                              fontSize: '13px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              opacity: actionLoading === request.id ? 0.6 : 1,
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => { if (!actionLoading) (e.currentTarget as HTMLButtonElement).style.background = '#fff0f0'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                          >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
