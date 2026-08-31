'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminFloorFilter from '@/components/admin/AdminFloorFilter';
import type { Reservation } from '@/lib/reservations/reservations';
import {
  getPreferredDefaultFloorValue,
  sortFloorOptions,
} from '@/lib/buildings/floorLabels';
import type { Room } from '@/lib/rooms/rooms';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminRoomStatusSectionProps {
  buildingId: string;
  rooms: Room[];
  statusMonitorFloorGroups: Array<{ floor: string; label: string; rooms: Room[] }>;
  computeEffectiveStatus: (room: Room) => { status: string; detail: string };
  onStatusChange: (roomId: string, status: Room['status']) => void;
  pendingFinishReservationsByRoomId?: Map<string, Reservation>;
  onConfirmFinishedReservation?: (reservationId: string) => void;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Sub-components ───────────────────────────────────────────────────────────

function EffectiveStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Available: 'ui-badge-green',
    Reserved: 'ui-badge-blue',
    Occupied: 'ui-badge-red',
    Unavailable: 'ui-badge-red',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] ?? 'ui-badge-gray'}`}>
      {status}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminRoomStatusSection({
  buildingId,
  rooms,
  statusMonitorFloorGroups,
  computeEffectiveStatus,
  onStatusChange,
  pendingFinishReservationsByRoomId,
  onConfirmFinishedReservation,
  className = '',
}: Readonly<AdminRoomStatusSectionProps>) {
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState<string>('');

  const buildingRooms = useMemo(
    () => rooms.filter((room) => room.buildingId === buildingId),
    [buildingId, rooms]
  );

  // Unique floors for filter
  const floorOptions = useMemo(
    () =>
      sortFloorOptions(
        statusMonitorFloorGroups.map((group) => ({
          value: group.floor,
          label: group.label,
        }))
      ),
    [statusMonitorFloorGroups]
  );

  const floorOptionsWithAll = useMemo(
    () => [...floorOptions, { value: 'All', label: 'All Floors' }],
    [floorOptions]
  );

  useEffect(() => {
    if (floorOptions.length === 0) {
      return;
    }

    let nextFloorFilter: string | null = null;

    if (!floorFilter) {
      nextFloorFilter = getPreferredDefaultFloorValue(floorOptions);
    } else if (floorFilter !== 'All') {
      const hasMatchingFloor = floorOptionsWithAll.some(
        (option) => option.value === floorFilter
      );

      if (!hasMatchingFloor) {
        nextFloorFilter = getPreferredDefaultFloorValue(floorOptions);
      }
    }

    if (!nextFloorFilter) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFloorFilter(nextFloorFilter);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [floorFilter, floorOptions, floorOptionsWithAll]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buildingRooms.filter((room) => {
      if (q && !room.name.toLowerCase().includes(q)) return false;
      if (floorFilter !== 'All' && room.floor !== floorFilter) return false;
      return true;
    });
  }, [buildingRooms, search, floorFilter]);

  const desktopGridTemplateColumns = useMemo(() => {
    const longestRoomNameLength = rooms.reduce(
      (maxLength, room) => Math.max(maxLength, room.name.trim().length),
      'Room'.length
    );
    const roomColumnWidth = `${Math.max(longestRoomNameLength + 2, 10)}ch`;

    return `${roomColumnWidth} minmax(0, 1fr) 110px 112px 120px 160px`;
  }, [rooms]);

  if (rooms.length === 0) {
    return (
      <section className={className}>
        <div className="glass-card p-4">
          <div className="dashboard-empty-state rounded-2xl p-12 text-center">
            <p className="text-sm text-black">No rooms configured. Add rooms first.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={className}>
      {/* ── Controls ── */}
      <div className="glass-card p-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          {/* Search */}
          <label className="relative flex-1 min-w-[160px]">
            <span className="sr-only">Search rooms</span>
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/35"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" strokeWidth="2" />
            </svg>
            <input
              id="room-status-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rooms…"
              className="glass-input h-9 w-full pl-8 pr-3 text-xs font-bold text-black placeholder:text-black/35"
            />
          </label>

          <AdminFloorFilter
            label="Filter by Floor:"
            options={floorOptionsWithAll}
            value={floorFilter}
            onChange={setFloorFilter}
          />

          <span className="text-[11px] font-bold text-black/40 ml-auto whitespace-nowrap">
            {filteredRooms.length} of {rooms.length} rooms
          </span>
        </div>
      </div>

      {/* ── Room list ── */}
      {filteredRooms.length === 0 ? (
        <div className="glass-card p-4">
          <div className="dashboard-empty-state rounded-2xl p-10 text-center">
            <p className="text-sm font-bold text-black/60">No rooms match your filters.</p>
          </div>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {/* Header row */}
          <div
            className="hidden md:grid items-center gap-3 px-4 py-2.5 border-b border-dark/10 bg-dark/5"
            style={{ gridTemplateColumns: desktopGridTemplateColumns }}
          >
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Room</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Floor</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Max. Capacity</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Room Status</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Manual Override</span>
          </div>

          <ul className="divide-y divide-dark/10">
            {filteredRooms.map((room) => {
              const effective = computeEffectiveStatus(room);
              const pendingFinishReservation =
                pendingFinishReservationsByRoomId?.get(room.id) ?? null;
              const floorLabel =
                floorOptions.find((option) => option.value === room.floor)?.label ??
                room.floor;

              return (
                <li key={room.id}>
                  {/* ── Main row ── */}
                  <div
                    className="grid items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors md:grid"
                    style={{ gridTemplateColumns: desktopGridTemplateColumns }}
                  >
                    {/* Name + detail */}
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-black truncate">{room.name}</p>
                      {effective.detail ? (
                        <p className="text-[10px] text-black/50 font-bold truncate">{effective.detail}</p>
                      ) : null}
                      {/* Mobile: floor + cap below name */}
                      <p className="md:hidden text-[10px] text-black/40 font-bold mt-0.5">
                        {floorLabel} · Cap {room.capacity}
                      </p>
                    </div>

                    {/* Floor */}
                    <p className="hidden md:block text-xs font-bold text-black/70 truncate">{floorLabel}</p>

                    {/* Capacity */}
                    <p className="hidden md:block text-xs font-bold text-black/70">{room.capacity}</p>

                    {/* Status badge */}
                    <div className="hidden md:flex">
                      <EffectiveStatusBadge status={effective.status} />
                    </div>

                    {/* Toggle buttons */}
                    <div className="flex gap-1.5">
                      {pendingFinishReservation && onConfirmFinishedReservation ? (
                        <button
                          type="button"
                          onClick={() =>
                            onConfirmFinishedReservation(pendingFinishReservation.id)
                          }
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ui-button-blue"
                        >
                          Finish Reservation
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onStatusChange(room.id, 'Available')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          room.status === 'Available' ? 'ui-button-green' : 'ui-button-gray'
                        }`}
                      >
                        Available
                      </button>
                      <button
                        type="button"
                        onClick={() => onStatusChange(room.id, 'Unavailable')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          room.status === 'Unavailable' ? 'ui-button-red' : 'ui-button-gray'
                        }`}
                      >
                        Unavailable
                      </button>
                    </div>

                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
