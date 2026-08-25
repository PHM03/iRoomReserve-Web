'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { getFloorDisplayLabel } from '@/lib/buildings/floorLabels';
import type { Room } from '@/lib/rooms/rooms';
import {
  parseScheduleExcelFile,
  type ExcelScheduleImportCandidate,
} from '@/lib/schedules/excelScheduleImport';
import type { ScheduleAcademicYear, ScheduleSemester } from '@/lib/schedules/scheduleContext';
import type { Schedule } from '@/lib/schedules/schedules';
import {
  findScheduleConflicts,
  SCHEDULE_CONFLICT_MESSAGE,
  timeRangesOverlap,
} from '@/lib/schedules/scheduleConflicts';
import {
  DAY_NAMES,
  addSchedule,
  formatTime12h,
  getScheduleDisplayTitle,
  type ScheduleInput,
} from '@/lib/schedules/schedules';
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
  allSchedules: Schedule[];
  rooms: Room[];
  showScheduleForm: boolean;
  schedRoomId: string;
  schedCourseName: string;
  schedSection: string;
  schedInstructor: string;
  schedDay: number;
  schedStart: string;
  schedEnd: string;
  addingSchedule: boolean;
  editingScheduleId: string | null;
  onToggleForm: () => void;
  onSchedRoomIdChange: (value: string) => void;
  onSchedCourseNameChange: (value: string) => void;
  onSchedSectionChange: (value: string) => void;
  onSchedInstructorChange: (value: string) => void;
  onSchedDayChange: (value: number) => void;
  onSchedStartChange: (value: string) => void;
  onSchedEndChange: (value: string) => void;
  scheduleSaveError: string | null;
  onClearScheduleSaveError: () => void;
  onSaveSchedule: (overrideScheduleIds?: string[]) => void;
  onEditSchedule: (schedule: Schedule) => void;
  onDeleteSchedule: (scheduleId: string) => Promise<void>;
  buildingId: string;
  currentUserId?: string | null;
  activeScheduleSemester: ScheduleSemester;
  activeScheduleAcademicYear: ScheduleAcademicYear;
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

type DayScheduleSlotStatus = 'available' | 'scheduled' | 'selected' | 'conflict';

type ImportPreviewStatus = 'valid' | 'invalid' | 'conflict';

type ImportPreviewRow = ExcelScheduleImportCandidate & {
  existingConflicts: Schedule[];
  status: ImportPreviewStatus;
  validationErrors: string[];
};

export default function AdminClassSchedulesSection({
  schedules,
  allSchedules,
  rooms,
  showScheduleForm,
  schedRoomId,
  schedCourseName,
  schedSection,
  schedInstructor,
  schedDay,
  schedStart,
  schedEnd,
  addingSchedule,
  editingScheduleId,
  onToggleForm,
  onSchedRoomIdChange,
  onSchedCourseNameChange,
  onSchedSectionChange,
  onSchedInstructorChange,
  onSchedDayChange,
  onSchedStartChange,
  onSchedEndChange,
  scheduleSaveError,
  onClearScheduleSaveError,
  onSaveSchedule,
  onEditSchedule,
  onDeleteSchedule,
  buildingId,
  currentUserId = null,
  activeScheduleSemester,
  activeScheduleAcademicYear,
  campus = null,
  className = '',
}: Readonly<AdminClassSchedulesSectionProps>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [showImportOverrideConfirm, setShowImportOverrideConfirm] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [parsedImportRows, setParsedImportRows] = useState<ExcelScheduleImportCandidate[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [parsingImport, setParsingImport] = useState(false);
  const [savingImport, setSavingImport] = useState(false);

  // Clear the time error whenever the form is hidden (cancelled / saved)
  useEffect(() => {
    if (!showScheduleForm) {
      setFormError(null);
    }
  }, [showScheduleForm]);

  const campusTimeRule = getCampusTimeRule(campus);
  const minHour = campusTimeRule?.startHour ?? 0;
  const maxHour = campusTimeRule?.endHour ?? 23;
  const startMaxHour = Math.max(minHour, maxHour - 1);
  const selectedStartHour = schedStart ? Number(schedStart.split(':')[0]) : null;
  const endMinHour =
    selectedStartHour === null ? minHour : Math.min(selectedStartHour + 1, maxHour);
  const isEndTimeDisabled = !schedStart || endMinHour > maxHour;
  const timetableDays = DAY_NAMES.map((label, value) => ({ label, value })).filter(
    (day) => day.value >= 1 && day.value <= 6
  );
  const selectedDayLabel =
    timetableDays.find((day) => day.value === schedDay)?.label ?? 'Selected day';
  const roomSchedulesForDay = useMemo(
    () =>
      allSchedules.filter(
        (schedule) =>
          schedule.roomId === schedRoomId &&
          schedule.dayOfWeek === schedDay &&
          schedule.id !== editingScheduleId
      ),
    [allSchedules, editingScheduleId, schedDay, schedRoomId]
  );
  const conflictingSchedules = useMemo(() => {
    if (!schedRoomId || !schedStart || !schedEnd) {
      return [];
    }

    return findScheduleConflicts(roomSchedulesForDay, {
      dayOfWeek: schedDay,
      endTime: schedEnd,
      roomId: schedRoomId,
      startTime: schedStart,
    });
  }, [roomSchedulesForDay, schedDay, schedEnd, schedRoomId, schedStart]);
  const conflictingScheduleIds = useMemo(
    () => new Set(conflictingSchedules.map((schedule) => schedule.id)),
    [conflictingSchedules]
  );
  const liveConflictMessage =
    conflictingSchedules.length > 0 && schedStart && schedEnd
      ? SCHEDULE_CONFLICT_MESSAGE
      : null;
  const visibleError = formError ?? scheduleSaveError ?? liveConflictMessage;
  const dayScheduleSlots = useMemo(() => {
    if (!schedRoomId || maxHour <= minHour) {
      return [];
    }

    return Array.from({ length: maxHour - minHour }, (_, index) => {
      const hour = minHour + index;
      const slotStart = `${pad2(hour)}:00`;
      const slotEnd = `${pad2(hour + 1)}:00`;
      const overlappingSchedules = roomSchedulesForDay.filter((schedule) =>
        timeRangesOverlap(
          schedule.startTime,
          schedule.endTime,
          slotStart,
          slotEnd
        )
      );
      const overlapsSelectedRange =
        Boolean(schedStart && schedEnd) &&
        timeRangesOverlap(slotStart, slotEnd, schedStart, schedEnd);
      const overlapsConflict =
        overlapsSelectedRange &&
        conflictingSchedules.some((schedule) =>
          timeRangesOverlap(
            schedule.startTime,
            schedule.endTime,
            slotStart,
            slotEnd
          )
        );
      let status: DayScheduleSlotStatus = 'available';

      if (overlapsConflict) {
        status = 'conflict';
      } else if (overlappingSchedules.length > 0) {
        status = 'scheduled';
      } else if (overlapsSelectedRange) {
        status = 'selected';
      }

      return {
        endTime: slotEnd,
        label:
          status === 'conflict'
            ? 'Conflict'
            : overlappingSchedules[0]
              ? getScheduleDisplayTitle(overlappingSchedules[0])
              : status === 'selected'
                ? 'Selected'
                : 'Available',
        startTime: slotStart,
        status,
      };
    });
  }, [
    conflictingSchedules,
    maxHour,
    minHour,
    roomSchedulesForDay,
    schedEnd,
    schedRoomId,
    schedStart,
  ]);
  const importPreviewRows = useMemo<ImportPreviewRow[]>(
    () =>
      parsedImportRows.map((row, rowIndex) => {
        const validationErrors = [...row.errors];

        if (!row.roomId) {
          validationErrors.push('Room is required.');
        }

        if (row.buildingId && buildingId && row.buildingId !== buildingId) {
          validationErrors.push('Room belongs to another building.');
        }

        if (!row.startTime || !row.endTime) {
          validationErrors.push('Start and end times are required.');
        }

        if (!row.subject.trim()) {
          validationErrors.push('Subject is required.');
        }

        if (!row.section.trim()) {
          validationErrors.push('Section is required.');
        }

        const timeError =
          row.startTime && row.endTime
            ? validateScheduleTimes(row.startTime, row.endTime, campus)
            : null;

        if (timeError) {
          validationErrors.push(timeError);
        }

        const existingConflicts =
          row.roomId && row.startTime && row.endTime
            ? findScheduleConflicts(allSchedules, {
                academicYear: activeScheduleAcademicYear,
                dayOfWeek: row.dayOfWeek,
                endTime: row.endTime,
                roomId: row.roomId,
                semester: activeScheduleSemester,
                startTime: row.startTime,
              })
            : [];
        const duplicateImportConflict = parsedImportRows.some(
          (otherRow, otherRowIndex) =>
            otherRowIndex !== rowIndex &&
            otherRow.roomId === row.roomId &&
            otherRow.dayOfWeek === row.dayOfWeek &&
            otherRow.startTime &&
            otherRow.endTime &&
            row.startTime &&
            row.endTime &&
            timeRangesOverlap(
              otherRow.startTime,
              otherRow.endTime,
              row.startTime,
              row.endTime
            )
        );

        if (existingConflicts.length > 0) {
          validationErrors.push(SCHEDULE_CONFLICT_MESSAGE);
        }

        if (duplicateImportConflict) {
          validationErrors.push('Overlaps another row in this import.');
        }

        const uniqueValidationErrors = [...new Set(validationErrors)];
        const hasConflict =
          existingConflicts.length > 0 || duplicateImportConflict;

        return {
          ...row,
          existingConflicts,
          status:
            uniqueValidationErrors.length === 0
              ? 'valid'
              : hasConflict
                ? 'conflict'
                : 'invalid',
          validationErrors: uniqueValidationErrors,
        };
      }),
    [
      activeScheduleAcademicYear,
      activeScheduleSemester,
      allSchedules,
      buildingId,
      campus,
      parsedImportRows,
    ]
  );
  const validImportRows = useMemo(
    () => importPreviewRows.filter((row) => row.status === 'valid'),
    [importPreviewRows]
  );
  const overridableImportRows = useMemo(
    () =>
      importPreviewRows.filter(
        (row) =>
          row.existingConflicts.length > 0 &&
          row.validationErrors.every(
            (error) => error === SCHEDULE_CONFLICT_MESSAGE
          )
      ),
    [importPreviewRows]
  );
  const invalidImportCount = importPreviewRows.filter(
    (row) => row.status !== 'valid'
  ).length;
  const hasImportPreview =
    parsingImport ||
    parsedImportRows.length > 0 ||
    Boolean(importError);

  useEffect(() => {
    if (!importSuccess) {
      return;
    }

    const timeoutId = window.setTimeout(() => setImportSuccess(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [importSuccess]);

  function clearErrors() {
    setFormError(null);
    onClearScheduleSaveError();
  }

  function handleStartChange(value: string) {
    clearErrors();
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
    clearErrors();
    onSchedEndChange(value);
  }

  function handleSaveClick() {
    const error = validateScheduleTimes(schedStart, schedEnd, campus);
    if (error) {
      clearErrors();
      setFormError(error);
      return;
    }

    if (liveConflictMessage) {
      clearErrors();
      setShowOverrideConfirm(true);
      return;
    }

    clearErrors();
    onSaveSchedule();
  }

  function handleConfirmOverride() {
    setShowOverrideConfirm(false);
    clearErrors();
    onSaveSchedule(conflictingSchedules.map((schedule) => schedule.id));
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

  function clearImportState() {
    setImportFileName('');
    setParsedImportRows([]);
    setImportError(null);
    setImportSuccess(null);
    setParsingImport(false);
    setShowImportOverrideConfirm(false);
  }

  async function handleImportFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      clearImportState();
      setImportError('Upload an .xlsx or .xls file.');
      return;
    }

    setImportFileName(file.name);
    setParsedImportRows([]);
    setImportError(null);
    setImportSuccess(null);
    setParsingImport(true);

    try {
      const result = await parseScheduleExcelFile(file, rooms);
      setParsedImportRows(result.rows);
      setImportError(result.errors.length > 0 ? result.errors.join(' ') : null);

      if (result.rows.length === 0 && result.errors.length === 0) {
        setImportError('No class schedule blocks were detected.');
      }
    } catch (error) {
      console.warn('Failed to parse schedule import:', error);
      setImportError(
        error instanceof Error
          ? error.message
          : 'Failed to parse the Excel schedule.'
      );
    } finally {
      setParsingImport(false);
    }
  }

  async function handleConfirmImport(overrideExisting = false) {
    if (!currentUserId) {
      setImportError('Sign in again before importing schedules.');
      return;
    }

    const rowsToImport = overrideExisting
      ? [...validImportRows, ...overridableImportRows]
      : validImportRows;

    if (!buildingId || rowsToImport.length === 0) {
      return;
    }

    setSavingImport(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      for (const row of rowsToImport) {
        const courseCode = row.courseCode.trim() || row.subject.trim();
        const data: ScheduleInput = {
          academicYear: activeScheduleAcademicYear,
          buildingId,
          courseCode,
          courseName: row.subject.trim(),
          createdBy: currentUserId,
          dayOfWeek: row.dayOfWeek,
          endTime: row.endTime,
          instructorName: row.instructorName.trim() || 'Imported Schedule',
          roomId: row.roomId,
          roomName: row.roomName,
          section: row.section.trim(),
          semester: activeScheduleSemester,
          startTime: row.startTime,
          subjectName: getScheduleDisplayTitle({
            courseCode,
            section: row.section.trim(),
            subjectName: row.subject.trim(),
          }),
        };

        await addSchedule(
          data,
          overrideExisting ? row.existingConflicts.map((schedule) => schedule.id) : []
        );
      }

      const skippedCount = importPreviewRows.length - rowsToImport.length;
      setParsedImportRows([]);
      setImportFileName('');
      setImportError(null);
      setShowImportOverrideConfirm(false);
      setImportSuccess(
        `${overrideExisting ? 'Overrode conflicts and imported' : 'Imported'} ${rowsToImport.length} schedule${
          rowsToImport.length === 1 ? '' : 's'
        }.${skippedCount > 0 ? ` Skipped ${skippedCount} flagged row${skippedCount === 1 ? '' : 's'}.` : ''}`
      );
    } catch (error) {
      console.warn('Failed to import schedules:', error);
      setImportError(
        error instanceof Error
          ? error.message
          : 'Failed to save imported schedules.'
      );
    } finally {
      setSavingImport(false);
    }
  }
  const currentDay = new Date().getDay();
  const timetableHeight = (TIMETABLE_END_HOUR - TIMETABLE_START_HOUR) * PIXELS_PER_HOUR;

  return (
    <section
      className={`rounded-xl bg-white px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${className}`}
    >
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-xl font-bold text-black">Class Schedules</h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={importFileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleImportFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importFileInputRef.current?.click()}
            disabled={parsingImport || savingImport || rooms.length === 0}
            className="rounded-lg border border-[#8B0000] bg-white px-4 py-2 text-sm font-bold text-[#8B0000] transition-colors hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {parsingImport ? 'Reading...' : 'Import Excel'}
          </button>
          <button
            onClick={onToggleForm}
            className="rounded-lg border-0 bg-[#8B0000] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#6e0000]"
          >
            {showScheduleForm ? 'Cancel' : '+ Add Schedule'}
          </button>
        </div>
      </div>

      {importSuccess ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-green-700 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {importSuccess}
        </div>
      ) : null}

      {showScheduleForm ? (
        <div className="mb-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-black">Room</label>
              <select
                value={schedRoomId}
                onChange={(event) => {
                  clearErrors();
                  onSchedRoomIdChange(event.target.value);
                }}
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
                onChange={(event) => {
                  clearErrors();
                  onSchedDayChange(Number(event.target.value));
                }}
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
              <label className="mb-1 block text-xs font-bold text-black">Course Name</label>
              <input
                value={schedCourseName}
                onChange={(event) => {
                  clearErrors();
                  onSchedCourseNameChange(event.target.value);
                }}
                placeholder="e.g. Introduction to Programming"
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-black">Program, Year, and Section</label>
              <input
                value={schedSection}
                onChange={(event) => {
                  clearErrors();
                  onSchedSectionChange(event.target.value);
                }}
                placeholder="e.g. BSIT 2A"
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-black">
                Instructor
              </label>
              <input
                value={schedInstructor}
                onChange={(event) => {
                  clearErrors();
                  onSchedInstructorChange(event.target.value);
                }}
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
          {visibleError ? (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
              {visibleError}
            </p>
          ) : null}
          {schedRoomId ? (
            <div className="rounded-xl border border-gray-200 bg-[#faf7f7] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-black">Day Schedule</h4>
                  <p className="text-xs text-black/65">
                    {selectedDayLabel} for the selected room
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-bold text-black/70">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-gray-300/80 bg-white" />
                    Available
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-[#8B0000]/30 bg-[#fde8e8]" />
                    Scheduled
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-primary/40 bg-primary/10" />
                    Selected
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-red-400/70 bg-red-100" />
                    Conflict
                  </span>
                </div>
              </div>
              <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1">
                {dayScheduleSlots.map((slot) => {
                  const isConflict = slot.status === 'conflict';
                  const slotClasses =
                    slot.status === 'conflict'
                      ? 'border-red-400/70 bg-red-100 text-red-800'
                      : slot.status === 'scheduled'
                        ? 'border-[#8B0000]/20 bg-[#fde8e8] text-[#8B0000]'
                        : slot.status === 'selected'
                          ? 'border-primary/35 bg-primary/10 text-primary'
                          : 'border-gray-200 bg-white text-black/80';

                  return (
                    <div
                      key={slot.startTime}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-xs font-semibold ${slotClasses}`}
                    >
                      <span className="min-w-[7rem]">
                        {formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}
                      </span>
                      <span
                        className={`truncate ${slot.status === 'scheduled' || isConflict ? 'line-through' : ''}`}
                      >
                        {slot.label}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide opacity-80">
                        {slot.status}
                      </span>
                    </div>
                  );
                })}
              </div>
              {conflictingSchedules.length > 0 ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs font-bold text-red-800">
                    Conflicts with:
                  </p>
                  <div className="mt-1 space-y-1 text-xs text-red-700">
                    {conflictingSchedules.map((schedule) => (
                      <p key={schedule.id}>
                        {getScheduleDisplayTitle(schedule)} | {formatTime12h(schedule.startTime)} -{' '}
                        {formatTime12h(schedule.endTime)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
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

            <button
              onClick={handleSaveClick}
              disabled={
                addingSchedule ||
                !schedRoomId ||
                !schedCourseName.trim() ||
                !schedSection.trim()
              }
              className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50"
            >
              {addingSchedule
                ? 'Saving...'
                : editingScheduleId
                  ? 'Update Schedule'
                  : 'Add Schedule'}
            </button>
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

          {showOverrideConfirm ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h4 className="mb-2 text-base font-bold text-gray-900">
                  Override Existing Schedule?
                </h4>
                <p className="mb-3 text-sm text-gray-600">
                  This will permanently replace the overlapping schedule
                  {conflictingSchedules.length === 1 ? '' : 's'} with this one.
                </p>
                <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
                  {conflictingSchedules.map((schedule) => (
                    <p key={schedule.id}>
                      {getScheduleDisplayTitle(schedule)} ·{' '}
                      {formatTime12h(schedule.startTime)}–{formatTime12h(schedule.endTime)}
                    </p>
                  ))}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowOverrideConfirm(false)}
                    disabled={addingSchedule}
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOverride}
                    disabled={addingSchedule}
                    className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    Override Schedule
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasImportPreview ? (
        <div className="mb-6 rounded-xl border border-gray-200 bg-[#faf7f7] p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-black">Import Preview</h4>
              <p className="text-xs text-black/65">
                {importFileName || 'Excel schedule'} | {validImportRows.length} ready
                {invalidImportCount > 0 ? ` | ${invalidImportCount} flagged` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={clearImportState}
              disabled={savingImport}
              className="w-fit rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel Import
            </button>
          </div>

          {importError ? (
            <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
              {importError}
            </p>
          ) : null}

          {importSuccess ? (
            <p className="mb-3 rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
              {importSuccess}
            </p>
          ) : null}

          {parsingImport ? (
            <p className="rounded-lg bg-white px-4 py-3 text-sm font-medium text-black/70">
              Reading schedule file...
            </p>
          ) : null}

          {importPreviewRows.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-[860px] w-full border-collapse text-left text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-bold">Source</th>
                      <th className="px-3 py-2 font-bold">Room</th>
                      <th className="px-3 py-2 font-bold">Day</th>
                      <th className="px-3 py-2 font-bold">Time</th>
                      <th className="px-3 py-2 font-bold">Subject</th>
                      <th className="px-3 py-2 font-bold">Section</th>
                      <th className="px-3 py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewRows.map((row) => {
                      const rowClass =
                        row.status === 'valid'
                          ? 'bg-white'
                          : row.status === 'conflict'
                            ? 'bg-red-50'
                            : 'bg-amber-50';
                      const statusLabel =
                        row.status === 'valid'
                          ? 'Ready'
                          : row.status === 'conflict'
                            ? 'Conflict'
                            : 'Invalid';

                      return (
                        <tr
                          key={row.id}
                          className={`border-t border-gray-100 align-top ${rowClass}`}
                        >
                          <td className="px-3 py-2 text-gray-600">
                            {row.sourceSheet} {row.sourceCell}
                          </td>
                          <td className="px-3 py-2 font-semibold text-black">
                            {row.roomName || row.detectedRoomName || '-'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{row.dayName}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.startTime && row.endTime
                              ? `${formatTime12h(row.startTime)} - ${formatTime12h(row.endTime)}`
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.subject || '-'}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {row.section || '-'}
                          </td>
                          <td className="px-3 py-2">
                            <p
                              className={`font-bold ${
                                row.status === 'valid'
                                  ? 'text-green-700'
                                  : row.status === 'conflict'
                                    ? 'text-red-700'
                                    : 'text-amber-700'
                              }`}
                            >
                              {statusLabel}
                            </p>
                            {row.validationErrors.length > 0 ? (
                              <p className="mt-1 max-w-[16rem] text-[11px] leading-snug text-gray-700">
                                {row.validationErrors.join(' ')}
                              </p>
                            ) : null}
                            {row.existingConflicts.length > 0 ? (
                              <p className="mt-1 max-w-[16rem] text-[11px] leading-snug text-red-700">
                                Existing:{' '}
                                {row.existingConflicts
                                  .map((schedule) => getScheduleDisplayTitle(schedule))
                                  .join(', ')}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={clearImportState}
                  disabled={savingImport}
                  className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportOverrideConfirm(true)}
                  disabled={
                    savingImport ||
                    parsingImport ||
                    overridableImportRows.length === 0 ||
                    !currentUserId
                  }
                  className="rounded-lg border border-red-600 bg-white px-5 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Override &amp; Import {overridableImportRows.length}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImport()}
                  disabled={
                    savingImport ||
                    parsingImport ||
                    validImportRows.length === 0 ||
                    !currentUserId
                  }
                  className="rounded-lg bg-[#8B0000] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#6e0000] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingImport
                    ? 'Importing...'
                    : `Import ${validImportRows.length} Schedule${
                        validImportRows.length === 1 ? '' : 's'
                  }`}
                </button>
              </div>

              {showImportOverrideConfirm ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                    <h4 className="mb-2 text-base font-bold text-gray-900">
                      Override Imported Schedule Conflicts?
                    </h4>
                    <p className="mb-6 text-sm text-gray-600">
                      This will replace the existing schedules that conflict with{' '}
                      {overridableImportRows.length} imported row
                      {overridableImportRows.length === 1 ? '' : 's'}.
                      Other flagged rows will remain skipped.
                    </p>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setShowImportOverrideConfirm(false)}
                        disabled={savingImport}
                        className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmImport(true)}
                        disabled={savingImport}
                        className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        Override &amp; Import
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div>
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
                    title={`${schedule.courseName ?? schedule.subjectName} | ${schedule.section ?? ''} | ${schedule.instructorName} | ${schedule.courseCode ?? ''} | ${formatTime12h(schedule.startTime)} - ${formatTime12h(schedule.endTime)}`}
                    className={`absolute left-2 right-2 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-center text-xs transition-all hover:shadow-[0_2px_6px_rgba(0,0,0,0.1)] ${
                      conflictingScheduleIds.has(schedule.id)
                        ? 'border-red-700 bg-red-100 ring-2 ring-red-400/70 hover:bg-red-200'
                        : 'border-[#8B0000] bg-[#fde8e8] hover:bg-[#f9c8c8]'
                    }`}
                    style={{
                      top: getTimeOffset(schedule.startTime),
                      height: getScheduleBlockHeight(
                        schedule.startTime,
                        schedule.endTime
                      ),
                    }}
                  >
                    <p className="whitespace-normal break-words text-[11px] font-semibold leading-tight text-[#8B0000]">
                      {schedule.courseName ?? schedule.subjectName}
                    </p>
                    <p className="whitespace-normal break-words text-[10px] leading-tight text-[#666666]">
                      {schedule.section ?? ''}
                    </p>
                    <p className="whitespace-normal break-words text-[10px] leading-tight text-[#666666]">
                      {schedule.instructorName}
                    </p>
                    <p className="whitespace-normal break-words text-[10px] leading-tight text-[#666666]">
                      {schedule.courseCode ?? getScheduleDisplayTitle(schedule)}
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
