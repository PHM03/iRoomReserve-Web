import { useEffect, useState } from 'react';
import type { Reservation } from '@/lib/reservations/reservations';
import { getCurrentDateTimeStringInTimeZone } from '@/lib/rooms/roomStatus';
import { formatTimeRange } from '@/lib/utils/dateTime';

interface MyReservationTimetableProps {
  className?: string;
  compact?: boolean;
  compactVariant?: 'weekly' | 'today';
  currentUserId?: string | null;
  reservations: Reservation[];
};

type TimetableEntry = {
  buildingName: string;
  campus: Reservation['campus'];
  endTime: string;
  roomName: string;
  startTime: string;
  purpose?: string;
};

const TIMETABLE_DAYS = [
  {
    label: 'Monday',
    value: 1
  },
  {
    label: 'Tuesday',
    value: 2
  },
  {
    label: 'Wednesday',
    value: 3
  },
  {
    label: 'Thursday',
    value: 4
  },
  {
    label: 'Friday',
    value: 5
  },
  {
    label: 'Saturday',
    value: 6
  },
] as const;

const timetablePanelClasses =
  'rounded-2xl border border-white/35 bg-white/75 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl';

function getOrderedTimetableDays(referenceDate = new Date()) {
  const todayValue = referenceDate.getDay();
  const startIndex = TIMETABLE_DAYS.findIndex((day) => day.value === todayValue);

  if (startIndex < 0) {
    return TIMETABLE_DAYS;
  }

  return [
    ...TIMETABLE_DAYS.slice(startIndex),
    ...TIMETABLE_DAYS.slice(0, startIndex),
  ];
}

function getReservationDates(reservation: Reservation) {
  const dates = reservation.dates?.length ? reservation.dates : [reservation.date];
  return [...new Set(dates.filter(Boolean))];
}

function getWeekdayValue(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const weekday = new Date(year, month - 1, day).getDay();
  return weekday >= 1 && weekday <= 6 ? weekday : null;
}

function formatCurrentDateLabel(date: Date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function isCurrentOrUpcomingOccurrence(
  date: string,
  endTime: string,
  currentDate: string,
  currentTime: string
) {
  return date > currentDate || (date === currentDate && endTime > currentTime);
}

function buildEntriesByDay(
  reservations: Reservation[],
  currentUserId?: string | null,
  currentDateTime = getCurrentDateTimeStringInTimeZone()
) {
  const entriesByDay = new Map<number, Map<string, TimetableEntry>>();

  TIMETABLE_DAYS.forEach((day) => {
    entriesByDay.set(day.value, new Map());
  });

  reservations.forEach((reservation) => {
    if (
      !currentUserId ||
      reservation.userId !== currentUserId ||
      reservation.status !== 'approved'
    ) {
      return;
    }

    getReservationDates(reservation)
      .filter((date) =>
        isCurrentOrUpcomingOccurrence(
          date,
          reservation.endTime,
          currentDateTime.date,
          currentDateTime.time
        )
      )
      .forEach((date) => {
        const weekday = getWeekdayValue(date);

        if (!weekday) {
          return;
        }

        const dayEntries = entriesByDay.get(weekday);

        if (!dayEntries) {
          return;
        }

        const key = [
          reservation.roomId,
          reservation.buildingId,
          reservation.startTime,
          reservation.endTime,
        ].join(':');

        if (!dayEntries.has(key)) {
          dayEntries.set(key, {
            buildingName: reservation.buildingName,
            campus: reservation.campus,
            endTime: reservation.endTime,
            roomName: reservation.roomName,
            startTime: reservation.startTime,
            purpose: reservation.purpose,
          });
        }
      });
  });

  return entriesByDay;
}

export default function MyReservationTimetable({
  className,
  compact = false,
  compactVariant = 'weekly',
  currentUserId,
  reservations,
}: Readonly<MyReservationTimetableProps>) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const currentDateTime = getCurrentDateTimeStringInTimeZone(now);
  const entriesByDay = buildEntriesByDay(reservations, currentUserId, currentDateTime);
  const orderedTimetableDays = getOrderedTimetableDays(now);

  if (compact) {
    if (compactVariant === 'today') {
      const today = new Date();
      const todayValue = today.getDay();
      const todayEntries = [...(entriesByDay.get(todayValue)?.values() ?? [])].sort(
        (left, right) =>
          left.startTime.localeCompare(right.startTime) ||
          left.roomName.localeCompare(right.roomName, undefined, { numeric: true })
      );

      return (
        <section className={`glass-card p-3 sm:p-4 ${className ?? ''}`.trim()}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-extrabold text-black">
                Reservation Timetable
              </h3>
              <p className="mt-0.5 truncate text-[11px] font-bold text-black/50">
                {formatCurrentDateLabel(today)}
              </p>
            </div>
            <span className="rounded-lg border border-primary/15 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              Today
            </span>
          </div>

          {todayEntries.length === 0 ? (
            <p className="dashboard-empty-state rounded-2xl px-3 py-5 text-center text-xs font-bold text-black/60">
              No approved reservations today.
            </p>
          ) : (
            <div className="space-y-1.5">
              {todayEntries.slice(0, 4).map((entry) => (
                <div
                  key={`${entry.buildingName}:${entry.roomName}:${entry.startTime}:${entry.endTime}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-green-500/15 bg-green-500/10 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-black">
                      {entry.roomName}
                    </p>
                    <p className="truncate text-[10px] font-bold text-black/50">
                      {entry.purpose || entry.buildingName}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-[11px] font-extrabold text-primary">
                    {formatTimeRange(entry.startTime, entry.endTime)}
                  </p>
                </div>
              ))}
              {todayEntries.length > 4 ? (
                <p className="text-center text-[10px] font-bold text-black/55">
                  +{todayEntries.length - 4} more today
                </p>
              ) : null}
            </div>
          )}
        </section>
      );
    }

    return (
      <section className={className}>
        <div className="mb-2 flex items-center justify-between rounded-2xl border border-white/35 bg-white/75 px-3 py-2 shadow-lg backdrop-blur-xl">
          <h3 className="text-sm font-bold text-gray-800">My Reservation Timetable</h3>
          <span className="text-[11px] font-bold text-gray-500">Weekly strip</span>
        </div>

        <div className="glass-card !rounded-xl p-2">
          <div className="grid grid-cols-6 gap-2">
            {orderedTimetableDays.map((day) => {
              const entries = [...(entriesByDay.get(day.value)?.values() ?? [])].sort(
                (left, right) =>
                  left.startTime.localeCompare(right.startTime) ||
                  left.roomName.localeCompare(right.roomName, undefined, { numeric: true })
              );

              return (
                <div
                  key={day.value}
                  className="min-h-[112px] rounded-2xl border border-white/35 bg-white/70 p-2 shadow-sm backdrop-blur-xl"
                >
                  <h4 className="mb-1.5 truncate text-xs font-extrabold text-black">
                    {day.label.slice(0, 3)}
                  </h4>

                  {entries.length === 0 ? (
                    <p className="dashboard-empty-state rounded-xl px-1.5 py-4 text-center text-[10px] font-bold text-black/50">
                      None
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {entries.slice(0, 2).map((entry) => (
                        <div
                          key={`${entry.buildingName}:${entry.roomName}:${entry.startTime}:${entry.endTime}`}
                          className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1.5"
                        >
                          <p className="truncate text-[11px] font-bold text-black">
                            {entry.roomName}
                          </p>
                          <p className="truncate text-[10px] font-bold text-primary">
                            {formatTimeRange(entry.startTime, entry.endTime)}
                          </p>
                        </div>
                      ))}
                      {entries.length > 2 && (
                        <p className="text-center text-[10px] font-bold text-black/55">
                          +{entries.length - 2} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`px-6 py-5 ${timetablePanelClasses} ${className ?? ''}`}>
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-800">
          My Reservation Timetable
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Weekly recurring schedule
        </p>
      </div>

      <div className="dashboard-table-shell overflow-x-auto rounded-2xl p-4 backdrop-blur-xl">
        <div className="grid min-w-full grid-cols-[repeat(6,minmax(120px,1fr))] gap-3">
          {orderedTimetableDays.map((day) => {
            const entries = [...(entriesByDay.get(day.value)?.values() ?? [])].sort(
              (left, right) =>
                left.startTime.localeCompare(right.startTime) ||
                left.roomName.localeCompare(right.roomName, undefined, { numeric: true })
            );

            return (
              <div
                key={day.value}
                className="min-h-[190px] rounded-2xl border border-white/35 bg-white/70 p-3 shadow-sm backdrop-blur-xl"
              >
                <h4 className="text-sm font-extrabold text-black mb-3">
                  {day.label}
                </h4>

                {entries.length === 0 ? (
                  <div className="dashboard-empty-state rounded-2xl px-3 py-6 text-center">
                    <p className="text-xs font-bold text-black/50">
                      No reservations
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((entry) => (
                      <div
                        key={`${entry.buildingName}:${entry.roomName}:${entry.startTime}:${entry.endTime}`}
                        className="rounded-2xl border border-green-500/20 bg-green-500/10 p-3 shadow-sm shadow-green-500/10 backdrop-blur-md"
                      >
                        <p className="text-sm font-bold text-black">
                          {entry.roomName}
                        </p>
                        <p className="text-xs text-black mt-1">
                          {entry.buildingName}
                        </p>
                        <p className="text-xs font-bold text-primary mt-2">
                          {formatTimeRange(entry.startTime, entry.endTime)}
                        </p>
                        {entry.purpose && (
                          <p className="mt-1 truncate text-[11px] text-black/60">
                            {entry.purpose}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
