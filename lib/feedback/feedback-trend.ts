import type { Feedback } from '@/lib/feedback/feedback';

export const SENTIMENT_TREND_PERIODS = [
  'weekly',
  'monthly',
  'semester',
  'yearly',
] as const;

export type SentimentTrendPeriod = (typeof SENTIMENT_TREND_PERIODS)[number];

export interface SentimentTrendBucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  averageCompoundScore: number | null;
  feedbackCount: number;
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

function getStoredCompoundScore(feedback: Feedback) {
  const score = feedback.vaderCompoundScore ?? feedback.compoundScore;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

function createDailyBuckets(range: DateRange) {
  const buckets: SentimentTrendBucket[] = [];

  for (let start = new Date(range.start); start < range.end; start = addDays(start, 1)) {
    const end = addDays(start, 1);
    buckets.push({
      key: start.toISOString(),
      label: formatDayLabel(start),
      start,
      end,
      averageCompoundScore: null,
      feedbackCount: 0,
    });
  }

  return buckets;
}

function createMonthlyBuckets(range: DateRange) {
  const buckets: SentimentTrendBucket[] = [];

  for (let start = new Date(range.start); start < range.end; start = addMonths(start, 1)) {
    const end = new Date(Math.min(addMonths(start, 1).getTime(), range.end.getTime()));
    buckets.push({
      key: start.toISOString(),
      label: start.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      start,
      end,
      averageCompoundScore: null,
      feedbackCount: 0,
    });
  }

  return buckets;
}

function createMonthlyWeekBuckets(range: DateRange) {
  const buckets: SentimentTrendBucket[] = [];
  let start = new Date(range.start);

  while (start < range.end) {
    const end = new Date(Math.min(addDays(start, 7).getTime(), range.end.getTime()));
    buckets.push({
      key: start.toISOString(),
      label: formatDateRangeLabel(start, end),
      start,
      end,
      averageCompoundScore: null,
      feedbackCount: 0,
    });
    start = end;
  }

  return buckets;
}

function createBuckets(period: SentimentTrendPeriod, now: Date): SentimentTrendResult {
  if (period === 'semester') {
    return {
      buckets: [],
      configured: false,
      message: 'Semester date ranges are not configured for this building yet.',
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
): SentimentTrendResult {
  const result = createBuckets(period, now);

  if (!result.configured) {
    return result;
  }

  const totals = result.buckets.map(() => ({ sum: 0, count: 0 }));

  feedbackItems.forEach((feedback) => {
    const date = getFeedbackDate(feedback);
    const score = getStoredCompoundScore(feedback);
    if (!date || score === null) {
      return;
    }

    const bucketIndex = result.buckets.findIndex(
      (bucket) => date >= bucket.start && date < bucket.end,
    );
    if (bucketIndex === -1) {
      return;
    }

    totals[bucketIndex].sum += score;
    totals[bucketIndex].count += 1;
  });

  return {
    ...result,
    buckets: result.buckets.map((bucket, index) => {
      const total = totals[index];
      return {
        ...bucket,
        averageCompoundScore: total.count > 0 ? total.sum / total.count : null,
        feedbackCount: total.count,
      };
    }),
  };
}
