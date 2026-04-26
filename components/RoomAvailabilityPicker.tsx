'use client';

import 'react-day-picker/style.css';
import React, { useMemo } from 'react';
import { DayPicker } from 'react-day-picker';

import {
  BookingDate,
  fromIsoDateString,
  toIsoDateString,
} from '@/lib/roomAvailability';

interface RoomAvailabilityPickerProps {
  bookedDates: readonly BookingDate[];
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
 * A controlled date picker that paints reserved dates red and lets the user
 * pick any other future date. The booked dates are passed in by the parent so
 * the same source of truth can be reused for submit-time double validation.
 */
export default function RoomAvailabilityPicker({
  bookedDates,
  value,
  onChange,
  minDate,
  maxDate,
  disabled = false,
  loading = false,
  hideLegend = false,
  className = '',
}: RoomAvailabilityPickerProps) {
  const minSelectable = minDate ?? todayAtMidnight;

  const bookedDateObjects = useMemo(
    () =>
      bookedDates
        .map((isoDate) => fromIsoDateString(isoDate))
        .filter((date): date is Date => Boolean(date)),
    [bookedDates]
  );

  const selectedDate = fromIsoDateString(value);

  const disabledMatcher = useMemo(() => {
    const matchers: Array<Date | { before: Date } | { after: Date }> = [
      { before: minSelectable },
      ...bookedDateObjects,
    ];

    if (maxDate) {
      matchers.push({ after: maxDate });
    }

    return matchers;
  }, [bookedDateObjects, maxDate, minSelectable]);

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
            onChange(nextDate ? toIsoDateString(nextDate) : '');
          }}
          disabled={disabled ? () => true : disabledMatcher}
          modifiers={{
            booked: bookedDateObjects,
          }}
          modifiersClassNames={{
            booked: 'rdp-booked-day',
            selected: 'rdp-selected-day',
          }}
          showOutsideDays
          fixedWeeks
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

        {/* Per-component scoped styling so the picker matches the iRoomReserve glass theme. */}
        <style>{`
          .rdp-root {
            --rdp-accent-color: #a12124;
            --rdp-accent-background-color: rgba(161, 33, 36, 0.12);
            --rdp-day-height: 2.4rem;
            --rdp-day-width: 2.4rem;
            font-family: inherit;
            color: #1f2937;
          }
          .rdp-day_button { border-radius: 0.6rem; font-weight: 600; }
          .rdp-day_button:not([disabled]):not(.rdp-booked-day):not(.rdp-selected-day):hover {
            background-color: rgba(34, 197, 94, 0.18);
            color: #166534;
          }
          .rdp-day:not(.rdp-day_disabled):not(.rdp-booked-day) .rdp-day_button {
            background-color: rgba(34, 197, 94, 0.10);
            color: #166534;
          }
          .rdp-booked-day .rdp-day_button {
            background-color: rgba(239, 68, 68, 0.18) !important;
            color: #b91c1c !important;
            text-decoration: line-through;
            cursor: not-allowed;
          }
          .rdp-selected-day .rdp-day_button {
            background-color: #a12124 !important;
            color: #ffffff !important;
            text-decoration: none !important;
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
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            Reserved
          </span>
          {bookedDates.length > 0 && (
            <span className="text-[11px] text-black/70">
              {bookedDates.length} day{bookedDates.length === 1 ? '' : 's'} already booked
            </span>
          )}
        </div>
      )}
    </div>
  );
}
