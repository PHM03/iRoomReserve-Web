'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminFloorFilter from '@/components/admin/AdminFloorFilter';
import type { Feedback } from '@/lib/feedback/feedback';
import { resolveFeedbackSentimentLabel } from '@/lib/feedback/feedback-sentiment';
import {
  getPreferredDefaultFloorValue,
  sortFloorOptions,
} from '@/lib/buildings/floorLabels';
import type { RoomHistoryEntry } from '@/lib/rooms/roomHistory';
import type { Room } from '@/lib/rooms/rooms';
import { StarRating } from '@/components/admin/dashboard/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminRoomStatusSectionProps {
  buildingName?: string;
  rooms: Room[];
  statusMonitorFloorGroups: Array<{ floor: string; label: string; rooms: Room[] }>;
  computeEffectiveStatus: (room: Room) => { status: string; detail: string };
  onStatusChange: (roomId: string, status: Room['status']) => void;
  feedbackList?: Feedback[];
  roomHistory?: RoomHistoryEntry[];
  className?: string;
}

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: Readonly<StatusBadgeProps>) {
  const style = (() => {
    switch (status) {
      case 'Unavailable':
        return 'ui-badge-red';
      case 'Available':
        return 'ui-badge-green';
      default:
        return 'ui-badge-gray';
    }
  })();
}

type AvailabilityFilter = 'Available' | 'Unavailable';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTimeHours(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

function getDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

interface RoomFeedbackStats {
  avgRating: number | null;
  avgCompound: number | null;
  avgPositive: number | null;
  avgNeutral: number | null;
  avgNegative: number | null;
  totalFeedback: number;
  sentimentLabel: 'positive' | 'neutral' | 'negative' | null;
}

function computeRoomFeedbackStats(feedback: Feedback[]): RoomFeedbackStats {
  if (feedback.length === 0) {
    return { avgRating: null, avgCompound: null, avgPositive: null, avgNeutral: null, avgNegative: null, totalFeedback: 0, sentimentLabel: null };
  }
  const ratedItems = feedback.filter((f) => typeof f.rating === 'number' && f.rating > 0);
  const avgRating = ratedItems.length > 0
    ? ratedItems.reduce((sum, f) => sum + f.rating, 0) / ratedItems.length
    : null;

  const scoredItems = feedback.filter((f) => typeof f.compoundScore === 'number');
  const avgCompound = scoredItems.length > 0
    ? scoredItems.reduce((sum, f) => sum + (f.compoundScore ?? 0), 0) / scoredItems.length
    : null;
  const avgPositive = scoredItems.length > 0
    ? scoredItems.reduce((sum, f) => sum + (f.positiveScore ?? 0), 0) / scoredItems.length
    : null;
  const avgNeutral = scoredItems.length > 0
    ? scoredItems.reduce((sum, f) => sum + (f.neutralScore ?? 0), 0) / scoredItems.length
    : null;
  const avgNegative = scoredItems.length > 0
    ? scoredItems.reduce((sum, f) => sum + (f.negativeScore ?? 0), 0) / scoredItems.length
    : null;

  const sentimentLabel = avgCompound !== null
    ? resolveFeedbackSentimentLabel({ compoundScore: avgCompound })
    : avgRating !== null
      ? (avgRating >= 4 ? 'positive' : avgRating >= 3 ? 'neutral' : 'negative')
      : null;

  return { avgRating, avgCompound, avgPositive, avgNeutral, avgNegative, totalFeedback: feedback.length, sentimentLabel };
}

interface RoomUsageStats {
  totalHours: number;
  hoursByDay: number[]; // index 0=Sun, 1=Mon, ..., 6=Sat
}

function computeRoomUsageStats(history: RoomHistoryEntry[]): RoomUsageStats {
  const hoursByDay = [0, 0, 0, 0, 0, 0, 0];
  let totalHours = 0;

  for (const entry of history) {
    if (entry.status !== 'approved' && entry.status !== 'completed' && entry.status !== 'active') continue;
    if (!entry.startTime || !entry.endTime || !entry.date) continue;
    const duration = Math.max(0, parseTimeHours(entry.endTime) - parseTimeHours(entry.startTime));
    const day = getDayOfWeek(entry.date);
    if (!Number.isNaN(day)) {
      hoursByDay[day] += duration;
      totalHours += duration;
    }
  }

  return { totalHours, hoursByDay };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SentimentDot({ label }: { label: 'positive' | 'neutral' | 'negative' | null }) {
  if (!label) {
    return (
      <span
        title="No feedback data"
        className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300 border border-gray-400/30 shrink-0"
      />
    );
  }
  const map = {
    positive: { bg: 'bg-emerald-500', border: 'border-emerald-600/30', title: 'Good — positive sentiment' },
    neutral: { bg: 'bg-yellow-400', border: 'border-yellow-500/30', title: 'Needs improvement — neutral sentiment' },
    negative: { bg: 'bg-red-500', border: 'border-red-600/30', title: 'Bad — negative sentiment' },
  };
  const { bg, border, title } = map[label];
  return (
    <span
      title={title}
      className={`inline-block w-2.5 h-2.5 rounded-full ${bg} border ${border} shrink-0 shadow-sm`}
    />
  );
}

function EffectiveStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Available: 'ui-badge-green',
    Reserved: 'ui-badge-blue',
    Occupied: 'ui-badge-red',
    Unavailable: 'ui-badge-red',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] ?? 'ui-badge-gray'}`}>
      {status}
    </span>
  );
}

function MiniBarChart({ hoursByDay }: { hoursByDay: number[] }) {
  const max = Math.max(...hoursByDay, 0.1);
  return (
    <div className="flex items-end gap-1.5 h-14">
      {hoursByDay.map((hours, idx) => {
        const pct = (hours / max) * 100;
        return (
          <div key={idx} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full flex items-end justify-center" style={{ height: 44 }}>
              <div
                title={`${DAY_LABELS[idx]}: ${hours.toFixed(1)}h`}
                className="w-full rounded-t-sm bg-primary/60 hover:bg-primary transition-all"
                style={{ height: `${Math.max(pct, 2)}%`, minHeight: hours > 0 ? 3 : 0 }}
              />
            </div>
            <span className="text-[9px] font-bold text-black/50">{DAY_LABELS[idx]}</span>
          </div>
        );
      })}
    </div>
  );
}

function ExpandedAnalytics({
  feedbackStats,
  usageStats,
}: {
  feedbackStats: RoomFeedbackStats;
  usageStats: RoomUsageStats;
}) {
  const noData = feedbackStats.totalFeedback === 0 && usageStats.totalHours === 0;

  return (
    <div className="px-4 pb-4 pt-2 border-t border-dark/10 bg-white/40 animate-[fadeIn_0.15s_ease]">
      {noData ? (
        <p className="text-xs text-black/50 py-2 text-center">No analytics data available yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Feedback / VADER */}
          <div className="space-y-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-black/40">Feedback & Sentiment</p>

            {feedbackStats.totalFeedback === 0 ? (
              <p className="text-xs text-black/50">No feedback yet.</p>
            ) : (
              <>
                {/* Star rating */}
                {feedbackStats.avgRating !== null && (
                  <div className="flex items-center gap-2">
                    <StarRating rating={Math.round(feedbackStats.avgRating)} />
                    <span className="text-xs font-bold text-black">
                      {feedbackStats.avgRating.toFixed(1)} avg
                    </span>
                    <span className="text-[10px] text-black/40">({feedbackStats.totalFeedback} reviews)</span>
                  </div>
                )}

                {/* VADER compound */}
                {feedbackStats.avgCompound !== null && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-black/60">VADER Compound</span>
                      <span className="text-xs font-extrabold text-black">
                        {feedbackStats.avgCompound.toFixed(3)}
                      </span>
                    </div>
                    {/* Compound bar −1 → +1 */}
                    <div className="relative h-2 w-full rounded-full bg-dark/10 overflow-hidden">
                      <div
                        className={`absolute top-0 h-full rounded-full ${
                          feedbackStats.sentimentLabel === 'positive'
                            ? 'bg-emerald-500'
                            : feedbackStats.sentimentLabel === 'negative'
                              ? 'bg-red-500'
                              : 'bg-yellow-400'
                        }`}
                        style={{ width: `${((feedbackStats.avgCompound + 1) / 2) * 100}%` }}
                      />
                    </div>

                    {/* Pos / Neu / Neg breakdown */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { label: 'Pos', value: feedbackStats.avgPositive, color: 'text-emerald-700' },
                        { label: 'Neu', value: feedbackStats.avgNeutral, color: 'text-slate-600' },
                        { label: 'Neg', value: feedbackStats.avgNegative, color: 'text-red-700' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center">
                          <p className={`text-xs font-extrabold ${color}`}>
                            {value !== null ? `${Math.round(value * 100)}%` : '—'}
                          </p>
                          <p className="text-[9px] text-black/40 font-bold">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Usage */}
          <div className="space-y-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-black/40">Usage Analytics</p>

            {usageStats.totalHours === 0 ? (
              <p className="text-xs text-black/50">No reservation history.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-extrabold text-black">{usageStats.totalHours.toFixed(1)}</span>
                  <span className="text-xs text-black/50 font-bold">total hours used</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-black/40 mb-1.5">Hours by day of week</p>
                  <MiniBarChart hoursByDay={usageStats.hoursByDay} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminRoomStatusSection({
  buildingName,
  rooms,
  statusMonitorFloorGroups,
  computeEffectiveStatus,
  onStatusChange,
  feedbackList = [],
  roomHistory = [],
  className = '',
}: Readonly<AdminRoomStatusSectionProps>) {
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState<string>('Ground Floor');
  const [availFilter, setAvailFilter] = useState<AvailabilityFilter>('Available');
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  // Unique floors for filter
  const floorOptions = useMemo(
    () =>
      sortFloorOptions(
        statusMonitorFloorGroups.map((group) => ({
          value: group.floor,
          label: group.label,
        }))
      ),
    [statusMonitorFloorGroups]
  );

  const floorOptionsWithAll = useMemo(
    () => [...floorOptions, { value: 'All', label: 'All' }],
    [floorOptions]
  );

  useEffect(() => {
    const hasMatchingFloor = floorOptionsWithAll.some(
      (option) => option.value === floorFilter
    );

    if (!hasMatchingFloor) {
      setFloorFilter(getPreferredDefaultFloorValue(floorOptions, 'All'));
    }
  }, [floorFilter, floorOptions, floorOptionsWithAll]);

  // Per-room feedback map
  const feedbackByRoom = useMemo(() => {
    const map = new Map<string, Feedback[]>();
    for (const f of feedbackList) {
      const arr = map.get(f.roomId) ?? [];
      arr.push(f);
      map.set(f.roomId, arr);
    }
    return map;
  }, [feedbackList]);

  // Per-room history map
  const historyByRoom = useMemo(() => {
    const map = new Map<string, RoomHistoryEntry[]>();
    for (const h of roomHistory) {
      const arr = map.get(h.roomId) ?? [];
      arr.push(h);
      map.set(h.roomId, arr);
    }
    return map;
  }, [roomHistory]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (q && !room.name.toLowerCase().includes(q)) return false;
      if (floorFilter !== 'All' && room.floor !== floorFilter) return false;
      const effective = computeEffectiveStatus(room);
      const isAvail = effective.status === 'Available';
      if (availFilter === 'Available' && !isAvail) return false;
      if (availFilter === 'Unavailable' && isAvail) return false;
      return true;
    });
  }, [rooms, search, floorFilter, availFilter, computeEffectiveStatus]);

  if (rooms.length === 0) {
    return (
      <section className={className}>
        <div className="glass-card p-12 text-center">
          <p className="text-sm text-black">No rooms configured. Add rooms first.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={className}>
      {/* ── Controls ── */}
      <div className="glass-card p-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          {/* Search */}
          <label className="relative flex-1 min-w-[160px]">
            <span className="sr-only">Search rooms</span>
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/35"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" strokeWidth="2" />
            </svg>
            <input
              id="room-status-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rooms…"
              className="glass-input h-9 w-full pl-8 pr-3 text-xs font-bold text-black placeholder:text-black/35"
            />
          </label>

          <AdminFloorFilter
            label="Filter by Floor:"
            options={floorOptionsWithAll}
            value={floorFilter}
            onChange={setFloorFilter}
          />

          {/* Availability filter */}
          <div className="flex items-center gap-1">
            {(['Available', 'Unavailable'] as AvailabilityFilter[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvailFilter(a)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                  availFilter === a
                    ? a === 'Available'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-red-600 text-white border-red-600'
                    : 'bg-white/70 text-black/60 border-dark/10 hover:bg-white hover:text-black'
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-bold text-black/40 ml-auto whitespace-nowrap">
            {filteredRooms.length} of {rooms.length} rooms
          </span>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-1 mb-3">
        <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Sentiment:</p>
        {[
          { color: 'bg-emerald-500', label: 'Good (4★+ / Positive)' },
          { color: 'bg-yellow-400', label: 'Needs work (3–3.9★ / Neutral)' },
          { color: 'bg-red-500', label: 'Bad (<3★ / Negative)' },
          { color: 'bg-gray-300', label: 'No data' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color} border border-black/10`} />
            <span className="text-[10px] text-black/50 font-bold hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Room list ── */}
      {filteredRooms.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-black/60 font-bold">No rooms match your filters.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[18px_minmax(0,1fr)_110px_90px_80px_160px_40px] items-center gap-3 px-4 py-2.5 border-b border-dark/10 bg-dark/5">
            <span />
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Room</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Floor</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Cap</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Status</span>
            <span className="text-[10px] font-extrabold text-black/50 uppercase tracking-widest">Toggle</span>
            <span />
          </div>

          <ul className="divide-y divide-dark/10">
            {filteredRooms.map((room) => {
              const effective = computeEffectiveStatus(room);
              const roomFeedback = feedbackByRoom.get(room.id) ?? [];
              const roomHistEntries = historyByRoom.get(room.id) ?? [];
              const feedbackStats = computeRoomFeedbackStats(roomFeedback);
              const usageStats = computeRoomUsageStats(roomHistEntries);
              const isExpanded = expandedRoomId === room.id;
              const floorLabel =
                floorOptions.find((option) => option.value === room.floor)?.label ??
                room.floor;

              return (
                <li key={room.id}>
                  {/* ── Main row ── */}
                  <div className="grid md:grid-cols-[18px_minmax(0,1fr)_110px_90px_80px_160px_40px] items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors">
                    {/* Sentiment dot */}
                    <div className="flex items-center justify-center">
                      <SentimentDot label={feedbackStats.sentimentLabel} />
                    </div>

                    {/* Name + detail */}
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-black truncate">{room.name}</p>
                      {effective.detail ? (
                        <p className="text-[10px] text-black/50 font-bold truncate">{effective.detail}</p>
                      ) : null}
                      {/* Mobile: floor + cap below name */}
                      <p className="md:hidden text-[10px] text-black/40 font-bold mt-0.5">
                        {floorLabel} · Cap {room.capacity}
                      </p>
                    </div>

                    {/* Floor */}
                    <p className="hidden md:block text-xs font-bold text-black/70 truncate">{floorLabel}</p>

                    {/* Capacity */}
                    <p className="hidden md:block text-xs font-bold text-black/70">{room.capacity}</p>

                    {/* Status badge */}
                    <div className="hidden md:flex">
                      <EffectiveStatusBadge status={effective.status} />
                    </div>

                    {/* Toggle buttons */}
                    <div className="flex gap-1.5 md:col-start-6">
                      <button
                        type="button"
                        onClick={() => onStatusChange(room.id, 'Available')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          room.status === 'Available' ? 'ui-button-green' : 'ui-button-gray'
                        }`}
                      >
                        Available
                      </button>
                      <button
                        type="button"
                        onClick={() => onStatusChange(room.id, 'Unavailable')}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                          room.status === 'Unavailable' ? 'ui-button-red' : 'ui-button-gray'
                        }`}
                      >
                        Unavailable
                      </button>
                    </div>

                    {/* Expand button */}
                    <button
                      type="button"
                      title={isExpanded ? 'Collapse analytics' : 'Expand analytics'}
                      onClick={() => setExpandedRoomId(isExpanded ? null : room.id)}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-dark/10 bg-dark/5 hover:bg-primary/10 hover:border-primary/30 transition-all text-black/50 hover:text-primary"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* ── Expanded analytics ── */}
                  {isExpanded && (
                    <ExpandedAnalytics
                      feedbackStats={feedbackStats}
                      usageStats={usageStats}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
