import type { Feedback } from '@/lib/feedback/feedback';
import { resolveFeedbackSentimentLabel } from './feedback-sentiment';
import {
  FEEDBACK_ANALYTICS_PERIODS,
  type FeedbackAnalyticsPeriod,
} from './feedback-period';
import {
  DEFAULT_SCHEDULE_CONTEXT,
  getScheduleSemesterDateRange,
  type ScheduleContext,
} from '../schedules/scheduleContext';

export const SENTIMENT_TREND_PERIODS = FEEDBACK_ANALYTICS_PERIODS;

export type SentimentTrendPeriod = FeedbackAnalyticsPeriod;

export interface SentimentTrendBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  averageCompoundScore: number | null;
  feedbackCount: number;
  totalReviews: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  averageRating: number | null;
  averageCompound: number | null;
}

export interface SentimentTrendResult {
  buckets: SentimentTrendBucket[];
  configured: boolean;
  message?: string;
}

interface DateRange {
  start: Date;
  end: Date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = startOfDay(date);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

function formatDateRangeLabel(start: Date, end: Date) {
  const lastDay = addDays(end, -1);
  const startLabel = start.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const endLabel = lastDay.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${startLabel}–${endLabel}`;
}

function getFeedbackDate(feedback: Feedback) {
  if (!feedback.createdAt || typeof feedback.createdAt.toDate !== 'function') {
    return null;
  }

  const date = feedback.createdAt.toDate();
  return Number.isNaN(date.getTime()) ? null : date;
}

function toPercentage(count: number, total: number) {
  return total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function createEmptyBucket(
  key: string,
  label: string,
  start: Date,
  end: Date,
): SentimentTrendBucket {
  return {
    key,
    label,
    start,
    end,
    averageCompoundScore: null,
    averageCompound: null,
    averageRating: null,
    feedbackCount: 0,
    totalReviews: 0,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
    positiveRate: 0,
    neutralRate: 0,
    negativeRate: 0,
  };
}

function getStoredCompoundScore(feedback: Feedback) {
  const score = feedback.vaderCompoundScore ?? feedback.compoundScore;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

function createDailyBuckets(range: DateRange) {
  const buckets: SentimentTrendBucket[] = [];

  for (let start = new Date(range.start); start < range.end; start = addDays(start, 1)) {
    const end = addDays(start, 1);
    buckets.push(createEmptyBucket(start.toISOString(), formatDayLabel(start), start, end));
  }

  return buckets;
}

function createMonthlyBuckets(range: DateRange) {
  const buckets: SentimentTrendBucket[] = [];

  for (let start = new Date(range.start); start < range.end; start = addMonths(start, 1)) {
    const end = new Date(Math.min(addMonths(start, 1).getTime(), range.end.getTime()));
    buckets.push(createEmptyBucket(
      start.toISOString(),
      start.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      start,
      end,
    ));
  }

  return buckets;
}

function createMonthlyWeekBuckets(range: DateRange) {
  const buckets: SentimentTrendBucket[] = [];
  let start = new Date(range.start);

  while (start < range.end) {
    const end = new Date(Math.min(addDays(start, 7).getTime(), range.end.getTime()));
    buckets.push(createEmptyBucket(start.toISOString(), formatDateRangeLabel(start, end), start, end));
    start = end;
  }

  return buckets;
}

function getAllTimeRange(feedbackItems: Feedback[]) {
  const dates = feedbackItems
    .map(getFeedbackDate)
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (dates.length === 0) {
    return null;
  }

  const start = startOfMonth(dates[0]);
  const end = addMonths(startOfMonth(dates[dates.length - 1]), 1);
  return { start, end };
}

function createBuckets(
  period: SentimentTrendPeriod,
  now: Date,
  feedbackItems: Feedback[],
  scheduleContext: ScheduleContext,
): SentimentTrendResult {
  if (period === 'all_time') {
    const range = getAllTimeRange(feedbackItems);
    return {
      buckets: range ? createMonthlyBuckets(range) : [],
      configured: true,
    };
  }

  if (period === 'semester') {
    const range = getScheduleSemesterDateRange(
      scheduleContext.academicYear,
      scheduleContext.semester,
    );

    return {
      buckets: createMonthlyWeekBuckets(range),
      configured: true,
    };
  }

  if (period === 'weekly') {
    const start = startOfWeek(now);
    return { buckets: createDailyBuckets({ start, end: addDays(start, 7) }), configured: true };
  }

  if (period === 'monthly') {
    const start = startOfMonth(now);
    const end = addMonths(start, 1);
    return { buckets: createMonthlyWeekBuckets({ start, end }), configured: true };
  }

  const start = startOfYear(now);
  return { buckets: createMonthlyBuckets({ start, end: new Date(start.getFullYear() + 1, 0, 1) }), configured: true };
}

export function buildSentimentTrend(
  feedbackItems: Feedback[],
  period: SentimentTrendPeriod,
  now = new Date(),
  scheduleContext: ScheduleContext = DEFAULT_SCHEDULE_CONTEXT,
): SentimentTrendResult {
  const result = createBuckets(period, now, feedbackItems, scheduleContext);

  if (!result.configured) {
    return result;
  }

  const totals = result.buckets.map(() => ({
    compoundSum: 0,
    compoundCount: 0,
    ratingSum: 0,
    ratingCount: 0,
    totalReviews: 0,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
  }));

  feedbackItems.forEach((feedback) => {
    const date = getFeedbackDate(feedback);
    if (!date) {
      return;
    }

    const bucketIndex = result.buckets.findIndex(
      (bucket) => date >= bucket.start && date < bucket.end,
    );
    if (bucketIndex === -1) {
      return;
    }

    const bucket = totals[bucketIndex];
    bucket.totalReviews += 1;
    const sentimentLabel = resolveFeedbackSentimentLabel(feedback);
    if (sentimentLabel === 'positive' || sentimentLabel === 'very_positive') bucket.positiveCount += 1;
    else if (sentimentLabel === 'negative' || sentimentLabel === 'very_negative') bucket.negativeCount += 1;
    else bucket.neutralCount += 1;

    const score = getStoredCompoundScore(feedback);
    if (score !== null) {
      bucket.compoundSum += score;
      bucket.compoundCount += 1;
    }
    const rating = feedback.overallRating ?? feedback.rating;
    if (typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 5) {
      bucket.ratingSum += rating;
      bucket.ratingCount += 1;
    }
  });

  return {
    ...result,
    buckets: result.buckets.map((bucket, index) => {
      const total = totals[index];
      const averageCompoundScore = total.compoundCount > 0
        ? total.compoundSum / total.compoundCount
        : null;
      return {
        ...bucket,
        averageCompoundScore,
        averageCompound: averageCompoundScore,
        averageRating: total.ratingCount > 0 ? Number((total.ratingSum / total.ratingCount).toFixed(2)) : null,
        feedbackCount: total.compoundCount,
        totalReviews: total.totalReviews,
        positiveCount: total.positiveCount,
        neutralCount: total.neutralCount,
        negativeCount: total.negativeCount,
        positiveRate: toPercentage(total.positiveCount, total.totalReviews),
        neutralRate: toPercentage(total.neutralCount, total.totalReviews),
        negativeRate: toPercentage(total.negativeCount, total.totalReviews),
      };
    }),
  };
}
