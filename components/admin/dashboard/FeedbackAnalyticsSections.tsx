import { useMemo, useRef, useState, type MouseEvent } from 'react';
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
import {
  sortLocationPerformance,
  type FloorBreakdownSort,
  type FloorBreakdownSortKey,
} from '@/lib/feedback/feedback-location-sorting';

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

function SortableHeader({
  label,
  sortKey,
  sort,
  onSortChange,
  title,
}: {
  label: string;
  sortKey: FloorBreakdownSortKey;
  sort: FloorBreakdownSort;
  onSortChange: (sort: FloorBreakdownSort) => void;
  title?: string;
}) {
  const isActive = sort.key === sortKey;
  const direction = isActive ? sort.direction : null;
  return (
    <th
      scope="col"
      className="pb-2 pr-3"
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSortChange({
          key: sortKey,
          direction: isActive && sort.direction === 'asc' ? 'desc' : 'asc',
        })}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md text-left transition-colors hover:text-black focus:outline-none focus:ring-2 focus:ring-primary/40"
        aria-label={`Sort by ${label}${direction ? `, currently ${direction}` : ''}`}
      >
        <span>{label}</span>
        <span className={`text-sm leading-none ${isActive ? 'text-primary' : 'text-black/30'}`} aria-hidden="true">
          {direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕'}
        </span>
      </button>
    </th>
  );
}

function LocationTable({
  title,
  items,
  showBuildingContext = false,
  showFloor = false,
  nameHeader = 'Location',
  nameSortKey,
  sort,
  onSortChange,
}: {
  title: string;
  items: FeedbackLocationAnalytics['rooms'];
  showBuildingContext?: boolean;
  showFloor?: boolean;
  nameHeader?: string;
  nameSortKey?: 'floor' | 'room';
  sort?: FloorBreakdownSort;
  onSortChange?: (sort: FloorBreakdownSort) => void;
}) {
  const ranked = sort
    ? sortLocationPerformance(items, sort)
    : [...items].sort((left, right) => Number(right.reliable) - Number(left.reliable) || right.negativeRate - left.negativeRate);
  return (
    <div className="rounded-xl border border-dark/10 bg-white/65 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-black">{title}</h4>
        {!sort || !onSortChange ? (
          <span className="text-[10px] font-bold text-black/45">Highest negative rate first</span>
        ) : null}
      </div>
      {ranked.length === 0 ? (
        <p className="dashboard-empty-state rounded-xl px-3 py-5 text-center text-xs text-black/50">No feedback available for the selected filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-[0.12em] text-black/45">
              <tr>
                {sort && onSortChange && nameSortKey ? (
                  <SortableHeader label={nameHeader} sortKey={nameSortKey} sort={sort} onSortChange={onSortChange} />
                ) : (
                  <th scope="col" className="pb-2 pr-3">{nameHeader}</th>
                )}
                {showBuildingContext ? <th scope="col" className="pb-2 pr-3">Building</th> : null}
                {showFloor ? (
                  sort && onSortChange ? (
                    <SortableHeader label="Floor" sortKey="floor" sort={sort} onSortChange={onSortChange} />
                  ) : (
                    <th scope="col" className="pb-2 pr-3">Floor</th>
                  )
                ) : null}
                {sort && onSortChange ? <SortableHeader label="Reviews" sortKey="reviews" sort={sort} onSortChange={onSortChange} /> : <th className="pb-2 pr-3">Reviews</th>}
                {sort && onSortChange ? <SortableHeader label="Avg rating" sortKey="rating" sort={sort} onSortChange={onSortChange} /> : <th className="pb-2 pr-3">Avg rating</th>}
                {sort && onSortChange ? <SortableHeader label="Positive" sortKey="positive" sort={sort} onSortChange={onSortChange} /> : <th className="pb-2 pr-3">Positive</th>}
                {sort && onSortChange ? <SortableHeader label="Negative" sortKey="negative" sort={sort} onSortChange={onSortChange} /> : <th className="pb-2 pr-3">Negative</th>}
                {sort && onSortChange ? (
                  <SortableHeader
                    label="Avg Sentiment Score (VADER)"
                    sortKey="sentiment"
                    sort={sort}
                    onSortChange={onSortChange}
                    title="VADER sentiment score ranges from -1 (very negative) to +1 (very positive)."
                  />
                ) : (
                  <th className="pb-2 pr-3" title="VADER sentiment score ranges from -1 (very negative) to +1 (very positive).">Avg Sentiment Score (VADER)</th>
                )}
                {sort && onSortChange ? <SortableHeader label="Trend" sortKey="trend" sort={sort} onSortChange={onSortChange} /> : <th className="pb-2">Trend</th>}
              </tr>
            </thead>
            <tbody>
              {ranked.map((item) => (
                <tr key={item.id} className="border-t border-dark/10">
                  <td className="py-2 pr-3 font-bold text-black">{item.name}</td>
                  {showBuildingContext ? <td className="py-2 pr-3 text-black/65">{item.buildingId}</td> : null}
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
const CONCERN_CHART_COLORS = ['#2563eb', '#db2777', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#ea580c'];
const DONUT_RADIUS = 78;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const CONCERN_TOOLTIP_WIDTH = 176;
const CONCERN_TOOLTIP_HEIGHT = 58;

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
  showBuildingContext = false,
}: {
  analytics: FeedbackLocationAnalytics;
  activeBuildingLabel: string;
  showBuildingContext?: boolean;
}) {
  const [floorFilter, setFloorFilter] = useState(ALL_LOCATION_FILTER);
  const [roomFilter, setRoomFilter] = useState(ALL_LOCATION_FILTER);
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategoryRatingKey | typeof ALL_LOCATION_FILTER>(ALL_LOCATION_FILTER);
  const [floorSort, setFloorSort] = useState<FloorBreakdownSort>({ key: 'floor', direction: 'asc' });
  const [roomSort, setRoomSort] = useState<FloorBreakdownSort>({ key: 'room', direction: 'asc' });
  const [activeConcern, setActiveConcern] = useState<string | null>(null);
  const [hoveredConcern, setHoveredConcern] = useState<string | null>(null);
  const [concernTooltipPosition, setConcernTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const concernChartRef = useRef<HTMLDivElement>(null);

  const floors = useMemo(() => analytics.floors, [analytics.floors]);
  const selectedFloor = floors.some((floor) => floor.id === floorFilter) ? floorFilter : ALL_LOCATION_FILTER;
  const selectedFloorItem = floors.find((floor) => floor.id === selectedFloor);
  const selectedFloorValue = selectedFloorItem?.floor ?? null;
  const rooms = useMemo(
    () => analytics.rooms.filter((room) =>
      selectedFloorValue === null
      || (
        room.floor === selectedFloorValue
        && (!showBuildingContext || room.buildingId === selectedFloorItem?.buildingId)
      )
    ),
    [analytics.rooms, selectedFloorItem?.buildingId, selectedFloorValue, showBuildingContext],
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
  const totalConcernMentions = concernEntries.reduce((sum, concern) => sum + concern.count, 0);
  const concernChartSegments = useMemo(() => {
    if (totalConcernMentions === 0) return [];
    let offset = 0;
    return concernEntries.map((concern, index) => {
      const percentage = (concern.count / totalConcernMentions) * 100;
      const segmentLength = (percentage / 100) * DONUT_CIRCUMFERENCE;
      const segment = {
        ...concern,
        color: CONCERN_CHART_COLORS[index % CONCERN_CHART_COLORS.length],
        percentage,
        dashArray: `${segmentLength} ${DONUT_CIRCUMFERENCE - segmentLength}`,
        dashOffset: -offset,
      };
      offset += segmentLength;
      return segment;
    });
  }, [concernEntries, totalConcernMentions]);
  const hoveredConcernDetails = concernChartSegments.find((concern) => concern.label === hoveredConcern) ?? null;
  const updateConcernHover = (event: MouseEvent<SVGCircleElement>, label: string) => {
    setActiveConcern(label);
    setHoveredConcern(label);
    const chartBounds = concernChartRef.current?.getBoundingClientRect();
    if (!chartBounds) return;

    const cursorX = event.clientX - chartBounds.left;
    const cursorY = event.clientY - chartBounds.top;
    const gap = 12;
    const maxLeft = Math.max(8, chartBounds.width - CONCERN_TOOLTIP_WIDTH - 8);
    const maxTop = Math.max(8, chartBounds.height - CONCERN_TOOLTIP_HEIGHT - 8);
    let left = cursorX + gap;
    let top = cursorY - CONCERN_TOOLTIP_HEIGHT - gap;

    if (left > maxLeft) left = cursorX - CONCERN_TOOLTIP_WIDTH - gap;
    if (top < 8) top = cursorY + gap;

    setConcernTooltipPosition({
      left: Math.max(8, Math.min(left, maxLeft)),
      top: Math.max(8, Math.min(top, maxTop)),
    });
  };
  const clearConcernHover = () => {
    setActiveConcern(null);
    setHoveredConcern(null);
    setConcernTooltipPosition(null);
  };

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
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {showBuildingContext ? `${floor.name} — ${floor.buildingId}` : floor.name}
              </option>
            ))}
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
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {showBuildingContext ? `${room.name} — ${room.buildingId}` : room.name}
              </option>
            ))}
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
              <LocationTable title="Buildings" items={visibleBuildings} showBuildingContext={showBuildingContext} />
              <LocationTable
                title="Floor Breakdown"
                items={visibleFloors}
                showBuildingContext={showBuildingContext}
                nameHeader="Floor"
                nameSortKey="floor"
                sort={floorSort}
                onSortChange={setFloorSort}
              />
              <LocationTable
                title="Room Breakdown"
                items={visibleRooms}
                showBuildingContext={showBuildingContext}
                showFloor
                nameHeader="Room"
                nameSortKey="room"
                sort={roomSort}
                onSortChange={setRoomSort}
              />
            </div>
          </details>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-amber-800">Top Concerns</h4>
              <span className="text-[10px] font-bold text-black/45">{concernEntries.length} found</span>
            </div>
            {concernEntries.length > 0 ? (
              <div className="mt-3 grid gap-5 md:grid-cols-[minmax(240px,300px)_1fr] md:items-center">
                <div ref={concernChartRef} className="relative flex min-h-[280px] items-center justify-center">
                  {hoveredConcernDetails && concernTooltipPosition ? (
                    <div
                      id="top-concerns-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute z-10 w-44 rounded-xl border border-dark/15 bg-white px-3 py-2 text-center text-xs text-black shadow-lg"
                      style={{ left: concernTooltipPosition.left, top: concernTooltipPosition.top }}
                    >
                      <p className="font-bold">{hoveredConcernDetails.label}</p>
                      <p className="mt-1 text-black/65">
                        {hoveredConcernDetails.count} {hoveredConcernDetails.count === 1 ? 'mention' : 'mentions'} · {hoveredConcernDetails.percentage.toFixed(1)}%
                      </p>
                    </div>
                  ) : null}
                  <svg
                    className="h-56 w-56 overflow-visible sm:h-64 sm:w-64"
                    viewBox="0 0 220 220"
                    role="img"
                    aria-label={`Top concerns donut chart with ${totalConcernMentions} negative mentions`}
                  >
                    <circle cx="110" cy="110" r={DONUT_RADIUS} fill="none" stroke="currentColor" strokeWidth="40" className="text-black/10" />
                    {concernChartSegments.map((concern) => {
                      const isActive = concern.label === activeConcern;
                      return (
                        <circle
                          key={concern.label}
                          cx="110"
                          cy="110"
                          r={DONUT_RADIUS}
                          fill="none"
                          stroke={concern.color}
                          strokeWidth={isActive ? 48 : 40}
                          strokeDasharray={concern.dashArray}
                          strokeDashoffset={concern.dashOffset}
                          transform="rotate(-90 110 110)"
                          className="cursor-pointer transition-all duration-150"
                          opacity={activeConcern && !isActive ? 0.42 : 1}
                          tabIndex={0}
                          role="img"
                          aria-label={`${concern.label}: ${concern.count} ${concern.count === 1 ? 'mention' : 'mentions'}, ${concern.percentage.toFixed(1)} percent`}
                          aria-describedby={isActive && hoveredConcern === concern.label ? 'top-concerns-tooltip' : undefined}
                          onMouseEnter={(event) => updateConcernHover(event, concern.label)}
                          onMouseMove={(event) => updateConcernHover(event, concern.label)}
                          onMouseLeave={clearConcernHover}
                          onFocus={() => {
                            setActiveConcern(concern.label);
                            setHoveredConcern(concern.label);
                            setConcernTooltipPosition({ left: 8, top: 8 });
                          }}
                          onBlur={clearConcernHover}
                        />
                      );
                    })}
                    <circle cx="110" cy="110" r="55" fill="#fffaf0" />
                    <text x="110" y="106" textAnchor="middle" className="fill-black text-[24px] font-bold">{totalConcernMentions}</text>
                    <text x="110" y="124" textAnchor="middle" className="fill-black/50 text-[10px] font-bold uppercase tracking-[0.12em]">mentions</text>
                  </svg>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {concernChartSegments.map((concern) => {
                    const isActive = concern.label === activeConcern;
                    return (
                      <button
                        key={concern.label}
                        type="button"
                        className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs text-black/70 transition-colors hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-primary/40 ${isActive ? 'bg-white/75' : ''}`}
                        onMouseEnter={() => setActiveConcern(concern.label)}
                        onMouseLeave={() => setActiveConcern(null)}
                        onFocus={() => setActiveConcern(concern.label)}
                        onBlur={() => setActiveConcern(null)}
                        aria-label={`${concern.label}: ${concern.count} mentions, ${concern.percentage.toFixed(1)} percent`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: concern.color }} aria-hidden="true" />
                          <span className="truncate">{concern.label}</span>
                        </span>
                        <span className="shrink-0 font-bold text-amber-800">{concern.count} ({concern.percentage.toFixed(1)}%)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-black/55">No negative concerns for the selected filters.</p>
            )}
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
