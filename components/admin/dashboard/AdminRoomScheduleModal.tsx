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
import { scheduleConflictsWithReservationSlot } from '@/lib/schedules/scheduleConflicts';
import { getScheduleDisplayTitle, type Schedule } from '@/lib/schedules/schedules';
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
  status: 'available' | 'approved' | 'pending' | 'manual-unavailable' | 'class-scheduled' | 'past';
  classSchedule?: Schedule;
}

export default function AdminRoomScheduleModal({
  room,
  schedules = [],
  onClose,
}: Readonly<{ room: Room; schedules?: readonly Schedule[]; onClose: () => void }>) {
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

  const daySlots = useMemo<ScheduleSlot[]>(() => {
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    return getReservationTimeSlots(timeRange).map((slot) => {
      const past = date < localDate() || (date === localDate() && reservationTimeToMinutes(slot.startTime) <= new Date().getHours() * 60 + new Date().getMinutes());
      if (past) return { ...slot, status: 'past' };

      const approved = slots.find((item) => item.date === date && item.status === 'approved' && item.startTime < slot.endTime && item.endTime > slot.startTime);
      if (approved) return { ...slot, status: 'approved' };
      const manual = slots.find((item) => item.date === date && item.status === 'manual-unavailable' && item.startTime < slot.endTime && item.endTime > slot.startTime);
      if (manual) return { ...slot, status: 'manual-unavailable' };

      const classSchedule = schedules.find((schedule) => scheduleConflictsWithReservationSlot(schedule, {
        dayOfWeek,
        endTime: slot.endTime,
        roomId: room.id,
        startTime: slot.startTime,
      }));
      if (classSchedule) return { ...slot, status: 'class-scheduled', classSchedule };

      const pending = slots.find((item) => item.date === date && item.status === 'pending' && item.startTime < slot.endTime && item.endTime > slot.startTime);
      return { ...slot, status: pending ? 'pending' : 'available' };
    });
  }, [date, room.id, schedules, slots, timeRange]);

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
          <section className="rounded-2xl border border-dark/10 bg-white p-4"><div className="mb-3"><h4 className="text-sm font-bold text-black">Day Schedule</h4><p className="text-xs text-black/60">Select available slots to make them unavailable, or unavailable slots to restore them. Reserved, pending, class, and past slots cannot be changed.</p></div>
            <div className="mb-3 flex flex-wrap gap-2 text-[10px] font-bold">
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-green-400/60 bg-white" />Available</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-red-300/60 bg-red-100" />Reserved</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-gray-300/70 bg-gray-100" />Past / unavailable</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-300/60 bg-amber-100" />Pending</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-blue-300/60 bg-blue-100" />Class scheduled</span>
            </div>
            <div className="schedule-panel-scroll max-h-[24rem] space-y-2 overflow-y-auto pr-1">{daySlots.map((slot) => {
              const selected = selectedSlots.some((item) => item.startTime === slot.startTime);
              const disabled = slot.status === 'approved' || slot.status === 'pending' || slot.status === 'past' || slot.status === 'class-scheduled';
              const statusLabel = slot.status === 'approved' ? 'Reserved' : slot.status === 'pending' ? 'Pending' : slot.status === 'manual-unavailable' ? 'Unavailable' : slot.status === 'class-scheduled' ? (slot.classSchedule ? getScheduleDisplayTitle(slot.classSchedule) : 'Class scheduled') : slot.status === 'past' ? 'Past' : 'Available';
              const slotClass = slot.status === 'approved' ? 'schedule-slot-reserved' : slot.status === 'pending' ? 'schedule-slot-pending' : slot.status === 'available' ? 'schedule-slot-available' : 'schedule-slot-unavailable';
              const selectedClass = selected ? 'schedule-slot-selected' : '';
              const labelClass = slot.status === 'approved' ? 'border border-red-200/90 bg-red-50/95 text-red-700' : slot.status === 'pending' ? 'border border-amber-200/90 bg-amber-50/95 text-amber-700' : slot.status === 'class-scheduled' ? 'border border-blue-200/90 bg-blue-50/95 text-blue-700' : slot.status === 'available' ? 'border border-green-200/80 bg-green-50/90 text-green-700' : 'border border-gray-200/90 bg-gray-100/95 text-gray-600';
              const timeClass = slot.status === 'approved' || slot.status === 'class-scheduled' || slot.status === 'manual-unavailable' || slot.status === 'past' ? 'line-through opacity-70' : '';
              return <button key={slot.startTime} type="button" disabled={disabled || saving} onClick={() => selectSlot(slot)} title={slot.classSchedule ? getScheduleDisplayTitle(slot.classSchedule) : undefined} className={`schedule-slot flex h-14 w-full items-center gap-3 rounded-xl px-3 text-xs font-bold transition-all ${slotClass} ${selectedClass} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <span className={`min-w-[6.75rem] text-left ${timeClass}`}>{formatReservationTimeSlot(slot)}</span>
                <span className={`ml-auto inline-flex min-w-[6.8rem] shrink-0 items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold ${labelClass}`}>{statusLabel}</span>
              </button>;
            })}</div>
            <button type="button" disabled={selectedSlots.length === 0 || saving} onClick={markSelectionUnavailable} className="mt-4 w-full rounded-xl bg-[#a12124] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#8f1c1f] disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : restoringAvailability ? 'Mark as Available' : 'Mark as Unavailable'}</button>
          </section>
        </div>
        {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      </div>
    </div>
  );
}
