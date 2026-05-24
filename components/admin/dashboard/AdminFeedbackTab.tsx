'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import {
  resolveFeedbackSentimentLabel,
  type FeedbackSentimentSummary,
} from '@/lib/feedback/feedback-sentiment';
import { respondToFeedback, type Feedback } from '@/lib/feedback/feedback';
import type { Room } from '@/lib/rooms/rooms';
import {
  formatSentimentLabel,
  getManagedBuildingOptionLabel,
  getSentimentBadgeClasses,
  StarRating,
} from './shared';

interface BuildingOption {
  id: string;
  name: string;
}

interface AdminFeedbackTabProps {
  activeBuildingLabel: string;
  buildingId: string;
  feedbackList: Feedback[];
  feedbackSummary: FeedbackSentimentSummary | null;
  managedBuildings: BuildingOption[];
  onBuildingChange: (buildingId: string) => void;
  onReload: () => Promise<void>;
  rooms?: Room[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sortFloors(floors: string[]): string[] {
  return [...floors].sort((a, b) => {
    const rank = (f: string) => {
      if (f.toLowerCase().includes('ground')) return 0;
      const m = f.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 999;
    };
    return rank(a) - rank(b);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminFeedbackTab({
  activeBuildingLabel,
  buildingId,
  feedbackList,
  feedbackSummary,
  managedBuildings,
  onBuildingChange,
  onReload,
  rooms = [],
}: Readonly<AdminFeedbackTabProps>) {
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  // Filter state
  const [floorFilter, setFloorFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('All');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const handleRespondFeedback = async (feedbackId: string) => {
    if (!responseText.trim()) return;
    try {
      await respondToFeedback(feedbackId, responseText.trim());
      setRespondingId(null);
      setResponseText('');
      await onReload();
    } catch (error) {
      console.warn('Failed to respond:', error);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  // roomId → floor
  const roomFloorMap = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((r) => map.set(r.id, r.floor));
    return map;
  }, [rooms]);

  // Unique floors present in current feedback (not all rooms — only reviewed rooms)
  const floorsInFeedback = useMemo(() => {
    const floorsFromRooms = new Set<string>();
    feedbackList.forEach((f) => {
      const floor = roomFloorMap.get(f.roomId);
      if (floor) floorsFromRooms.add(floor);
    });
    // Fall back to all room floors if map is empty (rooms prop not provided)
    if (floorsFromRooms.size === 0 && rooms.length > 0) {
      rooms.forEach((r) => floorsFromRooms.add(r.floor));
    }
    return sortFloors(Array.from(floorsFromRooms));
  }, [feedbackList, roomFloorMap, rooms]);

  // Rooms on the selected floor
  const roomsOnFloor = useMemo(() => {
    if (floorFilter === 'All') return [];
    return rooms.filter((r) => r.floor === floorFilter);
  }, [rooms, floorFilter]);

  // ── Filter logic ─────────────────────────────────────────────────────────

  const filteredFeedback = useMemo(() => {
    return feedbackList.filter((f) => {
      if (floorFilter !== 'All') {
        const floor = roomFloorMap.get(f.roomId);
        if (floor !== floorFilter) return false;
      }
      if (roomFilter !== 'All' && f.roomId !== roomFilter) return false;
      if (starFilter !== null && Math.round(f.rating) !== starFilter) return false;
      if (dateFrom && f.createdAt) {
        const feedbackDate = f.createdAt.toDate();
        const from = new Date(`${dateFrom}T00:00:00`);
        if (feedbackDate < from) return false;
      }
      if (dateTo && f.createdAt) {
        const feedbackDate = f.createdAt.toDate();
        const to = new Date(`${dateTo}T23:59:59`);
        if (feedbackDate > to) return false;
      }
      return true;
    });
  }, [feedbackList, floorFilter, roomFilter, starFilter, dateFrom, dateTo, roomFloorMap]);

  const hasActiveFilters =
    floorFilter !== 'All' || roomFilter !== 'All' || starFilter !== null || !!dateFrom || !!dateTo;

  useEffect(() => {
    const defaultFloor = floorsInFeedback[0] ?? 'All';
    const hasMatchingFloor =
      floorFilter === 'All' || floorsInFeedback.includes(floorFilter);

    if (!hasMatchingFloor) {
      setFloorFilter(defaultFloor);
      setRoomFilter('All');
      return;
    }

    if (!floorFilter && defaultFloor) {
      setFloorFilter(defaultFloor);
    }
  }, [floorFilter, floorsInFeedback]);

  const clearFilters = () => {
    setFloorFilter(floorsInFeedback[0] ?? 'All');
    setRoomFilter('All');
    setStarFilter(null);
    setDateFrom('');
    setDateTo('');
  };

  const handleFloorChange = (floor: string) => {
    setFloorFilter(floor);
    setRoomFilter('All');
  };

  // ── Shared pill class ─────────────────────────────────────────────────────

  const pillClass = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
      active
        ? 'bg-primary text-white border-primary'
        : 'bg-white/70 text-black/60 border-dark/10 hover:bg-white hover:text-black'
    }`;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header — unchanged */}
      <div className="mb-6 flex flex-col gap-3 bg-white rounded-xl px-6 py-4 border border-white/30 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-gray-800">Room Feedback</h3>
          <span className="text-sm text-gray-600">{feedbackList.length} total</span>
        </div>
        {managedBuildings.length > 1 ? (
          <div className="w-full sm:ml-auto sm:w-72">
            <AdminBuildingSelect
              label="Active Building:"
              options={managedBuildings.map((building) => ({
                value: building.id,
                label: getManagedBuildingOptionLabel(building),
              }))}
              value={buildingId}
              onChange={onBuildingChange}
              fullWidth
            />
          </div>
        ) : (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#a12124]/30 bg-[#a12124]/10 px-3 py-1 text-xs font-bold text-[#7f1d1d] shadow-sm sm:ml-auto">
            <span>Active Building: {activeBuildingLabel}</span>
          </div>
        )}
      </div>

      {feedbackList.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">Feedback</div>
          <h4 className="text-lg font-bold text-black mb-1">No Feedback Yet</h4>
          <p className="text-sm text-black">Feedback from room users will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Existing summary cards — unchanged ── */}
          {feedbackSummary && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="glass-card p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">Positive</p>
                <p className="mt-2 text-2xl font-bold text-green-700">
                  {feedbackSummary.positivePercentage.toFixed(1)}%
                </p>
                <p className="text-xs text-black">
                  {feedbackSummary.positiveCount} of {feedbackSummary.total} entries
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">Neutral</p>
                <p className="mt-2 text-2xl font-bold text-slate-700">
                  {feedbackSummary.neutralPercentage.toFixed(1)}%
                </p>
                <p className="text-xs text-black">
                  {feedbackSummary.neutralCount} of {feedbackSummary.total} entries
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">Negative</p>
                <p className="mt-2 text-2xl font-bold text-red-700">
                  {feedbackSummary.negativePercentage.toFixed(1)}%
                </p>
                <p className="text-xs text-black">
                  {feedbackSummary.negativeCount} of {feedbackSummary.total} entries
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">
                  Average Compound
                </p>
                <p className="mt-2 text-2xl font-bold text-black">
                  {feedbackSummary.averageCompoundScore.toFixed(2)}
                </p>
                <p className="text-xs text-black">
                  {formatSentimentLabel(
                    resolveFeedbackSentimentLabel({ compoundScore: feedbackSummary.averageCompoundScore })
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ── Filter controls ── */}
          <div className="glass-card p-4 space-y-3">

            {/* Floor pills */}
            {floorsInFeedback.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-black/40 shrink-0 w-10">
                  Floor
                </span>
                {floorsInFeedback.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFloorChange(f)}
                    className={pillClass(floorFilter === f)}
                  >
                    {f}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleFloorChange('All')}
                  className={pillClass(floorFilter === 'All')}
                >
                  All Floors
                </button>
              </div>
            )}

            {/* Room dropdown — appears only when a floor is selected */}
            {floorFilter !== 'All' && roomsOnFloor.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-black/40 shrink-0 w-10">
                  Room
                </span>
                <select
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                  className="glass-input h-8 px-3 text-xs font-bold text-black min-w-[180px]"
                >
                  <option value="All">All Rooms on {floorFilter}</option>
                  {roomsOnFloor.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Star rating pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-black/40 shrink-0 w-10">
                Stars
              </span>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setStarFilter(starFilter === star ? null : star)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                    starFilter === star
                      ? 'bg-yellow-400 text-yellow-900 border-yellow-500'
                      : 'bg-white/70 text-black/60 border-dark/10 hover:bg-white hover:text-black'
                  }`}
                >
                  {'★'.repeat(star)}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-black/40 shrink-0 w-10">
                Date
              </span>
              <label className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-black/50">From</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  className="glass-input h-8 px-2 text-xs font-bold text-black"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-black/50">To</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  className="glass-input h-8 px-2 text-xs font-bold text-black"
                />
              </label>
            </div>

            {/* Active filter summary + Clear All */}
            <div className="flex items-center justify-between pt-1 border-t border-dark/10">
              <p className="text-xs font-bold text-black/50">
                Showing{' '}
                <span className={hasActiveFilters ? 'text-primary' : 'text-black'}>
                  {filteredFeedback.length}
                </span>{' '}
                of {feedbackList.length} reviews
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* ── Feedback cards — design unchanged, now uses filteredFeedback ── */}
          {filteredFeedback.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <p className="text-sm font-bold text-black/60">No reviews match your filters.</p>
            </div>
          ) : (
            filteredFeedback.map((feedback) => (
              <div key={feedback.id} className="glass-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-dark/5 border border-dark/10 flex items-center justify-center text-black font-bold text-sm">
                      {feedback.userName
                        .split(' ')
                        .map((name) => name[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-black text-sm">{feedback.userName}</h4>
                      <p className="text-xs text-black">
                        {feedback.roomName} | {feedback.buildingName}
                      </p>
                    </div>
                  </div>
                  <StarRating rating={feedback.rating} />
                </div>

                <div className="mb-3 rounded-xl border border-dark/10 bg-dark/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">
                        Sentiment Analysis
                      </p>
                      <p className="mt-1 text-sm text-black">
                        {formatSentimentLabel(resolveFeedbackSentimentLabel(feedback))}
                        {typeof feedback.compoundScore === 'number'
                          ? ` (${feedback.compoundScore.toFixed(2)})`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${getSentimentBadgeClasses(
                        resolveFeedbackSentimentLabel(feedback)
                      )}`}
                    >
                      {formatSentimentLabel(resolveFeedbackSentimentLabel(feedback))}
                    </span>
                  </div>

                  {typeof feedback.compoundScore === 'number' &&
                    typeof feedback.positiveScore === 'number' &&
                    typeof feedback.neutralScore === 'number' &&
                    typeof feedback.negativeScore === 'number' && (
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-black sm:grid-cols-4">
                        <div>
                          <p className="font-bold">Compound</p>
                          <p>{feedback.compoundScore.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="font-bold">Positive</p>
                          <p>{Math.round(feedback.positiveScore * 100)}%</p>
                        </div>
                        <div>
                          <p className="font-bold">Neutral</p>
                          <p>{Math.round(feedback.neutralScore * 100)}%</p>
                        </div>
                        <div>
                          <p className="font-bold">Negative</p>
                          <p>{Math.round(feedback.negativeScore * 100)}%</p>
                        </div>
                      </div>
                    )}
                </div>

                <p className="text-sm text-black mb-3 leading-relaxed">{feedback.message}</p>

                {feedback.adminResponse ? (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-3">
                    <p className="text-xs font-bold text-primary mb-1">Admin Response</p>
                    <p className="text-sm text-black">{feedback.adminResponse}</p>
                  </div>
                ) : respondingId === feedback.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={responseText}
                      onChange={(event) => setResponseText(event.target.value)}
                      placeholder="Type your response..."
                      className="glass-input w-full px-4 py-3 text-sm resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setRespondingId(null);
                          setResponseText('');
                        }}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-dark/5 text-black border border-dark/10 hover:bg-primary/10 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleRespondFeedback(feedback.id)}
                        disabled={!responseText.trim()}
                        className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                      >
                        Send Response
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setRespondingId(feedback.id)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary/70 hover:text-primary hover:bg-primary/5 border border-primary/20 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Reply
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
