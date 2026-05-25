import { useEffect, useMemo, useState, type ReactNode } from 'react';
import BleSummaryCard from '@/components/ui/BleSummaryCard';
import MyReservationTimetable from '@/components/rooms/schedules/MyReservationTimetable';
import type { AdminTab } from '@/components/layout/NavBar';
import {
  fetchAdminDashboardSnapshot,
  type AdminDashboardSummary,
} from '@/lib/admin/adminDashboard';
import { getFloorDisplayLabel } from '@/lib/buildings/floorLabels';
import {
  approveReservation,
  deleteReservation,
  rejectReservation,
  type Reservation,
} from '@/lib/reservations/reservations';
import type { Room } from '@/lib/rooms/rooms';
import { formatTimeRange } from '@/lib/utils/dateTime';
import { formatReservationDates, RoleBadge, StatusBadge } from './shared';

type RoomStatusFilter = 'All' | 'Available' | 'Reserved' | 'Occupied' | 'Unavailable';

interface AdminOverviewTabProps {
  allReservations: Reservation[];
  approverEmail?: string | null;
  availableCount: number;
  buildingId: string;
  buildingName: string;
  computeEffectiveStatus: (room: Room) => { status: string; detail: string };
  currentUserId?: string | null;
  dashboardSummary: AdminDashboardSummary | null;
  ongoingCount: number;
  onReload: () => Promise<void>;
  pendingCount: number;
  requests: Reservation[];
  reservedCount: number;
  rooms: Room[];
  setActiveTab: (tab: AdminTab) => void;
  unavailableCount: number;
}

interface DashboardSectionProps {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title: string;
}

interface SummaryMetricCardProps {
  action?: () => void;
  detail?: string;
  label: string;
  tone: string;
  value: number;
}

const ROOM_FILTERS: RoomStatusFilter[] = [
  'All',
  'Available',
  'Reserved',
  'Occupied',
  'Unavailable',
];

const ROOM_PREVIEW_LIMIT = 5;
const ROOM_SEARCH_LIMIT = 25;

function DashboardSection({
  action,
  children,
  className = '',
  eyebrow,
  title,
}: Readonly<DashboardSectionProps>) {
  return (
    <section className={`glass-card p-4 backdrop-blur-xl sm:p-5 ${className}`.trim()}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-extrabold text-black">{title}</h3>
          {eyebrow ? (
            <p className="mt-0.5 truncate text-[11px] font-bold text-black/50">
              {eyebrow}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryMetricCard({
  action,
  detail,
  label,
  tone,
  value,
}: Readonly<SummaryMetricCardProps>) {
  const content = (
    <>
      <div className={`mb-2 h-1 w-8 rounded-full ${tone}`} />
      <p className="truncate text-[11px] font-bold text-black/55">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none text-black">{value}</p>
      {detail ? (
        <p className="mt-1 truncate text-[10px] font-bold text-black/40">
          {detail}
        </p>
      ) : null}
    </>
  );

  if (action) {
    return (
      <button
        type="button"
        onClick={action}
        className="glass-card flex min-h-[96px] w-full flex-col items-start justify-start appearance-none p-4 text-left align-top transition-all hover:!border-primary/30 hover:shadow-xl"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="glass-card flex min-h-[96px] flex-col items-start justify-start p-4">
      {content}
    </div>
  );
}

function getRoomStatusAccent(status: string) {
  switch (status) {
    case 'Available':
      return 'bg-green-500';
    case 'Reserved':
      return 'bg-blue-500';
    case 'Occupied':
      return 'bg-orange-500';
    case 'Unavailable':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getReservationDates(request: Reservation) {
  return request.dates?.length ? request.dates : request.date ? [request.date] : [];
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

export default function AdminOverviewTab({
  allReservations,
  approverEmail,
  availableCount,
  buildingId,
  buildingName,
  computeEffectiveStatus,
  currentUserId,
  dashboardSummary,
  ongoingCount,
  onReload,
  pendingCount,
  requests,
  reservedCount,
  rooms,
  setActiveTab,
  unavailableCount,
}: Readonly<AdminOverviewTabProps>) {
  const [roomSearch, setRoomSearch] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState<RoomStatusFilter>('All');
  const [previewRooms, setPreviewRooms] = useState<Room[]>(rooms);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reservationActionError, setReservationActionError] = useState('');

  const normalizedRoomSearch = roomSearch.trim();

  useEffect(() => {
    setPreviewRooms(rooms);
  }, [rooms]);

  useEffect(() => {
    let isCancelled = false;
    const hasRoomFilter =
      normalizedRoomSearch.length > 0 || roomStatusFilter !== 'All';

    if (!hasRoomFilter) {
      setPreviewRooms(rooms);
      setRoomError('');
      setIsLoadingRooms(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsLoadingRooms(true);
      setRoomError('');

      try {
        const snapshot = await fetchAdminDashboardSnapshot(buildingId, {
          includeApprovedReservations: false,
          includePendingRequests: false,
          includeRoomHistory: false,
          includeRooms: true,
          includeSchedules: false,
          includeSummary: false,
          roomLimit: ROOM_SEARCH_LIMIT,
          roomSearch: normalizedRoomSearch || undefined,
          roomStatus: roomStatusFilter === 'All' ? undefined : roomStatusFilter,
        });

        if (!isCancelled) {
          setPreviewRooms(snapshot.rooms);
        }
      } catch (error) {
        if (!isCancelled) {
          setRoomError(
            error instanceof Error ? error.message : 'Unable to load room preview.'
          );
          setPreviewRooms([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRooms(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [buildingId, normalizedRoomSearch, roomStatusFilter, rooms]);

  const dashboardStats: Array<{
    action?: () => void;
    detail?: string;
    label: string;
    tone: string;
    value: number;
  }> = [
    {
      label: 'Total Rooms',
      detail: `${unavailableCount} unavailable`,
      value: dashboardSummary?.totalRooms ?? rooms.length,
      tone: 'bg-primary',
    },
    {
      label: 'Available',
      value: availableCount,
      tone: 'bg-green-500',
    },
    {
      label: 'Reserved',
      value: reservedCount,
      tone: 'bg-blue-500',
    },
    {
      action: () => setActiveTab('pending'),
      label: 'Pending Requests',
      value: pendingCount,
      tone: 'bg-yellow-500',
    },
    {
      label: 'Occupied',
      value: ongoingCount,
      tone: 'bg-orange-500',
    },
  ];

  const dashboardRoomRows = useMemo(
    () =>
      previewRooms
        .map((room) => ({
          room,
          effective: computeEffectiveStatus(room),
          floorLabel: getFloorDisplayLabel(room.floor, {
            id: buildingId,
            name: buildingName,
          }),
        }))
        .sort(
          (left, right) =>
            left.floorLabel.localeCompare(right.floorLabel) ||
            left.room.name.localeCompare(right.room.name, undefined, { numeric: true })
        ),
    [buildingId, buildingName, computeEffectiveStatus, previewRooms]
  );
  const visibleRooms = dashboardRoomRows.slice(0, ROOM_PREVIEW_LIMIT);
  const hasMoreRoomRows =
    dashboardRoomRows.length > ROOM_PREVIEW_LIMIT ||
    (roomStatusFilter === 'All' &&
      normalizedRoomSearch.length === 0 &&
      Boolean(dashboardSummary?.roomsHasMore));
  const latestRequests = requests.slice(0, 3);
  const hiddenPendingCount = Math.max(0, pendingCount - latestRequests.length);

  const runApprove = async (reservationId: string) => {
    if (!approverEmail) {
      setReservationActionError('Your approver email is unavailable.');
      return;
    }

    setReservationActionError('');
    setActionLoading(reservationId);

    try {
      await approveReservation(reservationId, approverEmail);
      await onReload();
    } catch (error) {
      setReservationActionError(
        error instanceof Error ? error.message : 'Failed to approve reservation.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const runReject = async (reservationId: string) => {
    if (!approverEmail) {
      setReservationActionError('Your approver email is unavailable.');
      return;
    }

    if (!rejectReason.trim()) {
      setReservationActionError('Enter a rejection reason first.');
      return;
    }

    setReservationActionError('');
    setActionLoading(reservationId);

    try {
      await rejectReservation(reservationId, approverEmail, rejectReason.trim());
      setRejectingRequestId(null);
      setRejectReason('');
      await onReload();
    } catch (error) {
      setReservationActionError(
        error instanceof Error ? error.message : 'Failed to reject reservation.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const runDelete = async (reservationId: string) => {
    if (!currentUserId) {
      setReservationActionError('Your account is unavailable for deleting requests.');
      return;
    }

    setReservationActionError('');
    setActionLoading(reservationId);

    try {
      await deleteReservation(reservationId, currentUserId);
      await onReload();
    } catch (error) {
      setReservationActionError(
        error instanceof Error ? error.message : 'Failed to delete reservation.'
      );
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {dashboardStats.map((stat) => (
          <SummaryMetricCard
            key={stat.label}
            action={stat.action}
            detail={stat.detail}
            label={stat.label}
            tone={stat.tone}
            value={stat.value}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.95fr)]">
        <DashboardSection
          title="Live Room Status"
          eyebrow={`${visibleRooms.length} shown${
            hasMoreRoomRows ? ` of ${dashboardSummary?.totalRooms ?? 'many'}` : ''
          }`}
          action={
            <button
              type="button"
              onClick={() => setActiveTab('manage-rooms')}
              className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary transition-all hover:bg-primary/15"
            >
              View All Rooms
            </button>
          }
        >
          <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <span className="sr-only">Search rooms</span>
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/35"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" strokeWidth="2" />
              </svg>
              <input
                type="search"
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
                placeholder="Search rooms"
                className="glass-input h-9 w-full bg-dark/5 pl-7 pr-3 text-xs font-bold text-black placeholder:text-black/35"
              />
            </label>

            <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-white/45 bg-white/55 p-1 shadow-inner backdrop-blur-xl">
              {ROOM_FILTERS.map((filter) => {
                const isActive = roomStatusFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setRoomStatusFilter(filter)}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                      isActive
                        ? 'bg-white text-primary shadow-sm'
                        : 'text-black/60 hover:bg-white/80 hover:text-black'
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          {roomError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {roomError}
            </p>
          ) : null}

          {isLoadingRooms ? (
            <p className="dashboard-empty-state rounded-2xl px-3 py-3 text-center text-xs font-bold text-black/60">
              Loading room preview...
            </p>
          ) : visibleRooms.length === 0 ? (
            <p className="dashboard-empty-state rounded-2xl px-3 py-5 text-center text-xs font-bold text-black/60">
              No rooms match this view.
            </p>
          ) : (
            <div className="space-y-1.5">
              {visibleRooms.map(({ room, effective, floorLabel }) => (
                <div
                  key={room.id}
                  className="dashboard-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${getRoomStatusAccent(
                        effective.status
                      )}`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-black">
                        {room.name}
                      </p>
                      <p className="truncate text-[10px] font-bold text-black/50">
                        {floorLabel} | Cap {room.capacity}
                        {effective.detail ? ` | ${effective.detail}` : ''}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={effective.status} />
                </div>
              ))}
              {hasMoreRoomRows ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('manage-rooms')}
                  className="w-full rounded-lg px-2 py-1.5 text-center text-[11px] font-bold text-primary transition-all hover:bg-primary/5"
                >
                  View full room list
                </button>
              ) : null}
            </div>
          )}
        </DashboardSection>

        <DashboardSection
          title="Pending Requests"
          eyebrow={hiddenPendingCount > 0 ? `${hiddenPendingCount} more in queue` : 'Latest approvals'}
          action={
            requests.length > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-primary transition-all hover:bg-primary/5"
              >
                View all
              </button>
            ) : null
          }
        >
          {reservationActionError ? (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {reservationActionError}
            </p>
          ) : null}

          {latestRequests.length === 0 ? (
            <p className="dashboard-empty-state rounded-2xl px-3 py-5 text-center text-xs font-bold text-black/60">
              No requests waiting for approval.
            </p>
          ) : (
            <div className="space-y-2">
              {latestRequests.map((request) => {
                const isWorking = actionLoading === request.id;
                const isRejecting = rejectingRequestId === request.id;
                const isExpired = request.status === 'pending' && isExpiredReservation(request);

                return (
                  <article
                    key={request.id}
                    className="dashboard-row rounded-xl p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
                        {getInitials(request.userName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-extrabold text-black">
                            {request.userName}
                          </p>
                          <RoleBadge role={request.userRole} />
                          {isExpired ? <StatusBadge status="Expired" /> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] font-bold text-black/55">
                          {request.roomName} |{' '}
                          {formatReservationDates(request.dates, request.date)} |{' '}
                          {formatTimeRange(request.startTime, request.endTime)}
                        </p>
                        {request.purpose ? (
                          <p className="mt-1 truncate text-[11px] text-black/50">
                            {request.purpose}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {isRejecting ? (
                      <div className="mt-3">
                        <label className="sr-only" htmlFor={`reject-${request.id}`}>
                          Rejection reason
                        </label>
                        <textarea
                          id={`reject-${request.id}`}
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="Reason for rejection"
                          className="glass-input min-h-[72px] w-full resize-y bg-dark/5 px-3 py-2 text-xs text-black"
                        />
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {isExpired ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm('Delete this expired reservation request?')) {
                              return;
                            }

                            void runDelete(request.id);
                          }}
                          disabled={isWorking}
                          className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-700 transition-all hover:bg-red-500/15 disabled:opacity-50"
                        >
                          {isWorking ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : null}
                      {!isExpired ? (
                        <>
                          {isRejecting ? (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingRequestId(null);
                                setRejectReason('');
                              }}
                              className="rounded-lg border border-dark/10 bg-white px-3 py-1.5 text-[11px] font-bold text-black/65 transition-all hover:bg-dark/5"
                            >
                              Cancel
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              if (isRejecting) {
                                void runReject(request.id);
                                return;
                              }

                              setRejectingRequestId(request.id);
                              setRejectReason('');
                            }}
                            disabled={isWorking}
                            className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-700 transition-all hover:bg-red-500/15 disabled:opacity-50"
                          >
                            {isRejecting ? 'Confirm Reject' : 'Reject'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runApprove(request.id)}
                            disabled={isWorking}
                          className="rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-1.5 text-[11px] font-bold text-green-700 transition-all hover:bg-green-500/15 disabled:opacity-50"
                          >
                            {isWorking ? 'Working...' : 'Approve'}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </DashboardSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <BleSummaryCard
          activeBeaconsOverride={dashboardSummary?.activeBeacons}
          buildingName={buildingName}
          detailsHref="/admin/ble-status"
          rooms={rooms}
          totalBeaconsOverride={dashboardSummary?.totalBeacons}
          variant="compact"
        />

        <MyReservationTimetable
          compact
          compactVariant="today"
          currentUserId={currentUserId}
          reservations={allReservations}
        />
      </div>
    </div>
  );
}
