'use client';

import React, { useEffect, useMemo, useState } from 'react';

import {
  getNextScheduleSelection,
  isMultiSlotSelection,
  isSlotSelected as isSlotInsideSelection,
  type ScheduleSelection,
  type ScheduleSlotStatus,
} from '@/lib/reservations/dayScheduleSelection';
import type {
  EnrichedBookingSlot,
  UserActiveSlot,
} from '@/lib/reservations/roomAvailability';
import { formatTime } from '@/lib/utils/dateTime';

type SlotStatus = ScheduleSlotStatus;

interface TimeSlot {
  startTime: string;
  endTime: string;
  status: SlotStatus;
  conflictRoomName?: string;
}

interface DaySchedulePanelProps {
  date: string;
  roomEnrichedSlots: readonly EnrichedBookingSlot[];
  userActiveSlots: readonly UserActiveSlot[];
  currentUserId: string;
  currentRoomId: string;
  campusTimeRange: { startMinutes: number; endMinutes: number };
  selectedStartTime?: string;
  selectedEndTime?: string;
  onSelectionChange: (selection: ScheduleSelection | null) => void;
}

function minutesToTimeString(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function slotsOverlap(
  slotStart: string,
  slotEnd: string,
  rangeStart: string,
  rangeEnd: string
): boolean {
  return slotStart < rangeEnd && slotEnd > rangeStart;
}

function selectionsMatch(
  left: ScheduleSelection | null,
  right: ScheduleSelection | null
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.startTime === right.startTime && left.endTime === right.endTime;
}

export default function DaySchedulePanel({
  date,
  roomEnrichedSlots,
  userActiveSlots,
  currentUserId,
  currentRoomId,
  campusTimeRange,
  selectedStartTime = '',
  selectedEndTime = '',
  onSelectionChange,
}: Readonly<DaySchedulePanelProps>) {
  const [now, setNow] = useState(() => new Date());
  const [toast, setToast] = useState<{
    message: string;
    type: 'info' | 'warning' | 'error';
  } | null>(null);
  const currentSelection =
    selectedStartTime && selectedEndTime
      ? {
          startTime: selectedStartTime,
          endTime: selectedEndTime,
        }
      : null;
  const multiSlotSelection = isMultiSlotSelection(currentSelection);
  const singleSlotSelection = Boolean(currentSelection) && !multiSlotSelection;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const timeSlots = useMemo<TimeSlot[]>(() => {
    const slots: TimeSlot[] = [];
    const { startMinutes, endMinutes } = campusTimeRange;
    const today = toLocalIsoDate(now);
    const isBeforeToday = date < today;
    const isToday = date === today;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const roomSlotsForDate = roomEnrichedSlots.filter((slot) => slot.date === date);
    const userSlotsForDate = userActiveSlots.filter((slot) => slot.date === date);

    for (let minutes = startMinutes; minutes < endMinutes; minutes += 60) {
      const slotStart = minutesToTimeString(minutes);
      const slotEnd = minutesToTimeString(minutes + 60);

      if (isBeforeToday || (isToday && minutes <= nowMinutes)) {
        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
          status: 'past',
        });
        continue;
      }

      const roomApprovedConflict = roomSlotsForDate.find(
        (slot) =>
          slot.status === 'approved' &&
          slot.userId !== currentUserId &&
          slotsOverlap(slotStart, slotEnd, slot.startTime, slot.endTime)
      );

      if (roomApprovedConflict) {
        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
          status: 'reserved-others',
        });
        continue;
      }

      const userCrossRoomConflict = userSlotsForDate.find(
        (slot) =>
          slot.roomId !== currentRoomId &&
          slotsOverlap(slotStart, slotEnd, slot.startTime, slot.endTime)
      );

      if (userCrossRoomConflict) {
        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
          status: 'user-conflict',
          conflictRoomName: userCrossRoomConflict.roomName,
        });
        continue;
      }

      const roomPendingConflict = roomSlotsForDate.find(
        (slot) =>
          slot.status === 'pending' &&
          slot.userId !== currentUserId &&
          slotsOverlap(slotStart, slotEnd, slot.startTime, slot.endTime)
      );

      if (roomPendingConflict) {
        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
          status: 'pending-others',
        });
        continue;
      }

      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
        status: 'available',
      });
    }

    return slots;
  }, [
    campusTimeRange,
    currentRoomId,
    currentUserId,
    date,
    now,
    roomEnrichedSlots,
    userActiveSlots,
  ]);

  function dismissToast() {
    setToast(null);
  }

  function handleSlotClick(slot: TimeSlot) {
    const nextSelectionResult = getNextScheduleSelection(
      timeSlots,
      currentSelection,
      slot
    );

    if (!selectionsMatch(nextSelectionResult.selection, currentSelection)) {
      onSelectionChange(nextSelectionResult.selection);
    }

    if (nextSelectionResult.reason === 'blocked-range') {
      setToast({
        message:
          'That range crosses a reserved or unavailable slot. Pick another end slot.',
        type: 'warning',
      });
      return;
    }

    switch (slot.status) {
      case 'available':
        dismissToast();
        return;
      case 'past':
        return;
      case 'reserved-others':
        setToast({
          message: 'This slot is already reserved. Pick another time if you want to continue.',
          type: 'warning',
        });
        return;
      case 'user-conflict':
        setToast({
          message: `Only one reservation at a time. You already have a booking at ${slot.conflictRoomName || 'another room'} during this time.`,
          type: 'error',
        });
        return;
      case 'pending-others':
        setToast({
          message:
            'This slot has a pending reservation from another user. You can still attempt to book, but it may conflict.',
          type: 'info',
        });
        return;
      default:
        return;
    }
  }

  function slotIsSelected(slot: TimeSlot): boolean {
    return isSlotInsideSelection(slot, currentSelection);
  }

  function getSlotClasses(status: SlotStatus, selected: boolean): string {
    const base =
      'schedule-slot flex h-14 w-full items-center gap-3 rounded-xl px-3 text-xs font-bold transition-all';
    const selectedClass = selected ? ' schedule-slot-selected' : '';

    switch (status) {
      case 'available':
        return `${base} cursor-pointer schedule-slot-available${selectedClass}`;
      case 'past':
        return `${base} cursor-not-allowed schedule-slot-unavailable${selectedClass}`;
      case 'reserved-others':
        return `${base} cursor-pointer schedule-slot-reserved${selectedClass}`;
      case 'user-conflict':
        return `${base} cursor-pointer schedule-slot-conflict${selectedClass}`;
      case 'pending-others':
        return `${base} cursor-pointer schedule-slot-pending${selectedClass}`;
      default:
        return base;
    }
  }

  function getSlotTimeClasses(status: SlotStatus): string {
    switch (status) {
      case 'reserved-others':
        return 'line-through opacity-80';
      case 'past':
        return 'line-through opacity-70';
      default:
        return '';
    }
  }

  function getStatusPillClasses(status: SlotStatus, selected: boolean): string {
    if (selected && status === 'available') {
      return 'border border-primary/20 bg-primary/10 text-primary';
    }

    switch (status) {
      case 'available':
        return 'border border-green-200/80 bg-green-50/90 text-green-700';
      case 'past':
        return 'border border-gray-200/90 bg-gray-100/95 text-gray-600';
      case 'reserved-others':
        return 'border border-red-200/90 bg-red-50/95 text-red-700';
      case 'user-conflict':
        return 'border border-red-300/80 bg-red-100/90 text-red-800';
      case 'pending-others':
        return 'border border-amber-200/90 bg-amber-50/95 text-amber-700';
      default:
        return 'border border-dark/10 bg-white/80 text-black/70';
    }
  }

  function getStatusIcon(status: SlotStatus) {
    switch (status) {
      case 'available':
        return (
          <svg
            className="h-3.5 w-3.5 shrink-0 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case 'past':
        return (
          <svg
            className="h-3.5 w-3.5 shrink-0 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 6v6l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        );
      case 'reserved-others':
        return (
          <svg
            className="h-3.5 w-3.5 shrink-0 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      case 'user-conflict':
        return (
          <svg
            className="h-3.5 w-3.5 shrink-0 text-red-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        );
      case 'pending-others':
        return (
          <svg
            className="h-3.5 w-3.5 shrink-0 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 6v6l4 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        );
      default:
        return null;
    }
  }

  function getStatusLabel(status: SlotStatus): string {
    switch (status) {
      case 'available':
        return 'Available';
      case 'past':
        return 'Unavailable';
      case 'reserved-others':
        return 'Reserved';
      case 'user-conflict':
        return 'Blocked';
      case 'pending-others':
        return 'Pending';
      default:
        return '';
    }
  }

  function getToastClasses(type: 'info' | 'warning' | 'error'): string {
    switch (type) {
      case 'info':
        return 'border-blue-300/60 bg-blue-50/95 text-blue-800';
      case 'warning':
        return 'border-amber-300/60 bg-amber-50/95 text-amber-800';
      case 'error':
        return 'border-red-300/60 bg-red-50/95 text-red-800';
      default:
        return '';
    }
  }

  const availableCount = timeSlots.filter((slot) => slot.status === 'available').length;

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h5 className="text-sm font-bold text-black">Day Schedule</h5>
          <p className="mt-0.5 text-[11px] text-black/60">
            {availableCount} of {timeSlots.length} slots available
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-dark/10 bg-dark/5 px-2.5 py-1 text-[10px] font-bold text-black/60">
          1-hour slots
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-[10px] font-bold">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-green-400/60 bg-white" />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-red-300/60 bg-red-100" />
          Reserved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-gray-300/70 bg-gray-100" />
          Past
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-primary/45 bg-primary/15" />
          Selected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-300/60 bg-amber-100" />
          Pending
        </span>
      </div>

      {singleSlotSelection && (
        <p className="mb-3 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] font-bold text-primary">
          Start slot selected. Click another available slot to fill the full range, or click the selected slot again to clear it.
        </p>
      )}

      <div className="schedule-panel-scroll grid max-h-[22rem] grid-cols-1 gap-2 overflow-y-auto pr-1">
        {timeSlots.map((slot) => {
          const selected = slotIsSelected(slot);

          return (
            <button
              key={slot.startTime}
              type="button"
              onClick={() => handleSlotClick(slot)}
              aria-disabled={slot.status === 'past'}
              aria-pressed={selected}
              className={getSlotClasses(slot.status, selected)}
            >
              {getStatusIcon(slot.status)}
              <span className={`min-w-[6.75rem] text-left ${getSlotTimeClasses(slot.status)}`}>
                {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
              </span>
              <span
                className={`ml-auto inline-flex min-w-[6.8rem] shrink-0 items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold ${getStatusPillClasses(
                  slot.status,
                  selected
                )}`}
              >
                {selected && slot.status === 'available'
                  ? singleSlotSelection
                    ? 'Start selected'
                    : 'Selected'
                  : getStatusLabel(slot.status)}
              </span>
            </button>
          );
        })}
      </div>

      {toast && (
        <div
          className={`mt-3 animate-in rounded-xl border p-3 text-xs font-bold ${getToastClasses(
            toast.type
          )}`}
        >
          <p>{toast.message}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={dismissToast}
              className="rounded-lg border border-dark/10 bg-white px-3 py-1.5 text-[11px] font-bold text-black transition-all hover:bg-dark/5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
