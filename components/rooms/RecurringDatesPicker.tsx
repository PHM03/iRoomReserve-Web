'use client';

import 'react-day-picker/style.css';
import React, { useMemo } from 'react';
import { DayPicker } from 'react-day-picker';

import {
  type BookingSlot,
  fromIsoDateString,
  toIsoDateString,
} from '@/lib/reservations/roomAvailability';
import { isReservationDateSelectable } from '@/lib/reservations/timeSlots';

interface RecurringDatesPickerProps {
  bookedSlots: readonly BookingSlot[];
  minDate?: Date;
  onChange: (dates: string[]) => void;
  selectedDates: string[];
}

export default function RecurringDatesPicker({
  bookedSlots,
  minDate = new Date(),
  onChange,
  selectedDates,
}: Readonly<RecurringDatesPickerProps>) {
  const minSelectable = new Date(minDate);
  minSelectable.setHours(0, 0, 0, 0);
  const selected = useMemo(
    () => selectedDates
      .map(fromIsoDateString)
      .filter((date): date is Date => date !== undefined && date >= minSelectable && isReservationDateSelectable(date)),
    [minSelectable, selectedDates]
  );
  const partiallyBookedDates = useMemo(
    () => Array.from(new Set(bookedSlots.map((slot) => slot.date)))
      .map(fromIsoDateString)
      .filter((date): date is Date => date !== undefined && date >= minSelectable && isReservationDateSelectable(date)),
    [bookedSlots, minSelectable]
  );

  return (
    <div>
      <div className="rounded-2xl border border-dark/10 bg-white p-3">
        <DayPicker
          mode="multiple"
          selected={selected}
          onSelect={(dates) => onChange((dates ?? []).map(toIsoDateString).sort())}
          disabled={[{ before: minSelectable }, { dayOfWeek: [0] }]}
          hidden={{ dayOfWeek: [0] }}
          modifiers={{ partiallyBooked: partiallyBookedDates }}
          modifiersClassNames={{
            partiallyBooked: 'rdp-partially-booked-day',
            selected: 'rdp-selected-day',
          }}
          showOutsideDays
          fixedWeeks
          weekStartsOn={1}
          startMonth={new Date(minSelectable.getFullYear(), minSelectable.getMonth(), 1)}
        />
        <style>{`
          .rdp-root {
            --rdp-accent-color: #a12124;
            --rdp-accent-background-color: rgba(161, 33, 36, 0.12);
            --rdp-day-height: 2.4rem;
            --rdp-day-width: 16.666%;
            font-family: inherit;
            color: #1f2937;
          }
          .rdp-months,
          .rdp-month,
          .rdp-month_grid {
            width: 100%;
          }
          .rdp-month_grid {
            table-layout: fixed;
          }
          .rdp-weekday:last-child,
          .rdp-week .rdp-day:last-child {
            display: none;
          }
          .rdp-weekday {
            width: 16.666%;
          }
          .rdp-day_button {
            position: relative;
            border-radius: 0.6rem;
            font-weight: 600;
            width: 100%;
            height: 2.4rem;
            max-width: 100%;
          }
          .rdp-day_button:not([disabled]):not(.rdp-selected-day):hover {
            background-color: rgba(34, 197, 94, 0.18);
            color: #166534;
          }
          .rdp-day:not(.rdp-day_disabled):not(.rdp-selected-day) .rdp-day_button {
            background-color: rgba(34, 197, 94, 0.10);
            color: #166534;
          }
          .rdp-partially-booked-day .rdp-day_button {
            background-color: rgba(245, 158, 11, 0.14) !important;
            color: #92400e !important;
          }
          .rdp-partially-booked-day .rdp-day_button::after {
            content: '';
            position: absolute;
            top: 0.32rem;
            right: 0.32rem;
            width: 0.38rem;
            height: 0.38rem;
            border-radius: 9999px;
            background-color: #f59e0b;
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95);
          }
          .rdp-partially-booked-day .rdp-day_button:hover {
            background-color: rgba(245, 158, 11, 0.22) !important;
            color: #78350f !important;
          }
          .rdp-selected-day .rdp-day_button {
            background-color: #a12124 !important;
            color: #ffffff !important;
            text-decoration: none !important;
          }
          .rdp-selected-day .rdp-day_button::after {
            display: none;
          }
          .rdp-day_disabled .rdp-day_button {
            opacity: 0.35;
            text-decoration: none;
          }
        `}</style>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-black">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-200/80" />
          Partially booked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          Selected
        </span>
      </div>
      <p className="mt-2 text-[11px] text-black/60">
        Select dates on the calendar. Amber dates already have reservations, but you can still choose them if your time is available.
      </p>
    </div>
  );
}
