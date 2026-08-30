'use client';

import 'react-day-picker/style.css';
import React, { useMemo } from 'react';
import { DayPicker } from 'react-day-picker';

import {
  BookingSlot,
  fromIsoDateString,
  hasTimeConflict,
  toIsoDateString,
} from '@/lib/reservations/roomAvailability';

interface RoomAvailabilityPickerProps {
  bookedSlots: readonly BookingSlot[];
  startTime?: string;
  endTime?: string;
  value: string;
  onChange: (nextDate: string) => void;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  loading?: boolean;
  /**
   * When true, hides the legend (useful when a parent screen already shows it).
   */
  hideLegend?: boolean;
  className?: string;
}

const todayAtMidnight = (() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
})();

/**
 * A controlled date picker that marks dates with existing reservations without
 * blocking selection. The booked slots are passed in by the parent so the same
 * source of truth can be reused for submit-time validation.
 */
export default function RoomAvailabilityPicker({
  bookedSlots,
  startTime,
  endTime,
  value,
  onChange,
  minDate,
  maxDate,
  disabled = false,
  loading = false,
  hideLegend = false,
  className = '',
}: Readonly<RoomAvailabilityPickerProps>) {
  const minSelectable = minDate ?? todayAtMidnight;
  const navigationStartMonth = new Date(
    todayAtMidnight.getFullYear(),
    todayAtMidnight.getMonth(),
    1,
  );

  const partiallyBookedDateObjects = useMemo(
    () =>
      Array.from(new Set(bookedSlots.map((slot) => slot.date)))
        .map((isoDate) => fromIsoDateString(isoDate))
        .filter((date): date is Date => date !== undefined && date.getDay() !== 0),
    [bookedSlots]
  );

  const conflictingDateCount = useMemo(
    () =>
      (!startTime || !endTime
        ? []
        : Array.from(new Set(bookedSlots.map((slot) => slot.date))).filter((date) =>
            hasTimeConflict(date, startTime, endTime, [...bookedSlots])
          ))
        .length,
    [bookedSlots, endTime, startTime]
  );

  const selectedDate = fromIsoDateString(value);

  const disabledMatcher = useMemo(() => {
    const matchers: Array<
      Date | { before: Date } | { after: Date } | { dayOfWeek: number[] }
    > = [{ before: minSelectable }, { dayOfWeek: [0] }];

    if (maxDate) {
      matchers.push({ after: maxDate });
    }

    return matchers;
  }, [maxDate, minSelectable]);

  return (
    <div className={className}>
      <div
        className={`relative rounded-2xl border border-dark/10 bg-white/70 p-3 ${
          disabled || loading ? 'opacity-60' : ''
        }`}
      >
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={(nextDate) => {
            if (disabled) return;
            if (nextDate?.getDay() === 0) return;
            onChange(nextDate ? toIsoDateString(nextDate) : '');
          }}
          disabled={disabled ? () => true : disabledMatcher}
          hidden={{ dayOfWeek: [0] }}
          modifiers={{ partiallyBooked: partiallyBookedDateObjects }}
          modifiersClassNames={{
            partiallyBooked: 'rdp-partially-booked-day',
            selected: 'rdp-selected-day',
          }}
          showOutsideDays
          fixedWeeks
          weekStartsOn={1}
          startMonth={navigationStartMonth}
        />

        {loading && (
          <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-dark/10 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-black">
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing
          </div>
        )}

        {/* Per-component scoped styling so the picker matches the e-RoomReserve glass theme. */}
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

      {!hideLegend && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-black">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
            Available
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200/80" />
            Partially booked
          </span>
          {partiallyBookedDateObjects.length > 0 && (
            <span className="text-[11px] text-black/70">
              {startTime && endTime && conflictingDateCount > 0
                ? `${conflictingDateCount} highlighted day${conflictingDateCount === 1 ? '' : 's'} need a time check`
                : 'Amber dates already have reservations, but you can still select them.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
