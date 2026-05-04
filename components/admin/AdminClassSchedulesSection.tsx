'use client';

import { getFloorDisplayLabel } from '@/lib/floorLabels';
import type { Schedule } from '@/lib/schedules';
import { DAY_NAMES, formatTime12h } from '@/lib/schedules';
import type { Room } from '@/lib/rooms';

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
  onDeleteSchedule: (scheduleId: string) => void;
  className?: string;
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
  className = '',
}: AdminClassSchedulesSectionProps) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-black">Class Schedules</h3>
        <button onClick={onToggleForm} className="btn-primary px-4 py-2 text-sm">
          {showScheduleForm ? 'Cancel' : '+ Add Schedule'}
        </button>
      </div>

      {showScheduleForm ? (
        <div className="glass-card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-black mb-1">Room</label>
              <select
                value={schedRoomId}
                onChange={(event) => onSchedRoomIdChange(event.target.value)}
                className="glass-input w-full px-4 py-2.5 text-sm"
              >
                <option value="">Select room...</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} ({getFloorDisplayLabel(room.floor, {
                      id: room.buildingId,
                      name: room.buildingName,
                    })})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-black mb-1">Day</label>
              <select
                value={schedDay}
                onChange={(event) => onSchedDayChange(Number(event.target.value))}
                className="glass-input w-full px-4 py-2.5 text-sm"
              >
                {DAY_NAMES.map((name, index) => (
                  <option key={index} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-black mb-1">Subject</label>
              <input
                value={schedSubject}
                onChange={(event) => onSchedSubjectChange(event.target.value)}
                placeholder="e.g. IT 101"
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-black mb-1">Instructor</label>
              <input
                value={schedInstructor}
                onChange={(event) => onSchedInstructorChange(event.target.value)}
                placeholder="e.g. Prof. Santos"
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-black mb-1">Start Time</label>
              <input
                type="time"
                value={schedStart}
                onChange={(event) => onSchedStartChange(event.target.value)}
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-black mb-1">End Time</label>
              <input
                type="time"
                value={schedEnd}
                onChange={(event) => onSchedEndChange(event.target.value)}
                className="glass-input w-full px-4 py-2.5 text-sm"
              />
            </div>
          </div>
          <button
            onClick={onSaveSchedule}
            disabled={addingSchedule || !schedRoomId || !schedSubject.trim()}
            className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50"
          >
            {addingSchedule
              ? 'Saving...'
              : editingScheduleId
                ? 'Update Schedule'
                : 'Add Schedule'}
          </button>
        </div>
      ) : null}

      {schedules.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-black">No class schedules assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5, 6].map((day) => {
            const daySchedules = schedules.filter((schedule) => schedule.dayOfWeek === day);

            if (daySchedules.length === 0) {
              return null;
            }

            return (
              <div key={day}>
                <h4 className="text-sm font-bold text-black mb-2">{DAY_NAMES[day]}</h4>
                <div className="space-y-2">
                  {daySchedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="glass-card p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold text-black">
                          {schedule.subjectName}
                        </p>
                        <p className="text-xs text-black">
                          {schedule.roomName} · {schedule.instructorName} ·{' '}
                          {formatTime12h(schedule.startTime)} –{' '}
                          {formatTime12h(schedule.endTime)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEditSchedule(schedule)}
                          className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                          title="Edit"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => onDeleteSchedule(schedule.id)}
                          className="p-2 rounded-lg ui-button-ghost ui-button-ghost-danger transition-all"
                          title="Delete"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
