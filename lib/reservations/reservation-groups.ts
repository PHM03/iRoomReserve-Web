type ReservationLike = {
  approvalFlow?: unknown;
  checkedInAt?: unknown;
  completedAt?: unknown;
  createdAt?: unknown;
  currentStep?: number;
  date?: string;
  id: string;
  recurringGroupId?: string;
  status?: string;
};

export type GroupedReservation<T extends ReservationLike> = T & {
  dates?: string[];
  groupedReservationIds?: string[];
  isRecurringRequest?: boolean;
  occurrenceCount?: number;
};

const GROUPABLE_STATUSES = new Set(["pending", "expired", "rejected", "cancelled"]);

function getTimestampSeconds(value: unknown) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const candidate = value as {
    seconds?: unknown;
    _seconds?: unknown;
  };

  if (typeof candidate.seconds === "number") {
    return candidate.seconds;
  }

  if (typeof candidate._seconds === "number") {
    return candidate._seconds;
  }

  return 0;
}

function isGroupableReservation(reservation: ReservationLike) {
  const normalizedStatus = String(reservation.status ?? "").toLowerCase();

  return (
    typeof reservation.recurringGroupId === "string" &&
    reservation.recurringGroupId.trim().length > 0 &&
    GROUPABLE_STATUSES.has(normalizedStatus) &&
    !reservation.checkedInAt &&
    !reservation.completedAt
  );
}

function getGroupKey(reservation: ReservationLike) {
  if (!isGroupableReservation(reservation)) {
    return `single:${reservation.id}`;
  }

  return [
    "group",
    reservation.recurringGroupId,
    String(reservation.status ?? "").toLowerCase(),
    typeof reservation.currentStep === "number" ? reservation.currentStep : -1,
  ].join(":");
}

function sortDatesAscending(left: string, right: string) {
  return left.localeCompare(right);
}

function sortReservationsForDisplay<T extends ReservationLike>(left: T, right: T) {
  const createdAtOrder =
    getTimestampSeconds(right.createdAt) - getTimestampSeconds(left.createdAt);

  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return (
    (right.date ?? "").localeCompare(left.date ?? "") ||
    right.id.localeCompare(left.id)
  );
}

export function groupReservationsForDisplay<T extends ReservationLike>(
  reservations: T[]
): Array<GroupedReservation<T>> {
  const grouped = new Map<string, T[]>();

  reservations.forEach((reservation) => {
    const key = getGroupKey(reservation);
    const currentGroup = grouped.get(key) ?? [];
    currentGroup.push(reservation);
    grouped.set(key, currentGroup);
  });

  return Array.from(grouped.values())
    .map((groupReservations) => {
      const sortedReservations = [...groupReservations].sort((left, right) =>
        (left.date ?? "").localeCompare(right.date ?? "") ||
        left.id.localeCompare(right.id)
      );
      const representative = { ...sortedReservations[0] } as GroupedReservation<T>;

      if (sortedReservations.length === 1 || !isGroupableReservation(representative)) {
        return representative;
      }

      representative.dates = sortedReservations
        .map((reservation) => reservation.date)
        .filter((value): value is string => typeof value === "string")
        .sort(sortDatesAscending);
      representative.groupedReservationIds = sortedReservations.map(
        (reservation) => reservation.id
      );
      representative.isRecurringRequest = representative.dates.length > 1;
      representative.occurrenceCount = representative.dates.length;

      return representative;
    })
    .sort(sortReservationsForDisplay);
}
