export const FEEDBACK_ANALYTICS_PERIODS = [
  'all_time',
  'weekly',
  'monthly',
  'semester',
  'yearly',
] as const;

export type FeedbackAnalyticsPeriod = (typeof FEEDBACK_ANALYTICS_PERIODS)[number];

export interface FeedbackPeriodResult<T> {
  items: T[];
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

function getPeriodRange(
  period: FeedbackAnalyticsPeriod,
  now: Date,
  periodOffset = 0,
): DateRange | null {
  if (period === 'all_time') {
    return null;
  }

  if (period === 'semester') {
    return null;
  }

  if (period === 'weekly') {
    const start = startOfWeek(now);
    start.setDate(start.getDate() + periodOffset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
    return {
      start,
      end: new Date(start.getFullYear(), start.getMonth() + 1, 1),
    };
  }

  const start = new Date(now.getFullYear() + periodOffset, 0, 1);
  return {
    start,
    end: new Date(start.getFullYear() + 1, 0, 1),
  };
}

function getTimestampDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const timestamp = value as {
    toDate?: () => Date;
    seconds?: unknown;
    nanoseconds?: unknown;
    _seconds?: unknown;
    _nanoseconds?: unknown;
  };

  if (typeof timestamp.toDate === 'function') {
    const date = timestamp.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const seconds = typeof timestamp.seconds === 'number'
    ? timestamp.seconds
    : typeof timestamp._seconds === 'number'
      ? timestamp._seconds
      : null;
  if (seconds === null) {
    return null;
  }

  const nanoseconds = typeof timestamp.nanoseconds === 'number'
    ? timestamp.nanoseconds
    : typeof timestamp._nanoseconds === 'number'
      ? timestamp._nanoseconds
      : 0;
  const date = new Date(seconds * 1000 + nanoseconds / 1_000_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function filterFeedbackByPeriod<T extends { createdAt?: unknown }>(
  items: T[],
  period: FeedbackAnalyticsPeriod,
  now = new Date(),
): FeedbackPeriodResult<T> {
  if (period === 'semester') {
    return {
      items: [],
      configured: false,
      message: 'Semester date ranges are not configured in the current academic-period settings.',
    };
  }

  const range = getPeriodRange(period, now);
  if (!range) {
    return { items: [...items], configured: true };
  }

  return {
    items: items.filter((item) => {
      const date = getTimestampDate(item.createdAt);
      return date !== null && date >= range.start && date < range.end;
    }),
    configured: true,
  };
}

export interface FeedbackPeriodComparison<T> {
  currentItems: T[];
  previousItems: T[];
  configured: boolean;
  comparable: boolean;
  message?: string;
}

export function compareFeedbackPeriods<T extends { createdAt?: unknown }>(
  items: T[],
  period: FeedbackAnalyticsPeriod,
  now = new Date(),
): FeedbackPeriodComparison<T> {
  if (period === 'semester') {
    return {
      currentItems: [],
      previousItems: [],
      configured: false,
      comparable: false,
      message: 'Semester date ranges are not configured in the current academic-period settings.',
    };
  }

  if (period === 'all_time') {
    return {
      currentItems: [...items],
      previousItems: [],
      configured: true,
      comparable: false,
    };
  }

  const currentRange = getPeriodRange(period, now);
  const previousRange = getPeriodRange(period, now, -1);
  if (!currentRange || !previousRange) {
    return {
      currentItems: [],
      previousItems: [],
      configured: false,
      comparable: false,
    };
  }

  const filterByRange = (range: DateRange) => items.filter((item) => {
    const date = getTimestampDate(item.createdAt);
    return date !== null && date >= range.start && date < range.end;
  });

  return {
    currentItems: filterByRange(currentRange),
    previousItems: filterByRange(previousRange),
    configured: true,
    comparable: true,
  };
}

export function scopeFeedbackToBuilding<T extends { buildingId?: string }>(
  items: T[],
  buildingId: string,
) {
  return items.filter((item) => item.buildingId === buildingId);
}
