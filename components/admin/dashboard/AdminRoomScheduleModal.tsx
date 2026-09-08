'use client';

import { useEffect, useMemo, useState } from 'react';

import RoomAvailabilityPicker from '@/components/rooms/RoomAvailabilityPicker';
import { inferCampusFromBuilding } from '@/lib/buildings/campuses';
import {
  onBookedDatesByRoom,
  onEnrichedSlotsByRoom,
  type BookingSlot,
  type EnrichedBookingSlot,
} from '@/lib/reservations/roomAvailability';
import {
  clearManualRoomUnavailability,
  setManualRoomUnavailability,
} from '@/lib/reservations/manualUnavailability';
import {
  formatReservationTimeSlot,
  getReservationTimeSlots,
  reservationTimeToMinutes,
} from '@/lib/reservations/timeSlots';
import type { Room } from '@/lib/rooms/rooms';

const TIME_RANGES = {
  digi: { startMinutes: 7 * 60, endMinutes: 21 * 60 },
  main: { startMinutes: 7 * 60, endMinutes: 18 * 60 },
} as const;

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface ScheduleSlot {
  endTime: string;
  startTime: string;
  status: 'available' | 'approved' | 'pending' | 'manual-unavailable' | 'past';
}

export default function AdminRoomScheduleModal({
  room,
  onClose,
}: Readonly<{ room: Room; onClose: () => void }>) {
  const [date, setDate] = useState(localDate);
  const [bookedSlots, setBookedSlots] = useState<BookingSlot[]>([]);
  const [slots, setSlots] = useState<EnrichedBookingSlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<ScheduleSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const campus = inferCampusFromBuilding({ id: room.buildingId, name: room.buildingName }) ?? 'main';
  const timeRange = TIME_RANGES[campus];

  useEffect(() => onBookedDatesByRoom(room.id, setBookedSlots), [room.id]);
  useEffect(() => onEnrichedSlotsByRoom(room.id, setSlots), [room.id]);
  useEffect(() => setSelectedSlots([]), [date, room.id]);

  const daySlots = useMemo<ScheduleSlot[]>(
    () => getReservationTimeSlots(timeRange).map((slot) => {
      const matching = slots.find((item) => item.date === date && item.startTime < slot.endTime && item.endTime > slot.startTime);
      const past = date < localDate() || (date === localDate() && reservationTimeToMinutes(slot.startTime) <= new Date().getHours() * 60 + new Date().getMinutes());
      return { ...slot, status: matching?.status ?? (past ? 'past' : 'available') };
    }),
    [date, slots, timeRange]
  );

  function selectSlot(slot: ScheduleSlot) {
    if (
      saving ||
      (slot.status !== 'available' && slot.status !== 'manual-unavailable')
    ) {
      return;
    }
    setError('');
    setSelectedSlots((current) => {
      const selected = current.some((item) => item.startTime === slot.startTime);
      if (selected) return current.filter((item) => item.startTime !== slot.startTime);
      if (current.length > 0 && current[0].status !== slot.status) {
        setError('Select either available slots or unavailable slots, not both at once.');
        return current;
      }
      return [...current, slot].sort((left, right) => left.startTime.localeCompare(right.startTime));
    });
  }

  async function markSelectionUnavailable() {
    if (selectedSlots.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const restoringAvailability = selectedSlots[0]?.status === 'manual-unavailable';
      await Promise.all(
        selectedSlots.map((slot) => {
          const input = { date, startTime: slot.startTime, endTime: slot.endTime };
          return restoringAvailability
            ? clearManualRoomUnavailability(room.id, input)
            : setManualRoomUnavailability(room.id, input);
        })
      );
      setSelectedSlots([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update room availability.');
    } finally {
      setSaving(false);
    }
  }

  const restoringAvailability = selectedSlots[0]?.status === 'manual-unavailable';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`Schedule for ${room.name}`}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-[#f8f8f8] p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-xl font-bold text-black">{room.name} schedule</h3><p className="text-sm text-black/60">View bookings and select any number of slots to update availability.</p></div><button type="button" onClick={onClose} className="rounded-lg border border-dark/10 px-3 py-1.5 text-sm font-bold hover:bg-dark/5">Close</button></div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div><p className="mb-2 text-sm font-bold text-black">Date</p><RoomAvailabilityPicker bookedSlots={bookedSlots} value={date} onChange={setDate} hideLegend /></div>
          <section className="rounded-2xl border border-dark/10 bg-white p-4"><div className="mb-3"><h4 className="text-sm font-bold text-black">Day Schedule</h4><p className="text-xs text-black/60">Select available slots to make them unavailable, or unavailable slots to restore them. Reserved and pending slots cannot be changed.</p></div>
            <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">{daySlots.map((slot) => { const selected = selectedSlots.some((item) => item.startTime === slot.startTime); const disabled = slot.status === 'approved' || slot.status === 'pending' || slot.status === 'past'; const label = slot.status === 'approved' ? 'Reserved' : slot.status === 'pending' ? 'Pending' : slot.status === 'manual-unavailable' ? 'Unavailable' : 'Available'; const tone = slot.status === 'approved' ? 'border-red-200 bg-red-50 text-red-700' : slot.status === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-700' : slot.status === 'manual-unavailable' ? selected ? 'border-red-700 bg-red-200 text-red-900 ring-1 ring-red-500' : 'border-red-300 bg-red-100 text-red-800' : slot.status === 'past' ? 'border-gray-200 bg-gray-50 text-gray-500' : selected ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/25' : 'border-green-200 bg-green-50 text-green-700'; return <button key={slot.startTime} type="button" disabled={disabled || saving} onClick={() => selectSlot(slot)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-xs font-bold transition-colors ${tone} ${disabled ? 'cursor-not-allowed opacity-75' : 'hover:brightness-95'}`}><span>{formatReservationTimeSlot(slot)}</span><span className="ml-auto text-[10px]">{label}</span></button>; })}</div>
            <button type="button" disabled={selectedSlots.length === 0 || saving} onClick={markSelectionUnavailable} className="mt-4 w-full rounded-xl bg-[#a12124] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#8f1c1f] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : restoringAvailability ? 'Mark as Available' : 'Mark as Unavailable'}</button>
          </section>
        </div>
        {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      </div>
    </div>
  );
}
