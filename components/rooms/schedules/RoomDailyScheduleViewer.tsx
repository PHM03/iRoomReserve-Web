'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import type { ReservationCampus } from '@/lib/buildings/campuses';
import type {
  RoomDayScheduleViewerInterval,
  RoomDayScheduleViewerResult,
} from '@/lib/reservations/roomDayScheduleViewer';

interface RoomDailyScheduleViewerProps {
  buildingName: string;
  campus: ReservationCampus | null;
  initialDate: string;
  onClose: (date: string) => void;
  onReserve: (date: string) => void;
  roomId: string;
  roomName: string;
}

function getLocalDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDate(date: string, amount: number) {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + amount);
  return getLocalDateString(shifted);
}

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

function formatTime(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function getStatusStyle(status: RoomDayScheduleViewerInterval['status']) {
  if (status === 'Reserved') {
    return 'border-rose-200 bg-rose-50 text-rose-900';
  }
  if (status === 'Class Schedule') {
    return 'border-amber-200 bg-amber-50 text-amber-950';
  }
  return 'border-stone-300 bg-stone-100 text-stone-800';
}

export default function RoomDailyScheduleViewer({
  buildingName,
  campus,
  initialDate,
  onClose,
  onReserve,
  roomId,
  roomName,
}: Readonly<RoomDailyScheduleViewerProps>) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [requestState, setRequestState] = useState<{
    error: string;
    key: string;
    loading: boolean;
    schedule: RoomDayScheduleViewerResult | null;
  }>({ error: '', key: '', loading: true, schedule: null });
  const [retryToken, setRetryToken] = useState(0);
  const today = getLocalDateString(new Date());
  const requestKey = `${roomId}:${selectedDate}:${retryToken}`;
  const requestIsCurrent = requestState.key === requestKey;
  const loading = !requestIsCurrent || requestState.loading;
  const error = requestIsCurrent ? requestState.error : '';
  const schedule = requestIsCurrent ? requestState.schedule : null;
  const campusName = campus === 'main' ? 'SDCA Main Campus' : campus === 'digi' ? 'SDCA Digital Campus' : 'Campus unavailable';

  useEffect(() => {
    let currentRequest = true;

    apiRequest<{ schedule: RoomDayScheduleViewerResult }>('/api/ai/room-reservation', {
      body: { action: 'room-day-schedule', date: selectedDate, roomId },
    }).then((result) => {
      if (currentRequest) setRequestState({ error: '', key: requestKey, loading: false, schedule: result.schedule });
    }).catch((requestError: unknown) => {
      if (currentRequest) {
        setRequestState({
          error: requestError instanceof Error
            ? requestError.message
            : 'The room schedule could not be loaded. Please try again.',
          key: requestKey,
          loading: false,
          schedule: null,
        });
      }
    });

    return () => {
      currentRequest = false;
    };
  }, [requestKey, roomId, selectedDate]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm" aria-label="Daily room schedule viewer">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/8 bg-[#f8f4ef] px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-black">Daily Room Schedule</h2>
          <p className="mt-1 truncate text-[11px] text-black/65">{roomName} · {campusName} · {buildingName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => onReserve(selectedDate)} className="rounded-lg bg-[#a12124] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#871d20]">Reserve This Room</button>
          <button type="button" onClick={() => onClose(selectedDate)} className="rounded-lg border border-black/15 bg-white px-3 py-2 text-[11px] font-bold text-black/75 hover:bg-black/5">Back to conversation</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/8 px-3 py-2.5 sm:px-4">
        <p className="min-w-0 text-xs font-bold text-black" aria-live="polite">{formatDateLabel(selectedDate)}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setSelectedDate((date) => shiftDate(date, -1))} className="rounded-lg border border-black/12 px-2.5 py-1.5 text-xs font-bold text-black/75 hover:bg-black/5" aria-label="Previous day" title="Previous day">‹</button>
          <button type="button" onClick={() => setSelectedDate(today)} disabled={selectedDate === today} className="rounded-lg border border-black/12 px-2.5 py-1.5 text-[11px] font-bold text-black/75 hover:bg-black/5 disabled:cursor-default disabled:opacity-45">Today</button>
          <button type="button" onClick={() => setSelectedDate((date) => shiftDate(date, 1))} className="rounded-lg border border-black/12 px-2.5 py-1.5 text-xs font-bold text-black/75 hover:bg-black/5" aria-label="Next day" title="Next day">›</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {loading ? (
          <p className="rounded-xl bg-[#f8f4ef] px-3 py-4 text-center text-xs text-black/65" role="status">Loading this day’s room schedule…</p>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-4 text-center" role="alert">
            <p className="text-xs text-rose-900">{error}</p>
            <button type="button" onClick={() => setRetryToken((current) => current + 1)} className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-900">Retry</button>
          </div>
        ) : schedule && schedule.intervals.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-4 text-center">
            <p className="text-sm font-bold text-emerald-900">No scheduled conflicts for this day.</p>
            <p className="mt-1 text-[11px] text-emerald-900/75">Reservation availability is checked again when you submit.</p>
          </div>
        ) : (
          <ol className="space-y-2" aria-label="Occupied or unavailable intervals">
            {schedule?.intervals.map((interval, index) => (
              <li key={`${interval.startTime}-${interval.endTime}-${interval.status}-${index}`} className={`rounded-xl border px-3 py-2.5 ${getStatusStyle(interval.status)}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-bold">{interval.status}</span>
                  <time className="text-xs font-semibold tabular-nums">{formatTime(interval.startTime)}–{formatTime(interval.endTime)}</time>
                </div>
                {interval.reason && <p className="mt-1 text-[11px] leading-relaxed opacity-80">{interval.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="border-t border-black/8 bg-[#f8f4ef] px-3 py-2 text-[10px] leading-relaxed text-black/60 sm:px-4">
        The schedule lists occupied or restricted periods only. Final availability is confirmed by the reservation form.
      </footer>
    </section>
  );
}
