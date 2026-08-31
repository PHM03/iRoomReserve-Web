'use client';

import { useMemo, useState } from 'react';
import AdminBuildingSelect from '@/components/admin/AdminBuildingSelect';
import {
  resolveFeedbackSentimentLabel,
  summarizeFeedbackSentiment,
  summarizeFeedbackSentimentByGender,
  type FeedbackSentimentSummary,
} from '@/lib/feedback/feedback-sentiment';
import {
  FEEDBACK_ANALYTICS_PERIODS,
  compareFeedbackPeriods,
  filterFeedbackByPeriod,
  getFeedbackCreatedAt,
  scopeFeedbackToBuilding,
  type FeedbackAnalyticsPeriod,
} from '@/lib/feedback/feedback-period';
import {
  FEEDBACK_ANALYTICS_SCOPES,
  scopeFeedback,
  type FeedbackAnalyticsScope,
} from '@/lib/feedback/feedback-scope';
import {
  buildFeedbackInsights,
} from '@/lib/feedback/feedback-insights';
import type { BuildingFeedbackResult } from '@/lib/feedback/feedback';
import {
  FEEDBACK_ASPECT_LABELS,
  FEEDBACK_CATEGORY_KEYS,
  FEEDBACK_CATEGORY_LABELS,
  buildFeedbackDemographicAnalytics,
  buildFeedbackLocationAnalytics,
  compareCategoryPerformance,
  filterFeedbackLocationAnalytics,
  summarizeFeedbackAnalytics,
  SENTIMENT_DISTRIBUTION_ORDER,
  type FeedbackAspectKey,
} from '@/lib/feedback/feedback-analytics';
import { respondToFeedback, type Feedback } from '@/lib/feedback/feedback';
import { ALL_USER_ROLES, normalizeRole } from '@/lib/auth/roles';
import { USER_GENDER_LABELS, USER_GENDER_VALUES, normalizeUserGender } from '@/lib/auth/profile-types';
import type { Room } from '@/lib/rooms/rooms';
import {
  DEFAULT_SCHEDULE_CONTEXT,
  SCHEDULE_ACADEMIC_YEARS,
  SCHEDULE_SEMESTERS,
  type ScheduleAcademicYear,
  type ScheduleSemester,
} from '@/lib/schedules/scheduleContext';
import { formatDateTime } from '@/lib/utils/dateTime';
import {
  formatSentimentLabel,
  getManagedBuildingOptionLabel,
  getSentimentBadgeClasses,
  StarRating,
} from './shared';
import SentimentTrendSection from './SentimentTrendSection';
import {
  ActionableInsightsSection,
  DemographicPerformanceSection,
  FacilityPerformanceSection,
  FeedbackOverviewSection,
  LocationPerformanceSection,
} from './FeedbackAnalyticsSections';

interface BuildingOption {
  id: string;
  name: string;
}

type FeedbackDashboardView = 'analysis' | 'overview' | 'reviews';
type FeedbackReviewView = 'reviews' | 'room-analytics';

interface AdminFeedbackTabProps {
  activeBuildingLabel: string;
  buildingId: string;
  feedbackList: Feedback[];
  feedbackSummary: FeedbackSentimentSummary | null;
  genderBreakdownByPeriod?: BuildingFeedbackResult['genderBreakdownByPeriod'];
  managedBuildings: BuildingOption[];
  onBuildingChange: (buildingId: string) => void;
  onReload: () => Promise<void>;
  feedbackLoading?: boolean;
  feedbackError?: string | null;
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

function getAspectEntries(
  feedback: Feedback,
  sentiment: 'positive' | 'negative'
) {
  return Object.entries(feedback.detectedAspects)
    .filter(([, value]) => value === sentiment)
    .map(([key]) => key as FeedbackAspectKey);
}

function getRankingBarWidth(count: number, maxCount: number) {
  if (maxCount <= 0) {
    return '0%';
  }

  return `${Math.max((count / maxCount) * 100, 8)}%`;
}

function getBroadSentimentPercentages(summary: FeedbackSentimentSummary) {
  return {
    positive: summary.veryPositivePercentage + summary.positivePercentage,
    neutral: summary.neutralPercentage,
    negative: summary.negativePercentage + summary.veryNegativePercentage,
  };
}

function applyFeedbackFilters(
  items: Feedback[],
  starFilter: number | null,
  dateFrom: string,
  dateTo: string,
  roleFilter: string,
  genderFilter: string,
) {
  const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
  const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
  return items.filter((feedback) => {
    if (starFilter !== null && Math.round(feedback.rating) !== starFilter) return false;
    const date = getFeedbackCreatedAt(feedback.createdAt);
    if (from && (!date || date < from)) return false;
    if (to && (!date || date > to)) return false;
    if (roleFilter && normalizeRole(String(feedback.role ?? '')) !== roleFilter) return false;
    if (genderFilter && normalizeUserGender(feedback.gender) !== genderFilter) return false;
    return true;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminFeedbackTab({
  activeBuildingLabel,
  buildingId,
  feedbackList,
  feedbackLoading = false,
  feedbackError = null,
  managedBuildings,
  onBuildingChange,
  onReload,
  rooms = [],
}: Readonly<AdminFeedbackTabProps>) {
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [dashboardView, setDashboardView] = useState<FeedbackDashboardView>('analysis');
  const [reviewView, setReviewView] = useState<FeedbackReviewView>('reviews');

  const [feedbackScope, setFeedbackScope] = useState<FeedbackAnalyticsScope>('building');
  const [feedbackFloor, setFeedbackFloor] = useState('');
  const [feedbackRoomId, setFeedbackRoomId] = useState('');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [analyticsPeriod, setAnalyticsPeriod] = useState<FeedbackAnalyticsPeriod>('all_time');
  const [analyticsAcademicYear, setAnalyticsAcademicYear] = useState<ScheduleAcademicYear>(
    DEFAULT_SCHEDULE_CONTEXT.academicYear,
  );
  const [analyticsSemester, setAnalyticsSemester] = useState<ScheduleSemester>(
    DEFAULT_SCHEDULE_CONTEXT.semester,
  );
  const [analyticsNow] = useState(() => new Date());

  const analyticsScheduleContext = useMemo(
    () => ({ academicYear: analyticsAcademicYear, semester: analyticsSemester }),
    [analyticsAcademicYear, analyticsSemester],
  );

  const buildingFeedbackList = useMemo(
    () => scopeFeedbackToBuilding(feedbackList, buildingId),
    [buildingId, feedbackList]
  );

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

  const buildingRooms = useMemo(
    () => rooms.filter((room) => room.buildingId === buildingId),
    [buildingId, rooms],
  );
  const floorOptions = useMemo(
    () => sortFloors([...new Set(buildingRooms.map((room) => room.floor))]),
    [buildingRooms],
  );
  const roomOptions = useMemo(
    () => [...buildingRooms].sort((left, right) => left.name.localeCompare(right.name)),
    [buildingRooms],
  );
  const selectedFeedbackFloor = floorOptions.includes(feedbackFloor)
    ? feedbackFloor
    : floorOptions[0] ?? '';
  const selectedFeedbackRoomId = roomOptions.some((room) => room.id === feedbackRoomId)
    ? feedbackRoomId
    : roomOptions[0]?.id ?? '';

  // ── Filter logic ─────────────────────────────────────────────────────────

  const scopedFeedback = useMemo(() => scopeFeedback(buildingFeedbackList, {
      buildingId,
      floor: selectedFeedbackFloor,
      roomId: selectedFeedbackRoomId,
      rooms: buildingRooms,
      scope: feedbackScope,
    }), [buildingFeedbackList, buildingId, buildingRooms, feedbackScope, selectedFeedbackFloor, selectedFeedbackRoomId]);

  const filteredFeedback = useMemo(() => {
    const periodFeedback = filterFeedbackByPeriod(
      scopedFeedback,
      analyticsPeriod,
      analyticsNow,
      analyticsScheduleContext,
    );

    return applyFeedbackFilters(periodFeedback.items, starFilter, dateFrom, dateTo, roleFilter, genderFilter);
  }, [analyticsNow, analyticsPeriod, analyticsScheduleContext, dateFrom, dateTo, genderFilter, roleFilter, scopedFeedback, starFilter]);

  const selectedPeriodFeedback = useMemo(() => {
    const comparison = compareFeedbackPeriods(
      scopedFeedback,
      analyticsPeriod,
      analyticsNow,
      analyticsScheduleContext,
    );
    return {
      ...comparison,
      currentItems: applyFeedbackFilters(comparison.currentItems, starFilter, dateFrom, dateTo, roleFilter, genderFilter),
      previousItems: applyFeedbackFilters(comparison.previousItems, starFilter, dateFrom, dateTo, roleFilter, genderFilter),
    };
  }, [analyticsNow, analyticsPeriod, analyticsScheduleContext, dateFrom, dateTo, genderFilter, roleFilter, scopedFeedback, starFilter]);

  const selectedFeedbackSummary = useMemo(() => {
    if (!selectedPeriodFeedback.configured || filteredFeedback.length === 0) return null;
    return {
      ...summarizeFeedbackSentiment(filteredFeedback),
      genderBreakdown: summarizeFeedbackSentimentByGender(filteredFeedback),
    };
  }, [filteredFeedback, selectedPeriodFeedback.configured]);

  const hasActiveFilters =
    feedbackScope !== 'building' || starFilter !== null || !!dateFrom || !!dateTo || !!roleFilter || !!genderFilter;
  const anonymizeFilteredFeedback = Boolean(roleFilter || genderFilter);

  const insightPeriodFeedback = selectedPeriodFeedback;

  const feedbackInsights = useMemo(
    () => buildFeedbackInsights(
      insightPeriodFeedback.currentItems,
      insightPeriodFeedback.previousItems,
      insightPeriodFeedback.comparable,
      buildingRooms,
    ),
    [buildingRooms, insightPeriodFeedback]
  );

  const selectedMetrics = useMemo(() => summarizeFeedbackAnalytics(filteredFeedback), [filteredFeedback]);
  const categoryPerformance = useMemo(
    () => compareCategoryPerformance(filteredFeedback, insightPeriodFeedback.previousItems, insightPeriodFeedback.comparable),
    [filteredFeedback, insightPeriodFeedback.comparable, insightPeriodFeedback.previousItems],
  );
  const locationAnalytics = useMemo(
    () => filterFeedbackLocationAnalytics(
      buildFeedbackLocationAnalytics(
        filteredFeedback,
        insightPeriodFeedback.previousItems,
        buildingRooms,
        insightPeriodFeedback.comparable,
      ),
      feedbackScope,
      buildingId,
      selectedFeedbackFloor,
      selectedFeedbackRoomId,
    ),
    [buildingId, buildingRooms, feedbackScope, filteredFeedback, insightPeriodFeedback.comparable, insightPeriodFeedback.previousItems, selectedFeedbackFloor, selectedFeedbackRoomId],
  );
  const demographicAnalytics = useMemo(
    () => buildFeedbackDemographicAnalytics(filteredFeedback),
    [filteredFeedback],
  );

  const clearFilters = () => {
    setFeedbackScope('building');
    setFeedbackFloor(floorOptions[0] ?? '');
    setFeedbackRoomId('');
    setStarFilter(null);
    setDateFrom('');
    setDateTo('');
    setRoleFilter('');
    setGenderFilter('');
  };

  // ─────────────────────────────────────────────────────────────────────────

  const sentimentDistribution = selectedFeedbackSummary
    ? SENTIMENT_DISTRIBUTION_ORDER.map(
        (label) =>
          selectedFeedbackSummary.sentimentDistribution.find((item) => item.label === label) ?? {
            count: 0,
            label,
            percentage: 0,
          }
      )
    : [];
  const maxIssueCount = selectedFeedbackSummary?.mostMentionedIssues[0]?.count ?? 0;
  const maxPraiseCount = selectedFeedbackSummary?.mostPraisedAspects[0]?.count ?? 0;

  return (
    <div>
      {/* Header — unchanged */}
      <div className="relative z-[60] mb-6 flex flex-col gap-3 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl transition-all duration-300 hover:bg-white/85 hover:shadow-2xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-gray-800">Room Feedback</h3>
          <span className="text-sm text-gray-600">{buildingFeedbackList.length} total</span>
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

      {feedbackLoading ? (
        <div className="glass-card p-6" aria-live="polite">
          <div className="dashboard-empty-state rounded-2xl p-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" aria-hidden="true" />
            <p className="mt-3 text-sm font-bold text-black/60">Loading feedback analytics…</p>
          </div>
        </div>
      ) : feedbackError ? (
        <div className="glass-card p-6" role="alert">
          <div className="dashboard-empty-state rounded-2xl p-10 text-center">
            <p className="text-sm font-bold text-red-700">Unable to load feedback analytics. Please try again.</p>
            <button type="button" onClick={() => void onReload()} className="btn-primary mt-4 px-4 py-2 text-sm">
              Retry
            </button>
          </div>
        </div>
      ) : buildingFeedbackList.length === 0 ? (
        <div className="glass-card p-4">
          <div className="dashboard-empty-state rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">Feedback</div>
          <h4 className="text-lg font-bold text-black mb-1">No Feedback Yet</h4>
          <p className="text-sm text-black">Feedback from room users will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── Existing summary cards — unchanged ── */}
          <div className="glass-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-black">Feedback Analytics</h3>
                <p className="mt-1 text-xs text-black/55">
                  Existing feedback analytics for the selected reporting period.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-black/60">
                <span className="whitespace-nowrap">Period:</span>
                <select
                  aria-label="Feedback analytics period"
                  value={analyticsPeriod}
                  onChange={(event) =>
                    setAnalyticsPeriod(event.target.value as FeedbackAnalyticsPeriod)
                  }
                  className="glass-input h-9 px-3 text-xs font-bold text-black"
                >
                  {FEEDBACK_ANALYTICS_PERIODS.map((period) => (
                    <option key={period} value={period}>
                      {period === 'all_time'
                        ? 'All Time'
                        : period[0].toUpperCase() + period.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              {analyticsPeriod === 'semester' ? (
                <>
                  <label className="flex items-center gap-2 text-xs font-bold text-black/60">
                    <span className="whitespace-nowrap">Academic Year:</span>
                    <select
                      aria-label="Feedback analytics academic year"
                      value={analyticsAcademicYear}
                      onChange={(event) => setAnalyticsAcademicYear(event.target.value as ScheduleAcademicYear)}
                      className="glass-input h-9 px-3 text-xs font-bold text-black"
                    >
                      {SCHEDULE_ACADEMIC_YEARS.map((academicYear) => (
                        <option key={academicYear} value={academicYear}>{academicYear}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-black/60">
                    <span className="whitespace-nowrap">Semester:</span>
                    <select
                      aria-label="Feedback analytics semester"
                      value={analyticsSemester}
                      onChange={(event) => setAnalyticsSemester(event.target.value as ScheduleSemester)}
                      className="glass-input h-9 px-3 text-xs font-bold text-black"
                    >
                      {SCHEDULE_SEMESTERS.map((semester) => (
                        <option key={semester} value={semester}>{semester}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <div className="glass-card flex flex-wrap gap-2 p-2" role="tablist" aria-label="Feedback dashboard sections">
            {([
              ['analysis', 'Data Analysis'],
              ['overview', 'Data Overview'],
              ['reviews', 'Feedback'],
            ] as const).map(([view, label]) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={dashboardView === view}
                onClick={() => setDashboardView(view)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-colors sm:text-sm ${
                  dashboardView === view
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-black/60 hover:bg-white/70 hover:text-black'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Global filters ── */}
          <div className="glass-card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-black/60">Show feedback by:</span>
              <select
                aria-label="Feedback list scope"
                value={feedbackScope}
                onChange={(event) => setFeedbackScope(event.target.value as FeedbackAnalyticsScope)}
                className="glass-input h-8 px-3 text-xs font-bold text-black"
              >
                {FEEDBACK_ANALYTICS_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope[0].toUpperCase() + scope.slice(1)}
                  </option>
                ))}
              </select>
              {feedbackScope === 'floor' ? (
                <select
                  aria-label="Feedback list floor"
                  value={selectedFeedbackFloor}
                  onChange={(event) => setFeedbackFloor(event.target.value)}
                  className="glass-input h-8 px-3 text-xs font-bold text-black"
                >
                  {floorOptions.length === 0 ? <option value="">No floors</option> : null}
                  {floorOptions.map((floor) => <option key={floor} value={floor}>{floor}</option>)}
                </select>
              ) : null}
              {feedbackScope === 'room' ? (
                <select
                  aria-label="Feedback list room"
                  value={selectedFeedbackRoomId}
                  onChange={(event) => setFeedbackRoomId(event.target.value)}
                  className="glass-input h-8 min-w-[180px] px-3 text-xs font-bold text-black"
                >
                  {roomOptions.length === 0 ? <option value="">No rooms</option> : null}
                  {roomOptions.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                </select>
              ) : null}
            </div>

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
                      : 'border-white/45 bg-white/85 text-black/65 shadow-sm hover:bg-white hover:text-black'
                  }`}
                >
                  {'★'.repeat(star)}
                </button>
              ))}
            </div>

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

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-black/40 shrink-0 w-10">Group</span>
              <select
                aria-label="Feedback role filter"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="glass-input h-8 px-3 text-xs font-bold text-black"
              >
                <option value="">All roles</option>
                {ALL_USER_ROLES.filter((role) => role === 'Student' || role === 'Faculty Professor' || role === 'Utility Staff').map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select
                aria-label="Feedback gender filter"
                value={genderFilter}
                onChange={(event) => setGenderFilter(event.target.value)}
                className="glass-input h-8 px-3 text-xs font-bold text-black"
              >
                <option value="">All genders</option>
                {USER_GENDER_VALUES.map((gender) => (
                  <option key={gender} value={gender}>{USER_GENDER_LABELS[gender]}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-dark/10">
              <p className="text-xs font-bold text-black/50">
                Showing{' '}
                <span className={hasActiveFilters ? 'text-primary' : 'text-black'}>
                  {filteredFeedback.length}
                </span>{' '}
                of {buildingFeedbackList.length} reviews
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

          {!selectedPeriodFeedback.configured ? (
            <div className="glass-card p-6">
              <p className="dashboard-empty-state rounded-xl px-3 py-5 text-center text-xs font-bold text-black/50">
                {selectedPeriodFeedback.message}
              </p>
            </div>
          ) : !selectedFeedbackSummary ? (
            <div className="glass-card p-6">
              <p className="dashboard-empty-state rounded-xl px-3 py-5 text-center text-xs font-bold text-black/50">
                No feedback available for this period.
              </p>
            </div>
           ) : (
             <div className="space-y-4">
               {dashboardView === 'overview' ? (
                 <>
                   <FeedbackOverviewSection
                     metrics={selectedMetrics}
                     trendLabel={{
                       improving: 'Improving',
                       declining: 'Declining',
                       stable: 'Stable',
                       not_enough_data: 'Insufficient data',
                     }[feedbackInsights.sentimentDirection]}
                   />
                   <FacilityPerformanceSection categories={categoryPerformance} />
                   <DemographicPerformanceSection groups={demographicAnalytics} />
                 </>
               ) : null}

               {dashboardView === 'analysis' ? (
                 <>
                   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                 {sentimentDistribution.map((item) => (
                  <div key={item.label} className="glass-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">
                        {formatSentimentLabel(item.label)}
                      </p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getSentimentBadgeClasses(
                          item.label
                        )}`}
                      >
                        {item.count}
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-black">
                      {item.percentage.toFixed(1)}%
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-dark/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
                   </div>

                   <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="glass-card p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/55">
                    Average VADER
                  </p>
                  <p className="mt-2 text-3xl font-bold text-black">
                    {selectedFeedbackSummary.averageCompoundScore.toFixed(2)}
                  </p>
                  <p className="text-xs text-black/55">
                    {formatSentimentLabel(
                      resolveFeedbackSentimentLabel({
                        compoundScore: selectedFeedbackSummary.averageCompoundScore,
                      })
                    )}{' '}
                    across {selectedFeedbackSummary.total} reviews
                  </p>
                </div>

                <div className="glass-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
                      Most Mentioned Issues
                    </p>
                    <span className="text-[10px] font-bold text-black/45">Negative mentions</span>
                  </div>
                  {selectedFeedbackSummary.mostMentionedIssues.length === 0 ? (
                    <p className="dashboard-empty-state rounded-xl px-3 py-4 text-center text-xs font-bold text-black/50">
                      No negative aspect mentions yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedFeedbackSummary.mostMentionedIssues.slice(0, 5).map((item, index) => (
                        <div key={item.aspect}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-bold text-black">
                              {index + 1}. {item.label}
                            </span>
                            <span className="font-bold text-red-700">{item.count}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-red-500/10">
                            <div
                              className="h-full rounded-full bg-red-500"
                              style={{ width: getRankingBarWidth(item.count, maxIssueCount) }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-700">
                      Most Praised Aspects
                    </p>
                    <span className="text-[10px] font-bold text-black/45">Positive mentions</span>
                  </div>
                  {selectedFeedbackSummary.mostPraisedAspects.length === 0 ? (
                    <p className="dashboard-empty-state rounded-xl px-3 py-4 text-center text-xs font-bold text-black/50">
                      No positive aspect mentions yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedFeedbackSummary.mostPraisedAspects.slice(0, 5).map((item, index) => (
                        <div key={item.aspect}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-bold text-black">
                              {index + 1}. {item.label}
                            </span>
                            <span className="font-bold text-green-700">{item.count}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-green-500/10">
                            <div
                              className="h-full rounded-full bg-green-500"
                              style={{ width: getRankingBarWidth(item.count, maxPraiseCount) }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                   </div>

                   {(selectedFeedbackSummary.genderBreakdown?.length ?? 0) > 0 && (
                <div className="glass-card p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/55">
                        Sentiment by Gender
                      </p>
                      <p className="mt-1 text-xs text-black/55">
                        Building-wide comparison using each author&apos;s current optional profile value.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-black/45">
                      Groups under 5 samples are suppressed
                    </span>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-2">
                    {selectedFeedbackSummary.genderBreakdown?.map((group) => (
                      <div key={group.group} className="rounded-xl border border-dark/10 bg-white/65 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-black">{group.label}</p>
                            <p className="mt-0.5 text-[11px] font-bold text-black/45">
                              {group.total} feedback {group.total === 1 ? 'sample' : 'samples'}
                            </p>
                          </div>
                          {group.suppressed ? (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                              Insufficient data
                            </span>
                          ) : null}
                        </div>

                        {group.suppressed || !group.summary ? (
                          <p className="mt-4 text-xs font-bold text-black/50">
                            Sentiment metrics are hidden until this group has at least 5 feedback samples.
                          </p>
                        ) : (
                          <>
                            <div className="mt-4 grid gap-3 sm:grid-cols-4">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">
                                  Average VADER
                                </p>
                                <p className="mt-1 text-xl font-bold text-black">
                                  {group.summary.averageCompoundScore.toFixed(2)}
                                </p>
                              </div>
                              {Object.entries(getBroadSentimentPercentages(group.summary)).map(
                                ([label, percentage]) => (
                                  <div key={label}>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">
                                      {label}
                                    </p>
                                    <p className="mt-1 text-xl font-bold text-black">
                                      {percentage.toFixed(1)}%
                                    </p>
                                  </div>
                                )
                              )}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                              {SENTIMENT_DISTRIBUTION_ORDER.map((label) => {
                                const item = group.summary?.sentimentDistribution.find(
                                  (entry) => entry.label === label
                                );

                                return (
                                  <div key={label} className="rounded-lg border border-dark/10 bg-dark/5 px-2 py-2">
                                    <p className="truncate text-[10px] font-bold text-black/55">
                                      {formatSentimentLabel(label)}
                                    </p>
                                    <p className="mt-1 text-sm font-bold text-black">
                                      {item?.percentage.toFixed(1) ?? '0.0'}%
                                    </p>
                                    <p className="text-[10px] font-bold text-black/40">
                                      {item?.count ?? 0} samples
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                   )}
                   <ActionableInsightsSection insights={feedbackInsights.actionableInsights} />
                 </>
               ) : null}
             </div>
           )}

          {dashboardView === 'reviews' ? (
            <>
              <div className="glass-card flex flex-wrap gap-2 p-2" role="tablist" aria-label="Feedback review views">
                {([
                  ['reviews', 'Reviews'],
                  ['room-analytics', 'Room Analytics'],
                ] as const).map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={reviewView === view}
                    onClick={() => setReviewView(view)}
                    className={`flex-1 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors sm:text-sm ${
                      reviewView === view
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-black/60 hover:bg-white/70 hover:text-black'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {reviewView === 'room-analytics' ? (
                <>
                  <SentimentTrendSection
                    feedbackList={filteredFeedback}
                    period={analyticsPeriod}
                    scheduleContext={analyticsScheduleContext}
                    hideControls
                  />
                  <LocationPerformanceSection analytics={locationAnalytics} />
                </>
              ) : null}
            </>
          ) : null}

          {dashboardView === 'reviews' && reviewView === 'reviews' ? (
            <>
              {/* ── Feedback cards — design unchanged, now uses filteredFeedback ── */}
              {filteredFeedback.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <p className="text-sm font-bold text-black/60">No reviews match your filters.</p>
            </div>
          ) : (
            filteredFeedback.map((feedback) => {
              const sentimentLabel = resolveFeedbackSentimentLabel(feedback);
              const positiveAspects = getAspectEntries(feedback, 'positive');
              const negativeAspects = getAspectEntries(feedback, 'negative');
              const categoryEntries = FEEDBACK_CATEGORY_KEYS.filter(
                (key) => typeof feedback.categoryRatings[key] === 'number'
              );

              return (
              <div key={feedback.id} className="glass-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-dark/5 border border-dark/10 flex items-center justify-center text-black font-bold text-sm">
                      {anonymizeFilteredFeedback ? '?' : feedback.userName
                        .split(' ')
                        .map((name) => name[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-black text-sm">{anonymizeFilteredFeedback ? 'Anonymous user' : feedback.userName}</h4>
                      <p className="text-xs text-black">
                        {feedback.roomName} | {feedback.buildingName}
                      </p>
                      <p className="mt-0.5 text-[11px] font-bold text-black/45">
                        Submitted {feedback.createdAt ? formatDateTime(feedback.createdAt) : 'date unavailable'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StarRating rating={feedback.overallRating} />
                    <span className="text-[10px] font-bold text-black/45">
                      Overall {feedback.overallRating}/5
                    </span>
                  </div>
                </div>

                <div className="mb-3 rounded-xl border border-dark/10 bg-dark/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">
                        Sentiment Analysis
                      </p>
                      <p className="mt-1 text-sm text-black">
                        {formatSentimentLabel(sentimentLabel)}
                        {typeof feedback.compoundScore === 'number'
                          ? ` (${feedback.compoundScore.toFixed(2)})`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${getSentimentBadgeClasses(
                        sentimentLabel
                      )}`}
                    >
                      {formatSentimentLabel(sentimentLabel)}
                    </span>
                  </div>

                  {typeof feedback.compoundScore === 'number' &&
                    typeof feedback.positiveScore === 'number' &&
                    typeof feedback.neutralScore === 'number' &&
                    typeof feedback.negativeScore === 'number' && (
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-black sm:grid-cols-4">
                        <div>
                          <p className="font-bold">VADER Compound</p>
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

                {categoryEntries.length > 0 && (
                  <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {categoryEntries.map((key) => (
                      <div key={key} className="rounded-xl border border-dark/10 bg-white/70 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">
                          {FEEDBACK_CATEGORY_LABELS[key]}
                        </p>
                        <p className="mt-1 text-sm font-bold text-black">
                          {feedback.categoryRatings[key]}/5
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mb-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-green-700">
                      Detected Positive Aspects
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {positiveAspects.length > 0 ? (
                        positiveAspects.map((aspect) => (
                          <span key={aspect} className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-700">
                            {FEEDBACK_ASPECT_LABELS[aspect]}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs font-bold text-black/40">None detected</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-red-700">
                      Detected Negative Aspects
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {negativeAspects.length > 0 ? (
                        negativeAspects.map((aspect) => (
                          <span key={aspect} className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            {FEEDBACK_ASPECT_LABELS[aspect]}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs font-bold text-black/40">None detected</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mb-3 rounded-xl border border-dark/10 bg-white/70 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-black/45">
                    Extracted Keywords
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {feedback.extractedKeywords.length > 0 ? (
                      feedback.extractedKeywords.map((keyword) => (
                        <span key={keyword} className="rounded-full border border-dark/10 bg-dark/5 px-2 py-0.5 text-[10px] font-bold text-black/60">
                          {keyword}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs font-bold text-black/40">No keywords extracted</span>
                    )}
                  </div>
                </div>

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
              );
            })
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
