import { useMemo, useState } from 'react';
import {
  FEEDBACK_ASPECT_KEYS,
  FEEDBACK_ASPECT_LABELS,
  FEEDBACK_CATEGORY_KEYS,
  FEEDBACK_CATEGORY_LABELS,
  type AspectPerformance,
  type CategoryPerformance,
  type DemographicPerformance,
  type FeedbackAnalyticsMetrics,
  type FeedbackAspectKey,
  type FeedbackCategoryRatingKey,
  type FeedbackLocationAnalytics,
  type FeedbackAnalyticsDirection,
  type LocationPerformance,
} from '@/lib/feedback/feedback-analytics';

function displayNumber(value: number | null, suffix = '') {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}${suffix}`;
}

function displaySentiment(value: number | null) {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(2);
}

function directionLabel(direction: FeedbackAnalyticsDirection) {
  if (direction === 'improving') return '↑ Improving';
  if (direction === 'worsening') return '↓ Worsening';
  if (direction === 'stable') return '→ Stable';
  return 'Insufficient data';
}

function directionClass(direction: FeedbackAnalyticsDirection) {
  if (direction === 'improving') return 'text-emerald-700';
  if (direction === 'worsening') return 'text-red-700';
  if (direction === 'stable') return 'text-slate-700';
  return 'text-amber-700';
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="glass-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/55">{label}</p>
      <p className="mt-2 text-2xl font-bold text-black">{value}</p>
      {detail ? <p className="mt-1 text-xs text-black/50">{detail}</p> : null}
    </div>
  );
}

export function FeedbackOverviewSection({
  metrics,
  trendLabel,
}: {
  metrics: FeedbackAnalyticsMetrics;
  trendLabel: string;
}) {
  return (
    <section className="glass-card p-4" aria-labelledby="feedback-overview-heading">
      <div className="mb-3">
        <h3 id="feedback-overview-heading" className="text-base font-bold text-black">Overview Metrics</h3>
        <p className="mt-1 text-xs text-black/55">All values reflect the active date, location, rating, and demographic filters.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Reviews" value={String(metrics.totalReviews)} />
        <MetricCard label="Average Rating" value={displayNumber(metrics.averageRating, ' / 5')} />
        <MetricCard label="Positive Sentiment" value={displayNumber(metrics.positiveRate, '%')} detail={`${metrics.positiveCount} positive or very positive`} />
        <MetricCard label="Negative Sentiment" value={displayNumber(metrics.negativeRate, '%')} detail={`${metrics.negativeCount} negative or very negative`} />
        <MetricCard label="Trend Direction" value={trendLabel} detail={`Neutral: ${displayNumber(metrics.neutralRate, '%')}`} />
      </div>
    </section>
  );
}

function LocationTable({
  title,
  items,
  showFloor = false,
}: {
  title: string;
  items: FeedbackLocationAnalytics['rooms'];
  showFloor?: boolean;
}) {
  const ranked = [...items].sort((left, right) => Number(right.reliable) - Number(left.reliable) || right.negativeRate - left.negativeRate);
  return (
    <div className="rounded-xl border border-dark/10 bg-white/65 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-black">{title}</h4>
        <span className="text-[10px] font-bold text-black/45">Highest negative rate first</span>
      </div>
      {ranked.length === 0 ? (
        <p className="dashboard-empty-state rounded-xl px-3 py-5 text-center text-xs text-black/50">No feedback available for the selected filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-[0.12em] text-black/45">
              <tr>
                <th className="pb-2 pr-3">Location</th>
                {showFloor ? <th className="pb-2 pr-3">Floor</th> : null}
                <th className="pb-2 pr-3">Reviews</th>
                <th className="pb-2 pr-3">Avg rating</th>
                <th className="pb-2 pr-3">Positive</th>
                <th className="pb-2 pr-3">Negative</th>
                <th
                  className="pb-2 pr-3"
                  title="VADER sentiment score ranges from -1 (very negative) to +1 (very positive)."
                >
                  Avg Sentiment Score (VADER)
                </th>
                <th className="pb-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((item) => (
                <tr key={item.id} className="border-t border-dark/10">
                  <td className="py-2 pr-3 font-bold text-black">{item.name}</td>
                  {showFloor ? <td className="py-2 pr-3 text-black/65">{item.floor ?? '—'}</td> : null}
                  <td className="py-2 pr-3 text-black/65">{item.totalReviews}</td>
                  <td className="py-2 pr-3 font-bold text-black">{displayNumber(item.averageRating, ' / 5')}</td>
                  <td className="py-2 pr-3 text-emerald-700">{displayNumber(item.positiveRate, '%')}</td>
                  <td className="py-2 pr-3 text-red-700">{displayNumber(item.negativeRate, '%')}</td>
                  <td className="py-2 pr-3 font-bold text-black">{displaySentiment(item.averageCompound)}</td>
                  <td className={`py-2 font-bold ${directionClass(item.trendDirection)}`}>{item.totalReviews === 0 ? 'No feedback yet' : item.reliable ? directionLabel(item.trendDirection) : 'Insufficient data'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ALL_LOCATION_FILTER = 'all';

function weightedAverage<T>(items: T[], value: (item: T) => number | null, weight: (item: T) => number) {
  const weightedItems = items
    .map((item) => ({ value: value(item), weight: weight(item) }))
    .filter((item): item is { value: number; weight: number } => item.value !== null && item.weight > 0);
  const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
  return totalWeight > 0
    ? Number((weightedItems.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight).toFixed(2))
    : null;
}

function aggregateLocationPerformance(items: LocationPerformance[]): LocationPerformance | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const totalReviews = items.reduce((sum, item) => sum + item.totalReviews, 0);
  const categoryRatings = {} as Partial<Record<FeedbackCategoryRatingKey, CategoryPerformance>>;
  const aspectMentions = {} as Partial<Record<FeedbackAspectKey, AspectPerformance>>;

  FEEDBACK_CATEGORY_KEYS.forEach((key) => {
    const categories = items
      .map((item) => item.categoryRatings[key])
      .filter((category): category is CategoryPerformance => Boolean(category));
    const ratingCount = categories.reduce((sum, category) => sum + category.ratingCount, 0);
    const lowRatingCount = categories.reduce((sum, category) => sum + category.lowRatingCount, 0);
    categoryRatings[key] = {
      category: key,
      label: FEEDBACK_CATEGORY_LABELS[key],
      averageRating: weightedAverage(categories, (category) => category.averageRating, (category) => category.ratingCount),
      ratingCount,
      lowRatingCount,
      lowRatingRate: ratingCount > 0 ? Number(((lowRatingCount / ratingCount) * 100).toFixed(1)) : 0,
      negativeMentionCount: categories.reduce((sum, category) => sum + category.negativeMentionCount, 0),
      previousAverageRating: null,
      previousLowRatingRate: null,
      averageChange: null,
      lowRatingRateChangePoints: null,
      direction: 'insufficient',
      reliable: ratingCount >= 5,
    };
  });

  FEEDBACK_ASPECT_KEYS.forEach((key) => {
    const aspects = items
      .map((item) => item.aspectMentions[key])
      .filter((aspect): aspect is AspectPerformance => Boolean(aspect));
    aspectMentions[key] = {
      total: aspects.reduce((sum, aspect) => sum + aspect.total, 0),
      positiveCount: aspects.reduce((sum, aspect) => sum + aspect.positiveCount, 0),
      neutralCount: aspects.reduce((sum, aspect) => sum + aspect.neutralCount, 0),
      negativeCount: aspects.reduce((sum, aspect) => sum + aspect.negativeCount, 0),
    };
  });

  return {
    ...items[0],
    id: 'selected-locations',
    name: 'Selected locations',
    floor: null,
    totalReviews,
    averageRating: weightedAverage(items, (item) => item.averageRating, (item) => item.totalReviews),
    averageCompound: weightedAverage(items, (item) => item.averageCompound, (item) => item.totalReviews),
    positiveCount: items.reduce((sum, item) => sum + item.positiveCount, 0),
    neutralCount: items.reduce((sum, item) => sum + item.neutralCount, 0),
    negativeCount: items.reduce((sum, item) => sum + item.negativeCount, 0),
    positiveRate: totalReviews > 0 ? Number(((items.reduce((sum, item) => sum + item.positiveCount, 0) / totalReviews) * 100).toFixed(1)) : 0,
    neutralRate: totalReviews > 0 ? Number(((items.reduce((sum, item) => sum + item.neutralCount, 0) / totalReviews) * 100).toFixed(1)) : 0,
    negativeRate: totalReviews > 0 ? Number(((items.reduce((sum, item) => sum + item.negativeCount, 0) / totalReviews) * 100).toFixed(1)) : 0,
    categoryRatings,
    aspectMentions,
    reliable: totalReviews >= 5,
    trendDirection: 'insufficient',
    relevantFacilityConcerns: [],
  };
}

function getConcernAspectKey(category: FeedbackCategoryRatingKey | typeof ALL_LOCATION_FILTER) {
  if (category === 'equipment_projector') return 'equipment';
  if (category === 'internet_connectivity') return 'internet';
  return category === ALL_LOCATION_FILTER ? null : category;
}

export function LocationPerformanceSection({
  analytics,
  activeBuildingLabel,
}: {
  analytics: FeedbackLocationAnalytics;
  activeBuildingLabel: string;
}) {
  const [floorFilter, setFloorFilter] = useState(ALL_LOCATION_FILTER);
  const [roomFilter, setRoomFilter] = useState(ALL_LOCATION_FILTER);
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategoryRatingKey | typeof ALL_LOCATION_FILTER>(ALL_LOCATION_FILTER);
  const [showAllConcerns, setShowAllConcerns] = useState(false);

  const floors = useMemo(() => analytics.floors, [analytics.floors]);
  const selectedFloor = floors.some((floor) => floor.id === floorFilter) ? floorFilter : ALL_LOCATION_FILTER;
  const selectedFloorValue = floors.find((floor) => floor.id === selectedFloor)?.floor ?? null;
  const rooms = useMemo(
    () => analytics.rooms.filter((room) =>
      (selectedFloorValue === null || room.floor === selectedFloorValue)
    ),
    [analytics.rooms, selectedFloorValue],
  );
  const selectedRoom = rooms.some((room) => room.id === roomFilter) ? roomFilter : ALL_LOCATION_FILTER;

  const selectedItems = useMemo(() => {
    if (selectedRoom !== ALL_LOCATION_FILTER) return rooms.filter((room) => room.id === selectedRoom);
    if (selectedFloor !== ALL_LOCATION_FILTER) return floors.filter((floor) => floor.id === selectedFloor);
    return analytics.buildings;
  }, [analytics.buildings, floors, rooms, selectedFloor, selectedRoom]);
  const selectedPerformance = useMemo(() => aggregateLocationPerformance(selectedItems), [selectedItems]);

  const visibleCategories = useMemo(() => {
    if (!selectedPerformance) return [];
    return FEEDBACK_CATEGORY_KEYS
      .filter((key) => categoryFilter === ALL_LOCATION_FILTER || key === categoryFilter)
      .map((key) => selectedPerformance.categoryRatings[key])
      .filter((category): category is CategoryPerformance => Boolean(category));
  }, [categoryFilter, selectedPerformance]);

  const concernEntries = useMemo(() => {
    if (selectedItems.length === 0) return [];
    const counts = new Map<string, number>();
    const selectedAspect = getConcernAspectKey(categoryFilter);
    selectedItems.forEach((item) => {
      Object.entries(item.aspectMentions).forEach(([key, aspect]) => {
        if (selectedAspect && key !== selectedAspect) return;
        if (aspect?.negativeCount) {
          const label = FEEDBACK_ASPECT_LABELS[key as FeedbackAspectKey];
          counts.set(label, (counts.get(label) ?? 0) + aspect.negativeCount);
        }
      });
    });
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [categoryFilter, selectedItems]);

  const visibleBuildings = analytics.buildings;
  const visibleFloors = floors.filter((floor) => selectedFloor === ALL_LOCATION_FILTER || floor.id === selectedFloor);
  const visibleRooms = rooms.filter((room) => selectedRoom === ALL_LOCATION_FILTER || room.id === selectedRoom);
  const displayedConcerns = showAllConcerns ? concernEntries : concernEntries.slice(0, 3);

  return (
    <section className="glass-card p-4" aria-labelledby="location-performance-heading">
      <div className="mb-4">
        <h3 id="location-performance-heading" className="text-base font-bold text-black">Location Performance</h3>
        <p className="mt-1 text-xs font-bold text-black/65">Building: {activeBuildingLabel}</p>
        <p className="mt-1 text-xs text-black/55">Refines the globally filtered feedback set. Comparative labels require at least five reviews. VADER sentiment scores range from -1 (very negative) to +1 (very positive).</p>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-dark/10 bg-white/55 p-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/50">
          Floor
          <select
            aria-label="Location performance floor"
            value={selectedFloor}
            onChange={(event) => {
              setFloorFilter(event.target.value);
              setRoomFilter(ALL_LOCATION_FILTER);
            }}
            className="glass-input h-8 px-2 text-xs font-bold normal-case tracking-normal text-black"
          >
            <option value={ALL_LOCATION_FILTER}>All</option>
            {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/50">
          Room
          <select
            aria-label="Location performance room"
            value={selectedRoom}
            onChange={(event) => setRoomFilter(event.target.value)}
            className="glass-input h-8 px-2 text-xs font-bold normal-case tracking-normal text-black"
          >
            <option value={ALL_LOCATION_FILTER}>All</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/50">
          Category
          <select
            aria-label="Location performance category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as FeedbackCategoryRatingKey | typeof ALL_LOCATION_FILTER)}
            className="glass-input h-8 px-2 text-xs font-bold normal-case tracking-normal text-black"
          >
            <option value={ALL_LOCATION_FILTER}>All</option>
            {FEEDBACK_CATEGORY_KEYS.map((key) => <option key={key} value={key}>{FEEDBACK_CATEGORY_LABELS[key]}</option>)}
          </select>
        </label>
      </div>

      {selectedPerformance ? (
        <>
          <div className="mb-3 rounded-xl border border-dark/10 bg-white/65 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-black">Performance summary</h4>
                <p className="mt-1 text-xs text-black/50">{selectedPerformance.name}</p>
              </div>
              <span className={`text-[10px] font-bold ${directionClass(selectedPerformance.trendDirection)}`}>
                {selectedPerformance.totalReviews < 5 ? 'Insufficient data' : directionLabel(selectedPerformance.trendDirection)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-black/45">Reviews</p><p className="mt-1 text-lg font-bold text-black">{selectedPerformance.totalReviews}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-black/45">Avg rating</p><p className="mt-1 text-lg font-bold text-black">{displayNumber(selectedPerformance.averageRating, ' / 5')}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-black/45">Avg VADER</p><p className="mt-1 text-lg font-bold text-black">{displaySentiment(selectedPerformance.averageCompound)}</p></div>
              <div><p className="text-[10px] uppercase tracking-[0.12em] text-black/45">Negative</p><p className="mt-1 text-lg font-bold text-red-700">{displayNumber(selectedPerformance.negativeRate, '%')}</p></div>
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-black">Facility performance</h4>
              <span className="text-[10px] text-black/45">{visibleCategories.length} categories</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {visibleCategories.map((category) => <CategoryCard key={category.category} category={category} />)}
            </div>
          </div>

          <details className="mb-3 rounded-xl border border-dark/10 bg-white/55 p-3">
            <summary className="cursor-pointer text-xs font-bold text-black">View location breakdown</summary>
            <div className="mt-3 space-y-3">
              <LocationTable title="Buildings" items={visibleBuildings} />
              <LocationTable title="Floors" items={visibleFloors} showFloor />
              <LocationTable title="Rooms" items={visibleRooms} showFloor />
            </div>
          </details>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-amber-800">Top Concerns</h4>
              <span className="text-[10px] font-bold text-black/45">{concernEntries.length} found</span>
            </div>
            {displayedConcerns.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {displayedConcerns.map((concern) => (
                  <div key={concern.label} className="flex items-center justify-between gap-2 text-xs text-black/70">
                    <span>{concern.label}</span>
                    <span className="font-bold text-amber-800">{concern.count} {concern.count === 1 ? 'mention' : 'mentions'}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-xs text-black/55">No negative concerns for the selected filters.</p>}
            {concernEntries.length > 3 ? (
              <button
                type="button"
                onClick={() => setShowAllConcerns((current) => !current)}
                className="mt-3 text-xs font-bold text-primary hover:text-primary/80"
              >
                {showAllConcerns ? 'Show top concerns' : 'View all concerns'}
              </button>
            ) : null}
          </div>
        </>
      ) : <p className="dashboard-empty-state rounded-xl px-3 py-5 text-center text-xs text-black/50">No location performance data is available for the selected filters.</p>}
    </section>
  );
}

function CategoryCard({ category }: { category: CategoryPerformance }) {
  return (
    <div className="rounded-xl border border-dark/10 bg-white/65 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-black">{category.label}</p>
        <span className={`text-[10px] font-bold ${directionClass(category.direction)}`}>{directionLabel(category.direction)}</span>
      </div>
      <p className="mt-3 text-xl font-bold text-black">{displayNumber(category.averageRating, ' / 5')}</p>
      <p className="text-xs text-black/50">{category.ratingCount} ratings · low ratings: {displayNumber(category.lowRatingRate, '%')}</p>
      <p className="mt-2 text-xs text-black/65">Negative comments mentioning aspect: {category.negativeMentionCount}</p>
      {category.averageChange !== null ? <p className="mt-1 text-[10px] font-bold text-black/45">Average change: {category.averageChange > 0 ? '+' : ''}{category.averageChange.toFixed(2)} points</p> : null}
    </div>
  );
}

export function FacilityPerformanceSection({ categories }: { categories: Partial<Record<string, CategoryPerformance>> }) {
  const items = Object.values(categories).filter((category): category is CategoryPerformance => Boolean(category));
  return (
    <section className="glass-card p-4" aria-labelledby="facility-performance-heading">
      <div className="mb-4">
        <h3 id="facility-performance-heading" className="text-base font-bold text-black">Facility Performance</h3>
        <p className="mt-1 text-xs text-black/55">Structured category ratings are the performance signal; detected text aspects provide supporting evidence.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {items.map((category) => <CategoryCard key={category.category} category={category} />)}
      </div>
    </section>
  );
}

export function DemographicPerformanceSection({ groups }: { groups: DemographicPerformance[] }) {
  const roleGroups = groups.filter((group) => !group.group.startsWith('gender:'));
  const genderGroups = groups.filter((group) => group.group.startsWith('gender:'));
  const renderGroups = (items: DemographicPerformance[]) => (
    <div className="grid gap-3 md:grid-cols-2">
      {items.length === 0 ? <p className="text-xs text-black/50">No demographic data is available for the selected filters.</p> : null}
      {items.map((group) => (
        <div key={group.group} className="rounded-xl border border-dark/10 bg-white/65 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-black">{group.label}</p>
              <p className="text-[10px] font-bold text-black/45">{group.totalReviews} reviews</p>
            </div>
            {!group.reliable ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-800">Insufficient data</span> : null}
          </div>
          {group.reliable ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-[10px] text-black/45">Positive</p><p className="font-bold text-emerald-700">{displayNumber(group.positiveRate, '%')}</p></div>
              <div><p className="text-[10px] text-black/45">Negative</p><p className="font-bold text-red-700">{displayNumber(group.negativeRate, '%')}</p></div>
              <div><p className="text-[10px] text-black/45">Avg rating</p><p className="font-bold text-black">{displayNumber(group.averageRating)}</p></div>
            </div>
          ) : <p className="mt-3 text-xs font-bold text-black/50">Metrics are hidden until this group has at least five reviews.</p>}
        </div>
      ))}
    </div>
  );

  return (
    <section className="glass-card p-4" aria-labelledby="demographic-performance-heading">
      <div className="mb-4">
        <h3 id="demographic-performance-heading" className="text-base font-bold text-black">User Group Analysis</h3>
        <p className="mt-1 text-xs text-black/55">Aggregate comparisons only. Groups with fewer than five reviews are not ranked.</p>
      </div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-black/55">Role</h4>
      {renderGroups(roleGroups)}
      <h4 className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.14em] text-black/55">Gender</h4>
      {renderGroups(genderGroups)}
    </section>
  );
}

export function ActionableInsightsSection({ insights }: { insights: string[] }) {
  return (
    <section className="glass-card p-4" aria-labelledby="actionable-insights-heading">
      <div className="mb-3">
        <h3 id="actionable-insights-heading" className="text-base font-bold text-black">Actionable Insights</h3>
        <p className="mt-1 text-xs text-black/55">Deterministic findings based on the filtered feedback set.</p>
      </div>
      {insights.length === 0 ? <p className="dashboard-empty-state rounded-xl px-3 py-5 text-center text-xs text-black/50">No actionable insight is available.</p> : (
        <ul className="space-y-2">
          {insights.map((insight) => <li key={insight} className="rounded-xl border border-dark/10 bg-white/65 px-3 py-2 text-xs font-bold text-black/70">{insight}</li>)}
        </ul>
      )}
    </section>
  );
}
