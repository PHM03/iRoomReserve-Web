import { useState, type CSSProperties } from 'react';

import type { Reservation } from '@/lib/reservations/reservations';
import type { Room } from '@/lib/rooms/rooms';
import {
  extractTimeString,
  formatDate,
  formatTime,
  formatTimeRange,
} from '@/lib/utils/dateTime';

interface RoomScheduleTimelineProps {
  error?: string | null;
  isLoading?: boolean;
  reservations: readonly Reservation[];
  rooms: readonly Room[];
  selectedDate: string;
}

interface TimelineReservation {
  endMinutes: number;
  id: string;
  purpose: string;
  reservation: Reservation;
  startMinutes: number;
}

interface PositionedReservation extends TimelineReservation {
  lane: number;
  laneCount: number;
}

const DEFAULT_START_MINUTES = 7 * 60;
const DEFAULT_END_MINUTES = 21 * 60;
const HOUR_MINUTES = 60;
const ROOM_LABEL_WIDTH = 180;
const TIMELINE_MIN_WIDTH = 840;
const LANE_HEIGHT = 56;
const MAX_VISIBLE_ROOMS = 5;

function parseTimeMinutes(value: string) {
  const normalized = extractTimeString(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * HOUR_MINUTES + minutes;
}

function getReservationDates(reservation: Reservation) {
  return reservation.dates?.length ? reservation.dates : [reservation.date];
}

function getVisibleReservations(reservations: readonly Reservation[], selectedDate: string) {
  return reservations.flatMap((reservation) => {
    if (
      reservation.status !== 'approved' ||
      !getReservationDates(reservation).includes(selectedDate)
    ) {
      return [];
    }

    const startMinutes = parseTimeMinutes(reservation.startTime);
    const endMinutes = parseTimeMinutes(reservation.endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return [];
    }

    return [{
      endMinutes,
      id: reservation.id,
      purpose: reservation.purpose?.trim() ?? '',
      reservation,
      startMinutes,
    } satisfies TimelineReservation];
  });
}

function positionOverlappingReservations(
  reservations: readonly TimelineReservation[]
): PositionedReservation[] {
  const ordered = [...reservations].sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      left.endMinutes - right.endMinutes ||
      left.id.localeCompare(right.id)
  );
  const lanes: number[] = [];
  const positioned = ordered.map((reservation) => {
    let lane = lanes.findIndex((laneEnd) => laneEnd <= reservation.startMinutes);
    if (lane < 0) {
      lane = lanes.length;
    }
    lanes[lane] = reservation.endMinutes;
    return { ...reservation, lane, laneCount: 0 };
  });

  return positioned.map((reservation) => ({
    ...reservation,
    laneCount: Math.max(1, lanes.length),
  }));
}

function formatHourLabel(minutes: number) {
  return formatTime(`${String(Math.floor(minutes / HOUR_MINUTES)).padStart(2, '0')}:00`);
}

export default function RoomScheduleTimeline({
  error,
  isLoading = false,
  reservations,
  rooms,
  selectedDate,
}: Readonly<RoomScheduleTimelineProps>) {
  const [roomSearch, setRoomSearch] = useState('');

  if (isLoading) {
    return (
      <section className="glass-card rounded-2xl p-5" aria-live="polite">
        <p className="dashboard-empty-state rounded-xl px-4 py-6 text-center text-sm font-bold text-black/60">
          Loading room schedule...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="glass-card rounded-2xl p-5" role="alert">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      </section>
    );
  }

  if (rooms.length === 0) {
    return (
      <section className="glass-card rounded-2xl p-5">
        <p className="dashboard-empty-state rounded-xl px-4 py-6 text-center text-sm font-bold text-black/60">
          No rooms available for this schedule.
        </p>
      </section>
    );
  }

  const normalizedRoomSearch = roomSearch.trim().toLocaleLowerCase();
  const matchingRooms = rooms.filter((room) =>
    room.name.toLocaleLowerCase().includes(normalizedRoomSearch)
  );
  const displayedRooms = matchingRooms.slice(0, MAX_VISIBLE_ROOMS);

  const visibleReservations = getVisibleReservations(reservations, selectedDate);
  const reservationsByRoom = new Map<string, TimelineReservation[]>();
  visibleReservations.forEach((reservation) => {
    const roomReservations = reservationsByRoom.get(reservation.reservation.roomId) ?? [];
    roomReservations.push(reservation);
    reservationsByRoom.set(reservation.reservation.roomId, roomReservations);
  });

  const roomsWithReservations = displayedRooms.map((room) => ({
    room,
    reservations: positionOverlappingReservations(
      reservationsByRoom.get(room.id) ?? []
    ),
  }));
  const allTimes = visibleReservations.flatMap(({ startMinutes, endMinutes }) => [
    startMinutes,
    endMinutes,
  ]);
  const startMinutes = Math.floor(
    Math.min(DEFAULT_START_MINUTES, ...allTimes) / HOUR_MINUTES
  ) * HOUR_MINUTES;
  const endMinutes = Math.ceil(
    Math.max(DEFAULT_END_MINUTES, ...allTimes) / HOUR_MINUTES
  ) * HOUR_MINUTES;
  const durationMinutes = endMinutes - startMinutes;
  const timelineWidth = Math.max(
    TIMELINE_MIN_WIDTH,
    (durationMinutes / HOUR_MINUTES) * 60
  );
  const hourTicks = Array.from(
    { length: durationMinutes / HOUR_MINUTES + 1 },
    (_, index) => startMinutes + index * HOUR_MINUTES
  );

  return (
    <section className="glass-card overflow-hidden rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-black">Room Schedule</h3>
          <p className="mt-0.5 text-xs font-bold text-black/50">{formatDate(selectedDate)}</p>
        </div>
        <label className="w-full sm:w-72">
          <span className="sr-only">Search rooms by name</span>
          <input
            type="search"
            value={roomSearch}
            onChange={(event) => setRoomSearch(event.target.value)}
            placeholder="Search rooms by name..."
            className="glass-input w-full px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-black/55" aria-live="polite">
          Showing {displayedRooms.length} of {matchingRooms.length}
          {normalizedRoomSearch ? ' matching' : ''} room{matchingRooms.length === 1 ? '' : 's'}
          {matchingRooms.length > MAX_VISIBLE_ROOMS ? ' · Search to find more' : ''}
        </p>
        {visibleReservations.length === 0 ? (
          <p className="text-xs font-bold text-black/50">
            No approved reservations for this date.
          </p>
        ) : null}
      </div>

      <div className="dashboard-table-shell overflow-x-auto rounded-xl">
        <div
          className="min-w-[1020px]"
          style={{
            width: `${ROOM_LABEL_WIDTH + timelineWidth}px`,
          }}
        >
          <div
            className="grid border-b border-white/35 bg-white/80"
            style={{
              gridTemplateColumns: `${ROOM_LABEL_WIDTH}px minmax(${TIMELINE_MIN_WIDTH}px, 1fr)`,
            }}
          >
            <div className="sticky left-0 z-10 flex items-end border-r border-white/35 bg-white px-3 py-3 text-[11px] font-extrabold uppercase tracking-wide text-black/55">
              Room
            </div>
            <div className="relative h-12" style={{ minWidth: timelineWidth }}>
              {hourTicks.map((tick) => {
                const position = ((tick - startMinutes) / durationMinutes) * 100;
                return (
                  <div
                    key={tick}
                    className="absolute bottom-0 top-0 -translate-x-1/2 border-l border-white/50"
                    style={{ left: `${position}%` }}
                  >
                    <span className="absolute bottom-2 left-0 -translate-x-1/2 whitespace-nowrap px-1 text-[10px] font-bold text-black/55">
                      {formatHourLabel(tick)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {displayedRooms.length === 0 ? (
            <div
              className="grid border-b border-white/35 last:border-b-0"
              style={{
                gridTemplateColumns: `${ROOM_LABEL_WIDTH}px minmax(${TIMELINE_MIN_WIDTH}px, 1fr)`,
              }}
            >
              <div className="sticky left-0 z-10 flex min-w-0 items-center border-r border-white/35 bg-white px-3 py-2">
                <span className="text-xs font-bold text-black/55">No matching rooms</span>
              </div>
              <div
                className="relative flex items-center bg-white/60 px-3 text-xs text-black/50"
                style={{ minWidth: timelineWidth, height: 68 }}
              >
                Try a different room name.
              </div>
            </div>
          ) : null}

          {roomsWithReservations.map(({ room, reservations: roomReservations }) => {
            const laneCount = Math.max(
              1,
              ...roomReservations.map((reservation) => reservation.laneCount)
            );
            const rowHeight = Math.max(68, laneCount * LANE_HEIGHT + 12);

            return (
              <div
                key={room.id}
                className="grid border-b border-white/35 last:border-b-0"
                style={{
                  gridTemplateColumns: `${ROOM_LABEL_WIDTH}px minmax(${TIMELINE_MIN_WIDTH}px, 1fr)`,
                }}
              >
                <div className="sticky left-0 z-10 flex min-w-0 items-center border-r border-white/35 bg-white px-3 py-2">
                  <span className="truncate text-xs font-extrabold text-black" title={room.name}>
                    {room.name}
                  </span>
                </div>
                <div
                  className="relative bg-white/60"
                  style={{ minWidth: timelineWidth, height: rowHeight }}
                >
                  {hourTicks.map((tick) => {
                    const position = ((tick - startMinutes) / durationMinutes) * 100;
                    return (
                      <span
                        key={tick}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 border-l border-dashed border-black/10"
                        style={{ left: `${position}%` }}
                      />
                    );
                  })}

                  {roomReservations.length === 0 ? (
                    <span className="absolute inset-y-0 left-3 flex items-center text-[11px] font-medium text-black/35">
                      No reservations
                    </span>
                  ) : (
                    roomReservations.map((item) => {
                      const left = ((item.startMinutes - startMinutes) / durationMinutes) * 100;
                      const width = ((item.endMinutes - item.startMinutes) / durationMinutes) * 100;
                      const blockStyle: CSSProperties = {
                        left: `${left}%`,
                        top: 6 + item.lane * LANE_HEIGHT,
                        width: `${width}%`,
                      };
                      const timeRange = formatTimeRange(
                        item.reservation.startTime,
                        item.reservation.endTime
                      );
                      const accessibleLabel = [item.purpose || 'Approved reservation', timeRange]
                        .filter(Boolean)
                        .join(', ');

                      return (
                        <div
                          key={item.id}
                          aria-label={accessibleLabel}
                          className="absolute z-[1] flex h-12 min-w-0 flex-col justify-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10 px-2 text-primary shadow-sm"
                          style={blockStyle}
                          title={`${item.purpose || 'Approved reservation'} · ${timeRange}`}
                        >
                          {item.purpose ? (
                            <span className="truncate text-[10px] font-extrabold leading-tight">
                              {item.purpose}
                            </span>
                          ) : null}
                          <span className="truncate text-[10px] font-bold leading-tight">
                            {timeRange}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
