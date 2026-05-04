'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getManagedBuildingsForCampus } from '@/lib/campusAssignments';
import { getBuildingFloorOptions } from '@/lib/floorLabels';
import { getRoomsByBuildingAndFloor, type Room } from '@/lib/rooms';
import {
  formatTime12h,
  getSchedulesByRoomId,
  type Schedule,
} from '@/lib/schedules';

type ScheduleCampusFilter = 'SDCA Digi Campus' | 'SDCA Main Campus';
type ScheduleBuildingFilter = 'gd1' | 'gd2' | 'gd3';

type TodayClassSchedulesPanelProps =
  | {
      className?: string;
      scope: 'campus';
    }
  | {
      buildingId: string;
      buildingName: string;
      className?: string;
      scope: 'building';
    };

const SCHEDULE_DAY_OPTIONS = [
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
] as const;

const MAIN_BUILDING_OPTIONS: ReadonlyArray<{
  label: string;
  name: string;
  value: ScheduleBuildingFilter;
}> = [
  { label: 'GD1', name: 'GD1', value: 'gd1' },
  { label: 'GD2', name: 'GD2', value: 'gd2' },
  { label: 'GD3', name: 'GD3', value: 'gd3' },
];

const DIGI_BUILDING = getManagedBuildingsForCampus('digi')[0] ?? null;
const ROOM_EMPTY_MESSAGE = 'No rooms available';
const ROOM_TIMEOUT_MESSAGE = 'Failed to load rooms. Please try again.';
const DAY_LABELS_BY_VALUE = new Map(
  SCHEDULE_DAY_OPTIONS.map((option) => [option.value, option.label])
);

function getDefaultSelectedDay() {
  const currentDay = new Date().getDay();
  return (
    SCHEDULE_DAY_OPTIONS.find((option) => option.value === currentDay)?.label ?? 'Monday'
  );
}

function EmptyState({
  description,
  title,
}: {
  description?: string;
  title: string;
}) {
  return (
    <div className="p-12 text-center">
      <svg
        className="w-14 h-14 text-black mx-auto mb-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <p className="text-sm text-black font-bold">{title}</p>
      {description ? <p className="text-xs text-black mt-1">{description}</p> : null}
    </div>
  );
}

export default function TodayClassSchedulesPanel(
  props: TodayClassSchedulesPanelProps
) {
  const [selectedDay, setSelectedDay] = useState<string>(getDefaultSelectedDay);
  const [selectedCampus, setSelectedCampus] = useState<ScheduleCampusFilter | null>(
    null
  );
  const [selectedBuilding, setSelectedBuilding] =
    useState<ScheduleBuildingFilter | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [roomOptions, setRoomOptions] = useState<Room[]>([]);
  const [roomLoadState, setRoomLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'timeout'
  >('idle');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleLoadState, setScheduleLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');

  const selectedDayOptionIndex = SCHEDULE_DAY_OPTIONS.findIndex(
    (option) => option.label === selectedDay
  );
  const selectedDayValue =
    SCHEDULE_DAY_OPTIONS[selectedDayOptionIndex]?.value ??
    SCHEDULE_DAY_OPTIONS[0].value;
  const buildingScopeId = props.scope === 'building' ? props.buildingId : null;
  const buildingScopeName = props.scope === 'building' ? props.buildingName : null;

  const activeBuilding = useMemo(() => {
    if (props.scope === 'building') {
      return {
        id: buildingScopeId ?? '',
        name: buildingScopeName ?? '',
      };
    }

    if (selectedCampus === 'SDCA Digi Campus') {
      return DIGI_BUILDING
        ? {
            id: DIGI_BUILDING.id,
            name: DIGI_BUILDING.name,
          }
        : null;
    }

    if (selectedCampus === 'SDCA Main Campus' && selectedBuilding) {
      const buildingOption = MAIN_BUILDING_OPTIONS.find(
        (option) => option.value === selectedBuilding
      );

      return buildingOption
        ? {
            id: buildingOption.value,
            name: buildingOption.name,
          }
        : null;
    }

    return null;
  }, [
    props.scope,
    buildingScopeId,
    buildingScopeName,
    selectedBuilding,
    selectedCampus,
  ]);

  const floorOptions = useMemo(() => {
    if (!activeBuilding) {
      return [];
    }

    return getBuildingFloorOptions(activeBuilding);
  }, [activeBuilding]);

  const displayedSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.dayOfWeek === selectedDayValue),
    [schedules, selectedDayValue]
  );
  const availableScheduleDays = useMemo(
    () =>
      [...new Set(schedules.map((schedule) => schedule.dayOfWeek))]
        .map((dayValue) => DAY_LABELS_BY_VALUE.get(dayValue) ?? `Day ${dayValue}`)
        .join(', '),
    [schedules]
  );

  const roomRequestKey =
    activeBuilding?.id && selectedFloor
      ? `${props.scope}:${activeBuilding.id}:${selectedFloor}`
      : '';

  useEffect(() => {
    if (!roomRequestKey || !activeBuilding || !selectedFloor) {
      return;
    }

    let cancelled = false;
    let didTimeout = false;

    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      didTimeout = true;
      setRoomOptions([]);
      setRoomLoadState('timeout');
    }, 8000);

    console.log('[today-class-schedules] fetching rooms', {
      buildingId: activeBuilding.id,
      campus: props.scope === 'campus' ? selectedCampus : null,
      floor: selectedFloor,
    });

    void getRoomsByBuildingAndFloor(activeBuilding.id, selectedFloor)
      .then((nextRooms) => {
        if (cancelled || didTimeout) {
          return;
        }

        setRoomOptions(
          [...nextRooms].sort((left, right) =>
            left.name.localeCompare(right.name, undefined, { numeric: true })
          )
        );
        setRoomLoadState('ready');
      })
      .catch((error) => {
        if (cancelled || didTimeout) {
          return;
        }

        console.warn('[today-class-schedules] failed to load rooms', {
          buildingId: activeBuilding.id,
          campus: props.scope === 'campus' ? selectedCampus : null,
          floor: selectedFloor,
          error,
        });
        setRoomOptions([]);
        setRoomLoadState('error');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeBuilding, props.scope, roomRequestKey, selectedCampus, selectedFloor]);

  useEffect(() => {
    if (!selectedRoom) {
      return;
    }

    let cancelled = false;

    void getSchedulesByRoomId(selectedRoom)
      .then((nextSchedules) => {
        if (cancelled) {
          return;
        }

        setSchedules(nextSchedules);
        setScheduleLoadState('ready');
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.warn('[today-class-schedules] failed to load schedules', {
          error,
          roomId: selectedRoom,
        });
        setSchedules([]);
        setScheduleLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRoom]);

  useEffect(() => {
    if (!selectedRoom || scheduleLoadState !== 'ready') {
      return;
    }

    console.log('[today-class-schedules] schedule state update', {
      matchingSchedules: displayedSchedules.length,
      roomId: selectedRoom,
      schedules,
      selectedDay,
      selectedDayValue,
      totalSchedules: schedules.length,
    });
  }, [
    displayedSchedules.length,
    scheduleLoadState,
    schedules,
    selectedDay,
    selectedDayValue,
    selectedRoom,
  ]);

  const handleDayStep = (direction: -1 | 1) => {
    const baseIndex = selectedDayOptionIndex >= 0 ? selectedDayOptionIndex : 0;
    const nextIndex =
      (baseIndex + direction + SCHEDULE_DAY_OPTIONS.length) %
      SCHEDULE_DAY_OPTIONS.length;
    setSelectedDay(SCHEDULE_DAY_OPTIONS[nextIndex].label);
  };

  const roomPlaceholder =
    roomLoadState === 'loading'
      ? 'Loading rooms...'
      : roomLoadState === 'timeout'
        ? ROOM_TIMEOUT_MESSAGE
        : roomOptions.length === 0
          ? ROOM_EMPTY_MESSAGE
          : 'Select Room';

  return (
    <div className={props.className}>
      <div className="flex items-center justify-between mb-4 bg-white rounded-xl px-6 py-4 border border-white/30">
        <h3 className="text-xl font-bold text-gray-800">Today&apos;s Class Schedules</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleDayStep(-1)}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center"
            title="Previous day"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <select
            aria-label="Select day"
            className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={selectedDay}
            onChange={(event) => {
              const nextDay = event.target.value;
              console.log('[today-class-schedules] selected day changed', {
                roomId: selectedRoom,
                selectedDay: nextDay,
              });
              setSelectedDay(nextDay);
            }}
          >
            {SCHEDULE_DAY_OPTIONS.map((option) => (
              <option key={option.label} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleDayStep(1)}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center"
            title="Next day"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {props.scope === 'campus' ? (
          <>
            <select
              aria-label="Select Campus"
              className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={selectedCampus ?? ''}
              onChange={(event) => {
                const nextCampus = event.target.value
                  ? (event.target.value as ScheduleCampusFilter)
                  : null;
                setSelectedCampus(nextCampus);
                setSelectedBuilding(null);
                setSelectedFloor(null);
                setSelectedRoom(null);
                setRoomOptions([]);
                setRoomLoadState('idle');
                setSchedules([]);
                setScheduleLoadState('idle');
              }}
            >
              <option value="">Select Campus</option>
              <option value="SDCA Digi Campus">SDCA Digi Campus</option>
              <option value="SDCA Main Campus">SDCA Main Campus</option>
            </select>

            {selectedCampus === 'SDCA Main Campus' ? (
              <select
                aria-label="Select building"
                className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={selectedBuilding ?? ''}
                onChange={(event) => {
                  const nextBuilding = event.target.value
                    ? (event.target.value as ScheduleBuildingFilter)
                    : null;
                  setSelectedBuilding(nextBuilding);
                  setSelectedFloor(null);
                  setSelectedRoom(null);
                  setRoomOptions([]);
                  setRoomLoadState('idle');
                  setSchedules([]);
                  setScheduleLoadState('idle');
                }}
              >
                <option value="">Select Building</option>
                {MAIN_BUILDING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        ) : (
          <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Building
            </span>
            <span className="ml-2 font-semibold text-gray-800">{props.buildingName}</span>
          </div>
        )}

        {activeBuilding ? (
          <select
            aria-label="Select Floor"
            className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={selectedFloor ?? ''}
            onChange={(event) => {
              const nextFloor = event.target.value || null;
              setSelectedFloor(nextFloor);
              setSelectedRoom(null);
              setRoomOptions([]);
              setRoomLoadState(nextFloor ? 'loading' : 'idle');
              setSchedules([]);
              setScheduleLoadState('idle');
            }}
          >
            <option value="">Select Floor</option>
            {floorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        {selectedFloor ? (
          <select
            aria-label="Select Room"
            className="text-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={selectedRoom ?? ''}
            onChange={(event) => {
              const nextRoom = event.target.value || null;
              console.log('Selected room:', nextRoom);
              setSelectedRoom(nextRoom);
              setSchedules([]);
              setScheduleLoadState(nextRoom ? 'loading' : 'idle');

              if (!nextRoom) {
                return;
              }

              console.log('Fetching schedule with:', {
                buildingId: activeBuilding?.id ?? null,
                campus: props.scope === 'campus' ? selectedCampus : null,
                day: selectedDayValue,
                floor: selectedFloor,
                room: nextRoom,
              });
            }}
          >
            <option value="">{roomPlaceholder}</option>
            {roomOptions.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="bg-white border border-gray-200 shadow-sm !rounded-xl overflow-hidden">
        {!selectedRoom ? (
          <EmptyState title="Select a room to view its schedule" />
        ) : scheduleLoadState === 'loading' ? (
          <EmptyState
            title="Loading classes"
            description={`Fetching ${selectedDay}'s schedule for the selected room`}
          />
        ) : scheduleLoadState === 'error' ? (
          <EmptyState
            title="Failed to load classes"
            description="Please try selecting the room again."
          />
        ) : displayedSchedules.length === 0 ? (
          <EmptyState
            title="No classes today"
            description={
              schedules.length > 0
                ? `No scheduled classes for ${selectedDay}. This room has classes on ${availableScheduleDays}.`
                : `No scheduled classes for the selected room on ${selectedDay}`
            }
          />
        ) : (
          <div className="divide-y divide-dark/5">
            {displayedSchedules.map((schedule) => (
              <div
                key={schedule.id}
                className="p-4 hover:bg-primary/10 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-black">
                      {schedule.subjectName}
                    </h4>
                    <p className="text-xs text-black mt-0.5">
                      {schedule.instructorName}
                    </p>
                    <p className="text-xs text-black mt-0.5">{schedule.roomName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">
                      {formatTime12h(schedule.startTime)} -{' '}
                      {formatTime12h(schedule.endTime)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedFloor && roomLoadState === 'timeout' ? (
        <p className="text-xs text-red-600 mt-3">{ROOM_TIMEOUT_MESSAGE}</p>
      ) : null}
      {selectedFloor && roomLoadState === 'error' ? (
        <p className="text-xs text-black mt-3">{ROOM_EMPTY_MESSAGE}</p>
      ) : null}
    </div>
  );
}
