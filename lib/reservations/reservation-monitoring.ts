export const RESERVATION_TIME_ZONE = "Asia/Manila";

export type ReservationTimestampLike =
  | Date
  | {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    }
  | null
  | undefined;

function getManilaDateTimeParts(value: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESERVATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;
}

export function getManilaDateKey(value: Date = new Date()) {
  const parts = getManilaDateTimeParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getUtcDayNumber(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const value = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  return Number.isNaN(value) ? null : value / 86_400_000;
}

/**
 * Returns the number of Manila calendar days until a reservation date.
 * A reservation on the current Manila date returns 0.
 */
export function getReservationDayOffset(
  reservationDate: string,
  now: Date = new Date()
) {
  const reservationDay = getUtcDayNumber(reservationDate.trim());
  const currentDay = getUtcDayNumber(getManilaDateKey(now));

  if (reservationDay === null || currentDay === null) {
    return null;
  }

  return reservationDay - currentDay;
}

export function isPendingReservationDueForExpiration(
  reservationDate: string,
  now: Date = new Date()
) {
  const offset = getReservationDayOffset(reservationDate, now);
  return offset !== null && offset <= 0;
}

export function getMonitoringDayOffset(
  reservationDate: string,
  now: Date = new Date()
) {
  const offset = getReservationDayOffset(reservationDate, now);
  return offset === 1 || offset === 2 || offset === 3 ? offset : null;
}

function toDate(value: ReservationTimestampLike) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  const seconds =
    typeof value.seconds === "number"
      ? value.seconds
      : typeof value._seconds === "number"
        ? value._seconds
        : null;
  const nanoseconds =
    typeof value.nanoseconds === "number"
      ? value.nanoseconds
      : typeof value._nanoseconds === "number"
        ? value._nanoseconds
        : 0;

  return seconds === null
    ? null
    : new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
}

export function formatManilaDate(value: ReservationTimestampLike) {
  const parsed = toDate(value);
  if (!parsed) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVATION_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}
