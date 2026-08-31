import type {
  CategoryPerformance,
  DemographicPerformance,
  FeedbackAnalyticsMetrics,
  FeedbackLocationAnalytics,
  FeedbackAnalyticsDirection,
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

export function LocationPerformanceSection({ analytics }: { analytics: FeedbackLocationAnalytics }) {
  return (
    <section className="glass-card p-4" aria-labelledby="location-performance-heading">
      <div className="mb-4">
        <h3 id="location-performance-heading" className="text-base font-bold text-black">Location Performance</h3>
        <p className="mt-1 text-xs text-black/55">Rooms and floors are linked through roomId → room.floor. Comparative labels require at least five reviews. VADER sentiment scores range from -1 (very negative) to +1 (very positive).</p>
      </div>
      <div className="space-y-3">
        <LocationTable title="Buildings" items={analytics.buildings} />
        <LocationTable title="Floors" items={analytics.floors} showFloor />
        <LocationTable title="Rooms" items={analytics.rooms} showFloor />
      </div>
      {analytics.rooms.some((room) => room.relevantFacilityConcerns.length > 0) ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {analytics.rooms.filter((room) => room.relevantFacilityConcerns.length > 0).map((room) => (
            <div key={room.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs font-bold text-amber-800">{room.name} — relevant concerns</p>
              <p className="mt-1 text-xs text-black/65">{room.relevantFacilityConcerns.join(', ')}</p>
            </div>
          ))}
        </div>
      ) : null}
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
