'use client';

import { formatReservationWindow } from '@/lib/rooms/roomStatus';
import type { OperationalRoomStatusViewItem } from '@/lib/rooms/roomStatusView';
import { formatTime12h } from '@/lib/schedules/schedules';

interface RoomListProps {
  items: OperationalRoomStatusViewItem[];
  onFinishReservation?: (reservationId: string) => void;
  finishingReservationId?: string | null;
}

function activityTone(activity: string) {
  if (activity === 'Occupied' || activity === 'Administratively unavailable' || activity === 'Time block') {
    return 'ui-badge-red';
  }
  if (activity === 'Reserved' || activity === 'Class in progress') {
    return 'ui-badge-blue';
  }
  return 'ui-badge-green';
}

function timestampLabel(value: { toDate: () => Date } | null | undefined) {
  const date = value?.toDate();
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : null;
}

function bleLabel(room: OperationalRoomStatusViewItem['room']) {
  const beaconId = room.bleBeaconId ?? room.beaconId;
  if (!beaconId) return 'No beacon configured';

  const connected = room.beaconConnected === true;
  const lastSeen = timestampLabel(
    connected ? room.beaconLastConnectedAt : room.beaconLastDisconnectedAt
  );
  const deviceName = room.beaconDeviceName?.trim();
  return `${connected ? 'Connected' : 'Disconnected'}${deviceName ? ` · ${deviceName}` : ''}${lastSeen ? ` · Last ${connected ? 'connected' : 'disconnected'} ${lastSeen}` : ''}`;
}

function field(label: string, value: string) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-extrabold uppercase tracking-wide text-black/45">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-bold text-black/75">{value}</dd>
    </div>
  );
}

export default function RoomList({
  items,
  onFinishReservation,
  finishingReservationId,
}: Readonly<RoomListProps>) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dark/10 bg-dark/5 p-6 text-center">
        <p className="text-sm text-black">No rooms match the selected filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const { room, state, activity, activeSchedule, activeUnavailability } = item;
        const reservation = item.reservation;
        const isPendingFinish = reservation?.status === 'completed';
        const reservationLabel = reservation
          ? `${reservation.status === 'completed' ? 'Completed · awaiting finish' : reservation.status} · ${formatReservationWindow(reservation)}`
          : 'No active reservation';
        const requester = reservation?.userName ?? '—';
        const occupancy = reservation?.checkedInAt
          ? 'Checked in'
          : reservation
            ? 'Not checked in'
            : 'No active check-in';
        const presenceStatus = (reservation as (typeof reservation & { presenceStatus?: string }) | null)?.presenceStatus;
        const courseCode = activeSchedule?.courseCode?.trim() ?? '';
        const section = activeSchedule?.section?.trim() ?? '';
        const classTitle = courseCode && section
          ? `${courseCode} - ${section}`
          : courseCode || section || activeSchedule?.subjectName || 'Class';
        const scheduleLabel = activeSchedule
          ? `${classTitle} · ${formatTime12h(activeSchedule.startTime ?? '')}–${formatTime12h(activeSchedule.endTime ?? '')}`
          : 'No active class';
        const timeBlockLabel = activeUnavailability
          ? `${activeUnavailability.date} · ${formatTime12h(activeUnavailability.startTime)}–${formatTime12h(activeUnavailability.endTime)}${activeUnavailability.reason ? ` · ${activeUnavailability.reason}` : ''}`
          : 'None';
        const isFinishing = item.finishReservation?.id === finishingReservationId;

        return (
          <article key={room.id} className="glass-card min-w-0 border-l-4 border-primary/35 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold text-black">{room.name}</h3>
                <p className="mt-1 text-sm text-black">
                  {room.floor} · {room.roomType || 'Room'} · Capacity {room.capacity}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${state.condition === 'Unavailable' ? 'ui-badge-red' : 'ui-badge-green'}`}>
                  Condition: {state.condition}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${activityTone(activity)}`}>
                  {activity}
                </span>
              </div>
            </div>

            {state.condition === 'Unavailable' && room.unavailableReason ? (
              <p className="mt-2 text-xs font-bold text-red-700">Reason: {room.unavailableReason}</p>
            ) : null}

            <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-dark/10 pt-3 sm:grid-cols-2">
              {field('Reservation', reservationLabel)}
              {field('Requester', requester)}
              {item.finishReservation && item.finishReservation.id !== reservation?.id
                ? field('Finish target', `${item.finishReservation.status} · ${formatReservationWindow(item.finishReservation)}`)
                : null}
              {field('Check-in', occupancy)}
              {presenceStatus ? field('Presence monitor', presenceStatus.replaceAll('_', ' ')) : null}
              {field('Beacon health', bleLabel(room))}
              {field('Active class', scheduleLabel)}
              {field('Active time block', timeBlockLabel)}
            </dl>

            {item.finishReservation && onFinishReservation ? (
              <div className="mt-4 border-t border-dark/10 pt-3">
                <button
                  type="button"
                  disabled={Boolean(finishingReservationId)}
                  onClick={() => onFinishReservation(item.finishReservation!.id)}
                  className="ui-button-blue rounded-lg px-3 py-2 text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
                >
                  {isFinishing ? 'Finishing…' : 'Finish Reservation'}
                </button>
                {isPendingFinish ? (
                  <p className="mt-2 text-[11px] font-bold text-black/55">Completed reservation is awaiting staff confirmation.</p>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
