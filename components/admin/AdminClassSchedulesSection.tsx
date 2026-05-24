'use client';

import { useState, useEffect } from 'react';

import { getFloorDisplayLabel } from '@/lib/buildings/floorLabels';
import type { Room } from '@/lib/rooms/rooms';
import type { Schedule } from '@/lib/schedules/schedules';
import { DAY_NAMES, formatTime12h } from '@/lib/schedules/schedules';
import { getCampusTimeRule, validateScheduleTimes } from '@/lib/schedules/scheduleTimeRules';

// ---------------------------------------------------------------------------
// TimeSelect - a minimal hour picker locked to whole-hour intervals
// ---------------------------------------------------------------------------
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatHourOption(h: number) {
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:00 ${period}`;
}

function TimeSelect({
  value,
  onChange,
  minHour = 0,
  maxHour = 23,
  disabled = false,
  placeholder = 'Select time',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  minHour?: number;
  maxHour?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [rawHour] = value ? value.split(':') : [''];
  const hour = rawHour === '' ? '' : String(Number(rawHour));
  const allowedHours = HOURS.filter((h) => h >= minHour && h <= maxHour);

  function handleHour(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!e.target.value) {
      onChange('');
      return;
    }

    onChange(`${pad2(Number(e.target.value))}:00`);
  }

  return (
    <div className={className}>
      <select
        value={hour}
        onChange={handleHour}
        disabled={disabled}
        className="glass-input w-full px-2 py-2.5 text-sm"
      >
        <option value="">{placeholder}</option>
        {allowedHours.map((h) => (
          <option key={h} value={h}>
            {formatHourOption(h)}
          </option>
        ))}
      </select>
    </div>
  );
}

interface AdminClassSchedulesSectionProps {
  schedules: Schedule[];
  rooms: Room[];
  showScheduleForm: boolean;
  schedRoomId: string;
  schedSubject: string;
  schedInstructor: string;
  schedDay: number;
  schedStart: string;
  schedEnd: string;
  addingSchedule: boolean;
  editingScheduleId: string | null;
  onToggleForm: () => void;
  onSchedRoomIdChange: (value: string) => void;
  onSchedSubjectChange: (value: string) => void;
  onSchedInstructorChange: (value: string) => void;
  onSchedDayChange: (value: number) => void;
  onSchedStartChange: (value: string) => void;
  onSchedEndChange: (value: string) => void;
  onSaveSchedule: () => void;
  onEditSchedule: (schedule: Schedule) => void;
  onDeleteSchedule: (scheduleId: string) => Promise<void>;
  campus?: string | null;
  className?: string;
}

const TIMETABLE_START_HOUR = 7;
const TIMETABLE_END_HOUR = 21;
const PIXELS_PER_HOUR = 60;
const HOUR_SLOTS = Array.from(
  { length: TIMETABLE_END_HOUR - TIMETABLE_START_HOUR + 1 },
  (_, index) => index + TIMETABLE_START_HOUR
);

function formatHourLabel(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;

  return `${hour12}:00 ${period}`;
}

function getTimeOffset(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':');

  return (
    (Number(hours) - TIMETABLE_START_HOUR) * PIXELS_PER_HOUR +
    (Number(minutes) / 60) * PIXELS_PER_HOUR
  );
}

function getScheduleBlockHeight(startTime: string, endTime: string) {
  return Math.max(getTimeOffset(endTime) - getTimeOffset(startTime), 30);
}

export default function AdminClassSchedulesSection({
  schedules,
  rooms,
  showScheduleForm,
  schedRoomId,
  schedSubject,
  schedInstructor,
  schedDay,
  schedStart,
  schedEnd,
  addingSchedule,
  editingScheduleId,
  onToggleForm,
  onSchedRoomIdChange,
  onSchedSubjectChange,
  onSchedInstructorChange,
  onSchedDayChange,
  onSchedStartChange,
  onSchedEndChange,
  onSaveSchedule,
  onEditSchedule,
  onDeleteSchedule,
  campus = null,
  className = '',
}: Readonly<AdminClassSchedulesSectionProps>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);

  // Clear the time error whenever the form is hidden (cancelled / saved)
  useEffect(() => {
    if (!showScheduleForm) setTimeError(null);
  }, [showScheduleForm]);

  const campusTimeRule = getCampusTimeRule(campus);
  const minHour = campusTimeRule?.startHour ?? 0;
  const maxHour = campusTimeRule?.endHour ?? 23;
  const startMaxHour = Math.max(minHour, maxHour - 1);
  const selectedStartHour = schedStart ? Number(schedStart.split(':')[0]) : null;
  const endMinHour =
    selectedStartHour === null ? minHour : Math.min(selectedStartHour + 1, maxHour);
  const isEndTimeDisabled = !schedStart || endMinHour > maxHour;

  function handleStartChange(value: string) {
    setTimeError(null);
    onSchedStartChange(value);

    if (!value) {
      onSchedEndChange('');
      return;
    }

    if (
      schedEnd &&
      validateScheduleTimes(value, schedEnd, campus)
    ) {
      onSchedEndChange('');
    }
  }

  function handleEndChange(value: string) {
    setTimeError(null);
    onSchedEndChange(value);
  }

  function handleSaveClick() {
    const error = validateScheduleTimes(schedStart, schedEnd, campus);
    if (error) {
      setTimeError(error);
      return;
    }
    onSaveSchedule();
  }

  async function handleConfirmDelete() {
    if (!editingScheduleId) return;
    setDeletingSchedule(true);
    try {
      await onDeleteSchedule(editingScheduleId);
    } finally {
      setDeletingSchedule(false);
      setShowDeleteConfirm(false);
    }
  }
  const timetableDays = DAY_NAMES.map((label, value) => ({ label, value })).filter(
    (day) => day.value >= 1 && day.value <= 6
  );
  const currentDay = new Date().getDay();
  const timetableHeight = (TIMETABLE_END_HOUR - TIMETABLE_START_HOUR) * PIXELS_PER_HOUR;

  return (
    <section
      className={`rounded-xl bg-white px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${className}`}
    >
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-xl font-bold text-black">Class Schedules</h3>
        <button
          onClick={onToggleForm}
          className="rounded-lg border-0 bg-[#8B0000] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#6e0000]"
        >
          {showScheduleForm ? 'Cancel' : '+ Add Schedule'}
        </button>
      </div>

      {showScheduleForm ? (
        <div className="mb-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-black">Room</label>
              <select
                value={schedRoomId}
                onChange={(event) => onSchedRoomIdChange(event.target.value)}
                className="glass-input w-full px-4 py-2.5 text-sm"
              >
                <option value="">Select room...</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} (
                    {getFloorDisplayLabel(room.floor, {
                      id: room.buildingId,
                      name: room.buildingName,
                    })}
                    )
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-black">Day</label>
              <select
                value={schedDay}
                onChange={(event) => onSchedDayChange(Number(event.target.value))}
                className="glass-input w-full px-4 py-2.5 text-sm"
              >
                {timetableDays.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-black">Subject</label>
              <input
                value={schedSubject}
                onChange={(event) => onSchedSubjectChange(event.target.value)}
                placeholder="e.g. IT 101"
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-black">
                Instructor
              </label>
              <input
                value={schedInstructor}
                onChange={(event) => onSchedInstructorChange(event.target.value)}
                placeholder="e.g. Prof. Santos"
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-black">
                Start Time
              </label>
              <TimeSelect
                value={schedStart}
                onChange={handleStartChange}
                minHour={minHour}
                maxHour={startMaxHour}
                placeholder="Select start time"
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-black">
                End Time
              </label>
              <TimeSelect
                value={schedEnd}
                onChange={handleEndChange}
                minHour={endMinHour}
                maxHour={maxHour}
                disabled={isEndTimeDisabled}
                placeholder={schedStart ? 'Select end time' : 'Choose start time first'}
                className="w-full"
              />
            </div>
          </div>
          {timeError ? (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
              {timeError}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveClick}
              disabled={addingSchedule || !schedRoomId || !schedSubject.trim()}
              className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50"
            >
              {addingSchedule
                ? 'Saving...'
                : editingScheduleId
                  ? 'Update Schedule'
                  : 'Add Schedule'}
            </button>

            {editingScheduleId ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={addingSchedule}
                className="rounded-lg border border-red-600 bg-white px-6 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
              >
                Delete
              </button>
            ) : null}
          </div>

          {/* ── Delete confirmation dialog ── */}
          {showDeleteConfirm ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
                <h4 className="mb-2 text-base font-bold text-gray-900">
                  Delete Schedule?
                </h4>
                <p className="mb-6 text-sm text-gray-500">
                  Are you sure you want to delete this schedule? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deletingSchedule}
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={deletingSchedule}
                    className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingSchedule ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
        <div
          className="grid w-full"
          style={{
            gridTemplateColumns: `65px repeat(${timetableDays.length}, minmax(100px, 1fr))`,
            minWidth: '665px',
          }}
        >
          <div />
          {timetableDays.map((day) => (
            <div
              key={day.value}
              className={`border-b border-r border-[#f0f0f0] px-3 pb-2 text-center text-xs font-semibold uppercase text-[#555555] ${day.value === currentDay ? 'font-bold text-[#8B0000]' : ''
                }`}
            >
              {day.label.slice(0, 3)}
            </div>
          ))}

          <div className="relative" style={{ height: timetableHeight }}>
            {HOUR_SLOTS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 w-full pr-2 text-right text-xs text-[#999999]"
                style={{ top: (hour - TIMETABLE_START_HOUR) * PIXELS_PER_HOUR - 8 }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {timetableDays.map((day) => (
            <div
              key={day.value}
              className="relative border-r border-[#f0f0f0]"
              style={{ height: timetableHeight }}
            >
              {HOUR_SLOTS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 w-full border-t border-[#f0f0f0]"
                  style={{ top: (hour - TIMETABLE_START_HOUR) * PIXELS_PER_HOUR }}
                />
              ))}

              {schedules
                .filter((schedule) => schedule.dayOfWeek === day.value)
                .map((schedule) => (
                  <button
                    key={schedule.id}
                    type="button"
                    onClick={() => onEditSchedule(schedule)}
                    title={`${schedule.subjectName} | ${schedule.roomName} · ${schedule.instructorName} | ${formatTime12h(schedule.startTime)} - ${formatTime12h(schedule.endTime)}`}
                    className="absolute left-2 right-2 overflow-hidden rounded-md border-l-[3px] border-[#8B0000] bg-[#fde8e8] px-2 py-1 text-left text-xs transition-all hover:bg-[#f9c8c8] hover:shadow-[0_2px_6px_rgba(0,0,0,0.1)]"
                    style={{
                      top: getTimeOffset(schedule.startTime),
                      height: getScheduleBlockHeight(
                        schedule.startTime,
                        schedule.endTime
                      ),
                    }}
                  >
                    <p className="truncate font-semibold text-[#8B0000]">
                      {schedule.subjectName}
                    </p>
                    <p className="truncate text-[11px] text-[#666666]">
                      {schedule.roomName} · {schedule.instructorName}
                    </p>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
