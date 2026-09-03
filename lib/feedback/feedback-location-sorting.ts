import type {
  FeedbackAnalyticsDirection,
  LocationPerformance,
} from './feedback-analytics';

export type FloorBreakdownSortKey =
  | 'floor'
  | 'room'
  | 'reviews'
  | 'rating'
  | 'positive'
  | 'negative'
  | 'sentiment'
  | 'trend';

export type SortDirection = 'asc' | 'desc';

export interface FloorBreakdownSort {
  key: FloorBreakdownSortKey;
  direction: SortDirection;
}

function floorSortOrder(value: string | null) {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'basement') return -1;
  if (normalized === 'ground' || normalized === 'ground floor') return 0;

  const match = normalized.match(/-?\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function trendSortOrder(direction: FeedbackAnalyticsDirection) {
  if (direction === 'worsening') return 1;
  if (direction === 'stable') return 2;
  if (direction === 'improving') return 3;
  return 0;
}

function compareNullableNumbers(left: number | null, right: number | null) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareNaturalNames(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

/** Sorts floor-level analytics without changing any underlying metrics. */
export function sortLocationPerformance(
  items: LocationPerformance[],
  sort: FloorBreakdownSort,
) {
  return [...items].sort((left, right) => {
    if (sort.key === 'rating' && (left.averageRating === null || right.averageRating === null)) {
      return compareNullableNumbers(left.averageRating, right.averageRating);
    }
    if (sort.key === 'sentiment' && (left.averageCompound === null || right.averageCompound === null)) {
      return compareNullableNumbers(left.averageCompound, right.averageCompound);
    }

    let comparison = 0;
    if (sort.key === 'floor') {
      comparison = floorSortOrder(left.floor ?? left.name) - floorSortOrder(right.floor ?? right.name);
      if (comparison === 0) comparison = compareNaturalNames(left.floor ?? left.name, right.floor ?? right.name);
    } else if (sort.key === 'room') {
      comparison = compareNaturalNames(left.name, right.name);
    } else if (sort.key === 'reviews') {
      comparison = left.totalReviews - right.totalReviews;
    } else if (sort.key === 'rating') {
      comparison = compareNullableNumbers(left.averageRating, right.averageRating);
    } else if (sort.key === 'positive') {
      comparison = left.positiveRate - right.positiveRate;
    } else if (sort.key === 'negative') {
      comparison = left.negativeRate - right.negativeRate;
    } else if (sort.key === 'sentiment') {
      comparison = compareNullableNumbers(left.averageCompound, right.averageCompound);
    } else {
      comparison = trendSortOrder(left.trendDirection) - trendSortOrder(right.trendDirection);
    }

    if (comparison === 0 && sort.key !== 'floor' && sort.key !== 'room') {
      comparison = floorSortOrder(left.floor ?? left.name) - floorSortOrder(right.floor ?? right.name);
    }
    if (comparison === 0 && sort.key !== 'floor' && sort.key !== 'room') {
      comparison = compareNaturalNames(left.name, right.name);
    }

    return sort.direction === 'asc' ? comparison : -comparison;
  });
}
