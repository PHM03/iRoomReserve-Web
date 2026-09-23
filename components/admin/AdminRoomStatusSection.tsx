'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminFloorFilter from '@/components/admin/AdminFloorFilter';
import type { Reservation } from '@/lib/reservations/reservations';
import type { RoomUnavailability } from '@/lib/reservations/roomAvailability';
import {
  isRoomScheduleActive,
  isRoomUnavailabilityActive,
  resolveRoomOperationalState,
} from '@/lib/rooms/roomStatus';
import { formatTime12h, getScheduleDisplayTitle, type Schedule } from '@/lib/schedules/schedules';
import { getPreferredDefaultFloorValue, sortFloorOptions } from '@/lib/buildings/floorLabels';
import type { Room } from '@/lib/rooms/rooms';

interface AdminRoomStatusSectionProps {
  buildingId: string;
  rooms: Room[];
  statusMonitorFloorGroups: Array<{ floor: string; label: string; rooms: Room[] }>;
  reservations: Reservation[];
  schedules: Schedule[];
  roomUnavailability: RoomUnavailability[];
  onStatusChange: (roomId: string, status: Room['status'], reason?: string | null) => void;
  pendingFinishReservationsByRoomId?: Map<string, Reservation>;
  onConfirmFinishedReservation?: (reservationId: string) => void;
  className?: string;
}

type ActivityFilter = 'All' | 'Available' | 'Unavailable' | 'Reserved' | 'Occupied';

function timestampLabel(value: Room['beaconLastConnectedAt'] | Room['beaconLastDisconnectedAt']) {
  const date = value?.toDate?.();
  return date ? date.toLocaleString() : null;
}

function bleLabel(room: Room) {
  const beaconId = room.bleBeaconId ?? room.beaconId;
  if (!beaconId) return 'No beacon configured';
  const connected = room.beaconConnected === true;
  const lastSeen = connected ? timestampLabel(room.beaconLastConnectedAt) : timestampLabel(room.beaconLastDisconnectedAt);
  return `${connected ? 'Connected' : 'Disconnected'}${lastSeen ? ` · Last ${connected ? 'connected' : 'disconnected'} ${lastSeen}` : ''}`;
}

function activityTone(activity: string) {
  if (activity === 'Occupied') return 'ui-badge-red';
  if (activity === 'Reserved' || activity === 'Class in progress') return 'ui-badge-blue';
  if (activity === 'Administratively unavailable' || activity === 'Time block') return 'ui-badge-red';
  return 'ui-badge-green';
}

function field(label: string, value: string) {
  return <div><dt className="text-[10px] font-extrabold uppercase tracking-wide text-black/45">{label}</dt><dd className="mt-0.5 text-xs font-bold text-black/75">{value}</dd></div>;
}

export default function AdminRoomStatusSection({
  buildingId,
  rooms,
  statusMonitorFloorGroups,
  reservations,
  schedules,
  roomUnavailability,
  onStatusChange,
  pendingFinishReservationsByRoomId,
  onConfirmFinishedReservation,
  className = '',
}: Readonly<AdminRoomStatusSectionProps>) {
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('All');
  const [now, setNow] = useState(() => new Date());
  const buildingRooms = useMemo(() => rooms.filter((room) => room.buildingId === buildingId), [buildingId, rooms]);
  const floorOptions = useMemo(() => sortFloorOptions(statusMonitorFloorGroups.map(({ floor, label }) => ({ value: floor, label }))), [statusMonitorFloorGroups]);
  const floorsWithAll = useMemo(() => [...floorOptions, { value: 'All', label: 'All Floors' }], [floorOptions]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!floorOptions.length) return;
    if (!floorFilter || (floorFilter !== 'All' && !floorsWithAll.some((option) => option.value === floorFilter))) {
      const timeoutId = window.setTimeout(() => setFloorFilter(getPreferredDefaultFloorValue(floorOptions)), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [floorFilter, floorOptions, floorsWithAll]);

  const roomViews = useMemo(() => buildingRooms.map((room) => {
    const schedule = schedules.find((candidate) => candidate.roomId === room.id && isRoomScheduleActive(candidate, now));
    const block = roomUnavailability.find((candidate) => candidate.roomId === room.id && isRoomUnavailabilityActive(candidate, now));
    const state = resolveRoomOperationalState(room, reservations, {
      activeSchedule: schedule,
      activeUnavailability: block,
      now,
    });
    const reservation = state.reservation;
    const pendingFinish = pendingFinishReservationsByRoomId?.get(room.id) ?? null;
    const activity = pendingFinish && state.condition === 'Available' ? 'Occupied' : state.activity;
    return { room, state, reservation, schedule, block, pendingFinish, activity };
  }), [buildingRooms, schedules, roomUnavailability, reservations, pendingFinishReservationsByRoomId, now]);

  const counts = useMemo(() => ({
    total: roomViews.length,
    available: roomViews.filter(({ state }) => state.condition === 'Available').length,
    unavailable: roomViews.filter(({ state }) => state.condition === 'Unavailable').length,
    inUse: roomViews.filter(({ activity }) => activity === 'Occupied' || activity === 'Reserved').length,
  }), [roomViews]);

  const filtered = roomViews.filter(({ room, activity, state }) => {
    const query = search.trim().toLowerCase();
    if (query && !room.name.toLowerCase().includes(query)) return false;
    if (floorFilter !== 'All' && room.floor !== floorFilter) return false;
    const filterActivity = state.condition === 'Unavailable' ? 'Unavailable' : activity;
    return activityFilter === 'All' || filterActivity === activityFilter;
  });

  if (!rooms.length) return <section className={className}><div className="glass-card p-4"><div className="dashboard-empty-state rounded-2xl p-12 text-center"><p className="text-sm text-black">No rooms configured. Add rooms first.</p></div></div></section>;

  return (
    <section className={className}>
      <div className="glass-card p-4 mb-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <label className="flex-1 min-w-[160px]"><span className="sr-only">Search rooms</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rooms…" className="glass-input h-9 w-full px-3 text-xs font-bold text-black placeholder:text-black/35" /></label>
          <AdminFloorFilter label="Filter by Floor:" options={floorsWithAll} value={floorFilter} onChange={setFloorFilter} />
          <label className="flex items-center gap-2 text-xs font-bold text-black/65">Activity
            <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)} className="glass-input h-9 px-2 text-xs font-bold text-black">
              {(['All', 'Available', 'Unavailable', 'Reserved', 'Occupied'] as ActivityFilter[]).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <span className="text-[11px] font-bold text-black/45 sm:ml-auto">{filtered.length} of {buildingRooms.length} rooms</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Total rooms', counts.total], ['Available', counts.available], ['Unavailable', counts.unavailable], ['Reserved / occupied', counts.inUse]].map(([label, value]) => <div key={label} className="rounded-xl border border-dark/10 bg-white/50 px-3 py-2"><p className="text-[10px] font-extrabold uppercase tracking-wide text-black/45">{label}</p><p className="text-lg font-extrabold text-black">{value}</p></div>)}
        </div>
      </div>

      {!filtered.length ? <div className="glass-card p-4"><div className="dashboard-empty-state rounded-2xl p-10 text-center"><p className="text-sm font-bold text-black/60">No rooms match your filters.</p></div></div> : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filtered.map(({ room, state, reservation, schedule, block, pendingFinish, activity }) => {
            const finishReservation = pendingFinish && onConfirmFinishedReservation ? pendingFinish : null;
            const floorLabel = floorOptions.find((option) => option.value === room.floor)?.label ?? room.floor;
            const relevantReservation = reservation?.status === 'approved' ? reservation : null;
            const displayedReservation = relevantReservation ?? pendingFinish;
            const activityLabel = state.condition === 'Unavailable' ? 'Administratively unavailable' : activity;
            const reservationWindow = displayedReservation ? `${displayedReservation.date} · ${formatTime12h(displayedReservation.startTime)}–${formatTime12h(displayedReservation.endTime)}` : 'No active reservation';
            const reservationLabel = relevantReservation
              ? `${relevantReservation.status} · ${reservationWindow}`
              : pendingFinish
                ? `Completed · ${reservationWindow} · awaiting finish`
                : 'No active reservation';
            const scheduleWindow = schedule ? `Class Schedule — ${formatTime12h(schedule.startTime)}–${formatTime12h(schedule.endTime)}` : null;
            const blockWindow = block ? `${block.date} · ${formatTime12h(block.startTime)}–${formatTime12h(block.endTime)}${block.reason ? ` · ${block.reason}` : ''}` : null;
            return <li key={room.id} className="glass-card min-w-0 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="truncate text-base font-extrabold text-black">{room.name}</h3><p className="mt-0.5 text-xs font-bold text-black/50">{floorLabel} · {room.roomType || 'Room'} · Capacity {room.capacity}</p></div>
                <div className="flex flex-wrap gap-1.5"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${room.status === 'Unavailable' ? 'ui-badge-red' : 'ui-badge-green'}`}>Condition: {room.status === 'Unavailable' ? 'Unavailable' : 'Available'}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${activityTone(activityLabel)}`}>{activityLabel}</span></div>
              </div>
              {room.status === 'Unavailable' && room.unavailableReason ? <p className="mt-2 text-xs font-bold text-red-700">Reason: {room.unavailableReason}</p> : null}
              <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-dark/10 pt-3 sm:grid-cols-2">
                {field('Reservation', reservationLabel)}
                {field('Requester', displayedReservation?.userName ?? '—')}
                {field('Occupancy / check-in', displayedReservation?.checkedInAt ? 'Checked in' : 'Not checked in')}
                {field('BLE beacon health', bleLabel(room))}
                {field('Active class', schedule ? `${getScheduleDisplayTitle(schedule)} · ${scheduleWindow}` : 'No active class')}
                {field('Active time block', blockWindow ?? 'None')}
              </dl>
              {finishReservation ? <p className="mt-3 text-[11px] font-bold text-black/55">Completed reservation is awaiting staff confirmation.</p> : null}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-dark/10 pt-3">
                {finishReservation ? <button type="button" onClick={() => onConfirmFinishedReservation?.(finishReservation.id)} className="ui-button-blue rounded-lg px-3 py-2 text-[11px] font-bold">Finish Reservation</button> : null}
                {room.status === 'Unavailable' ? <button type="button" onClick={() => onStatusChange(room.id, 'Available')} className="ui-button-green rounded-lg px-3 py-2 text-[11px] font-bold">Make available</button> : <button type="button" onClick={() => { const reason = window.prompt(`Reason for marking ${room.name} unavailable (optional):`); if (reason !== null) onStatusChange(room.id, 'Unavailable', reason.trim() || null); }} className="ui-button-red rounded-lg px-3 py-2 text-[11px] font-bold">Mark unavailable</button>}
              </div>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}
