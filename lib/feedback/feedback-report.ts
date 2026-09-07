import {
  getFeedbackRating,
  SENTIMENT_DISTRIBUTION_ORDER,
  type AspectPerformance,
  type CategoryPerformance,
  type DemographicPerformance,
  type FeedbackAnalyticsMetrics,
  type FeedbackAnalyticsRecord,
  type FeedbackAspectKey,
  type FeedbackCategoryRatingKey,
  type FeedbackLocationAnalytics,
  type LocationPerformance,
} from './feedback-analytics';
import {
  resolveFeedbackSentimentLabel,
  type FeedbackSentimentFields,
  type FeedbackSentimentDistributionItem,
  type FeedbackSentimentSummary,
} from './feedback-sentiment';
import type { Feedback } from './feedback';
import {
  type FeedbackAnalyticsPeriod,
} from './feedback-period';
import {
  type FeedbackAnalyticsScope,
} from './feedback-scope';
import {
  type FeedbackInsights,
} from './feedback-insights';
import {
  type SentimentTrendBucket,
  type SentimentTrendResult,
} from './feedback-trend';
import {
  type ScheduleAcademicYear,
  type ScheduleSemester,
} from '../schedules/scheduleContext';
import { getFeedbackCreatedAt } from './feedback-period';

export type FeedbackReportScopeType = 'building' | 'whole_campus';
export type FeedbackReportRating = 1 | 2 | 3 | 4 | 5;

export interface FeedbackAnalyticsReportFilters {
  scope: string;
  locationScope: FeedbackAnalyticsScope;
  floor: string;
  roomId: string;
  period: FeedbackAnalyticsPeriod;
  academicYear: ScheduleAcademicYear | null;
  semester: ScheduleSemester | null;
  star: FeedbackReportRating | null;
  dateFrom: string;
  dateTo: string;
  role: string;
  gender: string;
}

export interface FeedbackAnalyticsReportScope {
  type: FeedbackReportScopeType;
  selectedBuildingId: string | null;
  selectedBuildingLabel: string;
  buildingIds: string[];
  buildings: Array<{
    id: string;
    label: string;
  }>;
}

export interface FeedbackAnalyticsReportMetadata {
  title: string;
  generatedAt: string;
  scope: FeedbackAnalyticsReportScope;
  period: FeedbackAnalyticsPeriod;
  academicYear: ScheduleAcademicYear | null;
  semester: ScheduleSemester | null;
  filters: FeedbackAnalyticsReportFilters;
}

export interface FeedbackAnalyticsReportOverview {
  totalReviews: number;
  averageRating: number | null;
  averageSentimentScore: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  insufficientContextCount: number;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  insufficientContextRate: number;
}

export interface FeedbackRatingDistributionItem {
  rating: FeedbackReportRating;
  count: number;
  percentage: number;
}

export interface FeedbackAnalyticsReportRatingAnalysis {
  validRatingCount: number;
  distribution: Record<FeedbackReportRating, FeedbackRatingDistributionItem>;
  percentages: Record<FeedbackReportRating, number>;
  categoryPerformance: Partial<Record<FeedbackCategoryRatingKey, CategoryPerformance>>;
  trends: FeedbackAnalyticsReportTrend;
}

export interface FeedbackAnalyticsReportTrendBucket {
  key: string;
  label: string;
  start: string;
  end: string;
  averageCompoundScore: number | null;
  feedbackCount: number;
  totalReviews: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  insufficientContextCount: number;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  insufficientContextRate: number;
  averageRating: number | null;
  averageCompound: number | null;
}

export interface FeedbackAnalyticsReportTrend {
  configured: boolean;
  message?: string;
  buckets: FeedbackAnalyticsReportTrendBucket[];
}

export interface FeedbackAnalyticsReportSentimentAnalysis {
  distribution: FeedbackSentimentDistributionItem[];
  averageCompoundScore: number;
  sentimentLabels: typeof SENTIMENT_DISTRIBUTION_ORDER;
  trends: FeedbackAnalyticsReportTrend;
}

export interface FeedbackAnalyticsReportReview {
  date: string | null;
  buildingId: string;
  buildingName: string;
  floor: string | null;
  roomName: string;
  rating: number | null;
  sentiment: FeedbackSentimentSummary['sentimentDistribution'][number]['label'];
  sentimentScore: number | null;
  feedbackText: string;
  detectedAspects: NonNullable<FeedbackSentimentFields['detectedAspects']>;
  extractedKeywords: string[];
  adminResponse: string | null;
}

export interface FeedbackAnalyticsReportConcernLocation {
  id: string;
  name: string;
  buildingId: string;
  floor: string | null;
  count: number;
}

export interface FeedbackAnalyticsReportConcern {
  aspect: FeedbackAspectKey;
  label: string;
  sentiment: 'positive' | 'negative';
  count: number;
  percentage: number;
  locations: FeedbackAnalyticsReportConcernLocation[];
}

export interface FeedbackAnalyticsReportTopConcerns {
  negative: FeedbackAnalyticsReportConcern[];
  positive: FeedbackAnalyticsReportConcern[];
}

export interface FeedbackAnalyticsReportLocationPerformance {
  buildings: LocationPerformance[];
  floors: LocationPerformance[];
  rooms: LocationPerformance[];
}

export interface FeedbackAnalyticsReportInsights {
  items: string[];
  analysis: FeedbackInsights;
}

export interface FeedbackAnalyticsReport {
  metadata: FeedbackAnalyticsReportMetadata;
  overview: FeedbackAnalyticsReportOverview;
  ratingAnalysis: FeedbackAnalyticsReportRatingAnalysis;
  sentimentAnalysis: FeedbackAnalyticsReportSentimentAnalysis;
  reviews: FeedbackAnalyticsReportReview[];
  roomAnalytics: FeedbackAnalyticsReportLocationPerformance;
  topConcerns: FeedbackAnalyticsReportTopConcerns;
  locationPerformance: FeedbackAnalyticsReportLocationPerformance;
  demographics: DemographicPerformance[];
  actionableInsights: FeedbackAnalyticsReportInsights;
}

export interface BuildFeedbackAnalyticsReportInput {
  filteredFeedback: Feedback[];
  filters: FeedbackAnalyticsReportFilters;
  scope: FeedbackAnalyticsReportScope;
  metrics: FeedbackAnalyticsMetrics;
  sentimentSummary: FeedbackSentimentSummary;
  categoryPerformance: Partial<Record<FeedbackCategoryRatingKey, CategoryPerformance>>;
  locationAnalytics: FeedbackLocationAnalytics;
  demographicAnalytics: DemographicPerformance[];
  trend: SentimentTrendResult;
  insights: FeedbackInsights;
  title?: string;
  generatedAt?: Date | string;
}

/**
 * Copies the dashboard's current controls into an explicit report filter
 * object. Keeping this mapping separate makes report metadata independent of
 * React state and avoids using `hasActiveFilters` as a proxy for state.
 */
export function createFeedbackAnalyticsReportFilters(
  filters: FeedbackAnalyticsReportFilters,
): FeedbackAnalyticsReportFilters {
  return { ...filters };
}

function toIsoString(value: Date | string | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toPercentage(count: number, total: number) {
  return total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function createRatingDistribution() {
  return {
    1: { rating: 1 as const, count: 0, percentage: 0 },
    2: { rating: 2 as const, count: 0, percentage: 0 },
    3: { rating: 3 as const, count: 0, percentage: 0 },
    4: { rating: 4 as const, count: 0, percentage: 0 },
    5: { rating: 5 as const, count: 0, percentage: 0 },
  };
}

export function buildFeedbackRatingDistribution(
  items: FeedbackAnalyticsRecord[],
) {
  const distribution = createRatingDistribution();
  let validRatingCount = 0;

  items.forEach((item) => {
    const rating = getFeedbackRating(item);
    if (rating === null || !Number.isInteger(rating)) {
      return;
    }

    const roundedRating = rating as FeedbackReportRating;
    distribution[roundedRating].count += 1;
    validRatingCount += 1;
  });

  (Object.keys(distribution) as Array<`${FeedbackReportRating}`>).forEach((key) => {
    const rating = Number(key) as FeedbackReportRating;
    const percentage = toPercentage(distribution[rating].count, validRatingCount);
    distribution[rating].percentage = percentage;
  });

  return {
    validRatingCount,
    distribution,
    percentages: {
      1: distribution[1].percentage,
      2: distribution[2].percentage,
      3: distribution[3].percentage,
      4: distribution[4].percentage,
      5: distribution[5].percentage,
    },
  };
}

function serializeTrendBucket(bucket: SentimentTrendBucket): FeedbackAnalyticsReportTrendBucket {
  return {
    key: bucket.key,
    label: bucket.label,
    start: bucket.start.toISOString(),
    end: bucket.end.toISOString(),
    averageCompoundScore: bucket.averageCompoundScore,
    feedbackCount: bucket.feedbackCount,
    totalReviews: bucket.totalReviews,
    positiveCount: bucket.positiveCount,
    neutralCount: bucket.neutralCount,
    negativeCount: bucket.negativeCount,
    insufficientContextCount: bucket.insufficientContextCount,
    positiveRate: bucket.positiveRate,
    neutralRate: bucket.neutralRate,
    negativeRate: bucket.negativeRate,
    insufficientContextRate: bucket.insufficientContextRate,
    averageRating: bucket.averageRating,
    averageCompound: bucket.averageCompound,
  };
}

function serializeTrend(trend: SentimentTrendResult): FeedbackAnalyticsReportTrend {
  return {
    configured: trend.configured,
    ...(trend.message ? { message: trend.message } : {}),
    buckets: trend.buckets.map(serializeTrendBucket),
  };
}

function getLocationAspectCount(
  location: LocationPerformance,
  aspect: FeedbackAspectKey,
  sentiment: 'positive' | 'negative',
) {
  const performance: AspectPerformance | undefined = location.aspectMentions[aspect];
  if (!performance) {
    return 0;
  }

  return sentiment === 'positive' ? performance.positiveCount : performance.negativeCount;
}

function buildConcernBreakdown(
  rankings: FeedbackSentimentSummary['mostMentionedIssues'],
  sentiment: 'positive' | 'negative',
  locationAnalytics: FeedbackLocationAnalytics,
) {
  const totalMentions = rankings.reduce((sum, item) => sum + item.count, 0);
  const locations = [
    ...locationAnalytics.buildings,
    ...locationAnalytics.floors,
    ...locationAnalytics.rooms,
  ];

  return rankings.map((item) => ({
    aspect: item.aspect,
    label: item.label,
    sentiment,
    count: item.count,
    percentage: toPercentage(item.count, totalMentions),
    locations: locations
      .map((location) => ({
        id: location.id,
        name: location.name,
        buildingId: location.buildingId,
        floor: location.floor,
        count: getLocationAspectCount(location, item.aspect, sentiment),
      }))
      .filter((location) => location.count > 0),
  }));
}

function buildReportReviews(
  items: Feedback[],
  locationAnalytics: FeedbackLocationAnalytics,
): FeedbackAnalyticsReportReview[] {
  const roomById = new Map(locationAnalytics.rooms.map((room) => [room.id, room]));

  return items.map((feedback) => {
    const room = feedback.roomId ? roomById.get(feedback.roomId) : undefined;
    const createdAt = getFeedbackCreatedAt(feedback.createdAt);

    return {
      date: createdAt?.toISOString() ?? null,
      buildingId: feedback.buildingId,
      buildingName: feedback.buildingName,
      floor: room?.floor ?? null,
      roomName: feedback.roomName || room?.name || '',
      rating: getFeedbackRating(feedback),
      sentiment: resolveFeedbackSentimentLabel(feedback),
      sentimentScore:
        typeof feedback.vaderCompoundScore === 'number'
          ? feedback.vaderCompoundScore
          : typeof feedback.compoundScore === 'number'
            ? feedback.compoundScore
            : null,
      feedbackText: feedback.message || feedback.text || feedback.feedbackText || '',
      detectedAspects: feedback.detectedAspects ?? {},
      extractedKeywords: [...feedback.extractedKeywords],
      adminResponse: feedback.adminResponse ?? null,
    };
  });
}

function toLocationPerformance(
  analytics: FeedbackLocationAnalytics,
): FeedbackAnalyticsReportLocationPerformance {
  return {
    buildings: analytics.buildings.map((item) => ({ ...item })),
    floors: analytics.floors.map((item) => ({ ...item })),
    rooms: analytics.rooms.map((item) => ({ ...item })),
  };
}

export function buildFeedbackAnalyticsReport({
  filteredFeedback,
  filters,
  scope,
  metrics,
  sentimentSummary,
  categoryPerformance,
  locationAnalytics,
  demographicAnalytics,
  trend,
  insights,
  title = 'Feedback Analytics Findings Report',
  generatedAt,
}: BuildFeedbackAnalyticsReportInput): FeedbackAnalyticsReport {
  const ratingAnalysis = buildFeedbackRatingDistribution(filteredFeedback);
  const serializedTrend = serializeTrend(trend);
  const normalizedFilters = createFeedbackAnalyticsReportFilters(filters);
  const normalizedScope = {
    ...scope,
    buildingIds: [...scope.buildingIds],
    buildings: scope.buildings.map((building) => ({ ...building })),
  };
  const locationPerformance = toLocationPerformance(locationAnalytics);

  return {
    metadata: {
      title,
      generatedAt: toIsoString(generatedAt),
      scope: normalizedScope,
      period: normalizedFilters.period,
      academicYear: normalizedFilters.academicYear,
      semester: normalizedFilters.semester,
      filters: normalizedFilters,
    },
    overview: {
      totalReviews: metrics.totalReviews,
      averageRating: metrics.averageRating,
      averageSentimentScore: sentimentSummary.averageCompoundScore,
      positiveCount: metrics.positiveCount,
      neutralCount: metrics.neutralCount,
      negativeCount: metrics.negativeCount,
      insufficientContextCount: metrics.insufficientContextCount,
      positiveRate: metrics.positiveRate,
      neutralRate: metrics.neutralRate,
      negativeRate: metrics.negativeRate,
      insufficientContextRate: metrics.insufficientContextRate,
    },
    ratingAnalysis: {
      ...ratingAnalysis,
      categoryPerformance: { ...categoryPerformance },
      trends: serializedTrend,
    },
    sentimentAnalysis: {
      distribution: sentimentSummary.sentimentDistribution.map((item) => ({ ...item })),
      averageCompoundScore: sentimentSummary.averageCompoundScore,
      sentimentLabels: SENTIMENT_DISTRIBUTION_ORDER,
      trends: serializedTrend,
    },
    reviews: buildReportReviews(filteredFeedback, locationAnalytics),
    roomAnalytics: locationPerformance,
    topConcerns: {
      negative: buildConcernBreakdown(
        sentimentSummary.mostMentionedIssues,
        'negative',
        locationAnalytics,
      ),
      positive: buildConcernBreakdown(
        sentimentSummary.mostPraisedAspects,
        'positive',
        locationAnalytics,
      ),
    },
    locationPerformance,
    demographics: demographicAnalytics.map((group) => ({ ...group })),
    actionableInsights: {
      items: [...insights.actionableInsights],
      analysis: { ...insights, actionableInsights: [...insights.actionableInsights] },
    },
  };
}
