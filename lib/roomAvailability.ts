import {
  collection,
  onSnapshot,
  query,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { db } from "@/lib/configs/firebase";

/**
 * Reservation statuses that should mark a date as "Reserved" (red, disabled)
 * on the room availability picker. Currently scoped to confirmed bookings only,
 * matching the product decision that pending requests should not block other
 * users from attempting to reserve the same room.
 */
const BLOCKING_STATUSES = ["approved"] as const;

export type BookingDate = string;

interface ReservationDateRecord {
  date?: string;
  status?: string;
}

/**
 * Subscribes to all reservations that occupy a given room and emits the set of
 * dates (yyyy-MM-dd) that should be considered unavailable for new bookings.
 *
 * Real-time updates ensure that when an admin approves or cancels a booking,
 * every open reservation page sees the change immediately without a refresh.
 *
 * Implementation note: we deliberately do NOT call `callback` synchronously
 * for the empty/error paths. Triggering setState inside the effect body that
 * just wired up this listener can cause React StrictMode to immediately
 * re-run the effect, tearing down and re-creating the underlying Firestore
 * watch target before its first ack. That race has been observed to surface
 * as `INTERNAL ASSERTION FAILED: Unexpected state` (IDs ca9 / b815) in the
 * Firestore SDK. Consumers should leave their current state untouched until
 * the first real snapshot arrives.
 */
export function onBookedDatesByRoom(
  roomId: string,
  callback: (bookedDates: BookingDate[]) => void
): Unsubscribe {
  if (!roomId) {
    return () => {};
  }

  const reservationsQuery = query(
    collection(db, "reservations"),
    where("roomId", "==", roomId),
    where("status", "in", [...BLOCKING_STATUSES])
  );

  return onSnapshot(
    reservationsQuery,
    (snapshot) => {
      const dates = new Set<BookingDate>();

      snapshot.docs.forEach((reservationDoc) => {
        const data = reservationDoc.data() as ReservationDateRecord;
        if (data.date) {
          dates.add(data.date);
        }
      });

      callback([...dates].sort());
    },
    (error) => {
      console.warn("Firestore listener error (booked dates by room):", error);
    }
  );
}

/**
 * Pure helper used by both the picker and the reservation submission flow to
 * guarantee a date isn't double-booked. Always check this on submit even if
 * the UI already disables the date – the listener might be stale by a few ms.
 */
export function isDateBooked(
  date: string,
  bookedDates: readonly BookingDate[]
): boolean {
  if (!date) return false;
  return bookedDates.includes(date);
}

/**
 * Converts a Date to the yyyy-MM-dd string the rest of the reservation system
 * uses. Done in local time so that selecting "today" in the picker doesn't
 * accidentally roll over to yesterday in negative-UTC timezones.
 */
export function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromIsoDateString(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}
