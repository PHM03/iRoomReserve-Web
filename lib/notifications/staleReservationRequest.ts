import {
  getCurrentApprovalStep,
  isCurrentApproverEmail,
  type ReservationApprovalStep,
} from "../reservations/reservation-approval";

export interface ReservationNotificationTarget {
  approvalFlow?: ReservationApprovalStep[];
  currentStep?: number;
  date?: string;
  dates?: string[];
  endTime?: string;
  status?: string;
}

function getReservationDateKeys(reservation: ReservationNotificationTarget) {
  const reservationDates =
    Array.isArray(reservation.dates) && reservation.dates.length > 0
      ? reservation.dates
      : reservation.date
        ? [reservation.date]
        : [];

  return reservationDates.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}

function getTodayDateKey(now: Date = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function getCurrentTimeKey(now: Date = new Date()) {
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join(":");
}

function isExpiredOnCurrentDay(
  reservation: ReservationNotificationTarget,
  now: Date
) {
  if (!reservation.date || !reservation.endTime) {
    return false;
  }

  return (
    reservation.date === getTodayDateKey(now) &&
    reservation.endTime <= getCurrentTimeKey(now)
  );
}

export function isStaleReservationRequestNotification(
  reservation: ReservationNotificationTarget | null,
  userEmail?: string | null,
  now: Date = new Date()
) {
  if (!reservation) {
    return true;
  }

  if (reservation.status !== "pending") {
    return true;
  }

  const reservationDates = getReservationDateKeys(reservation);
  if (
    reservationDates.length > 0 &&
    reservationDates.every((date) => date < getTodayDateKey(now))
  ) {
    return true;
  }

  if (isExpiredOnCurrentDay(reservation, now)) {
    return true;
  }

  const currentStep = getCurrentApprovalStep(
    reservation.approvalFlow,
    reservation.currentStep
  );
  if (!currentStep) {
    return true;
  }

  if (!userEmail?.trim()) {
    return false;
  }

  return !isCurrentApproverEmail(currentStep, userEmail);
}
