import {
  collection,
  onSnapshot,
  query,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/firebase";

/**
 * Reservation statuses that should participate in room availability conflict
 * checks. Currently scoped to confirmed bookings only, matching the product
 * decision that pending requests should not block other users from attempting
 * to reserve the same room.
 */
const BLOCKING_STATUSES = ["approved"] as const;

export interface BookingSlot {
  date: string;
  startTime: string;
  endTime: string;
}

interface ReservationSlotRecord {
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
}

/**
 * Subscribes to all approved reservations that occupy a given room and emits
 * booked time slots so consumers can run overlap checks.
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
  callback: (bookedSlots: BookingSlot[]) => void
): Unsubscribe {
  if (!roomId) {
    return () => {};
  }

  const reservationsQuery = query(
    collection(db, "reservations"),
    where("roomId", "==", roomId),
    where("status", "in", [...BLOCKING_STATUSES])
  );

  let reservationSlots: BookingSlot[] = [];
  let manualSlots: BookingSlot[] = [];
  const emit = () => callback([...reservationSlots, ...manualSlots].sort(
    (left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime)
  ));
  const unsubscribeReservations = onSnapshot(
    reservationsQuery,
    (snapshot) => {
      const bookedSlots: BookingSlot[] = [];

      snapshot.docs.forEach((reservationDoc) => {
        const data = reservationDoc.data() as ReservationSlotRecord;
        if (data.date && data.startTime && data.endTime) {
          bookedSlots.push({
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
          });
        }
      });

      reservationSlots = bookedSlots;
      emit();
    },
    (error) => {
      console.warn("Firestore listener error (booked slots by room):", error);
    }
  );
  const unsubscribeManual = onSnapshot(
    query(collection(db, "roomUnavailability"), where("roomId", "==", roomId)),
    (snapshot) => {
      manualSlots = snapshot.docs.flatMap((doc) => {
        const data = doc.data() as ReservationSlotRecord;
        return data.date && data.startTime && data.endTime
          ? [{ date: data.date, startTime: data.startTime, endTime: data.endTime }]
          : [];
      });
      emit();
    },
    (error) => console.warn("Firestore listener error (manual room unavailability):", error)
  );
  return () => {
    unsubscribeReservations();
    unsubscribeManual();
  };
}

/**
 * Pure helper used by both the picker and the reservation submission flow to
 * guarantee a requested time slot does not overlap an approved reservation.
 * Always check this on submit even if the UI already disables the date - the
 * listener might be stale by a few ms.
 */
export function hasTimeConflict(
  date: string,
  startTime: string,
  endTime: string,
  bookedSlots: Array<{ date: string; startTime: string; endTime: string }>
): boolean {
  return bookedSlots.some((slot) => {
    if (slot.date !== date) return false;
    return startTime < slot.endTime && endTime > slot.startTime;
  });
}

/**
 * Statuses that the schedule panel should display visually. Approved slots
 * are blocking (red), pending slots are informational (yellow).
 */
const VISIBLE_STATUSES = ["approved", "pending"] as const;

/**
 * A booking slot enriched with ownership and status information so the
 * schedule panel can color-code and enforce interaction rules per slot.
 */
export interface EnrichedBookingSlot extends BookingSlot {
  status: "approved" | "pending" | "manual-unavailable";
  userId?: string;
}

/**
 * Represents one of the current user's active reservations across any room.
 * Used to enforce the "one reservation per time slot" cross-room rule.
 */
export interface UserActiveSlot {
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
  roomName: string;
  status: "approved" | "pending";
}

interface EnrichedReservationRecord {
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  userId?: string;
  roomId?: string;
  roomName?: string;
}

/**
 * Subscribes to all approved AND pending reservations for a given room,
 * enriched with userId and status. This powers the schedule panel's
 * color-coded time slot grid.
 *
 * Approved slots → red (reserved), Pending slots → yellow (pending).
 */
export function onEnrichedSlotsByRoom(
  roomId: string,
  callback: (slots: EnrichedBookingSlot[]) => void
): Unsubscribe {
  if (!roomId) {
    return () => {};
  }

  const reservationsQuery = query(
    collection(db, "reservations"),
    where("roomId", "==", roomId),
    where("status", "in", [...VISIBLE_STATUSES])
  );

  let reservationSlots: EnrichedBookingSlot[] = [];
  let manualSlots: EnrichedBookingSlot[] = [];
  const emit = () => callback([...reservationSlots, ...manualSlots].sort(
    (left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime)
  ));
  const unsubscribeReservations = onSnapshot(
    reservationsQuery,
    (snapshot) => {
      const slots: EnrichedBookingSlot[] = [];

      snapshot.docs.forEach((reservationDoc) => {
        const data = reservationDoc.data() as EnrichedReservationRecord;
        if (
          data.date &&
          data.startTime &&
          data.endTime &&
          data.userId &&
          (data.status === "approved" || data.status === "pending")
        ) {
          slots.push({
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            status: data.status,
            userId: data.userId,
          });
        }
      });

      reservationSlots = slots;
      emit();
    },
    (error) => {
      console.warn(
        "Firestore listener error (enriched slots by room):",
        error
      );
    }
  );
  const unsubscribeManual = onSnapshot(
    query(collection(db, "roomUnavailability"), where("roomId", "==", roomId)),
    (snapshot) => {
      manualSlots = snapshot.docs.flatMap((doc) => {
        const data = doc.data() as ReservationSlotRecord;
        return data.date && data.startTime && data.endTime
          ? [{ date: data.date, startTime: data.startTime, endTime: data.endTime, status: "manual-unavailable" as const }]
          : [];
      });
      emit();
    },
    (error) => console.warn("Firestore listener error (manual schedule slots):", error)
  );
  return () => {
    unsubscribeReservations();
    unsubscribeManual();
  };
}

/**
 * Subscribes to all approved + pending reservations belonging to a specific
 * user across ALL rooms. This enables the cross-room restriction rule:
 * a user can only hold one active reservation per time slot.
 */
export function onActiveReservationsByUser(
  userId: string,
  callback: (slots: UserActiveSlot[]) => void
): Unsubscribe {
  if (!userId) {
    return () => {};
  }

  const reservationsQuery = query(
    collection(db, "reservations"),
    where("userId", "==", userId),
    where("status", "in", [...VISIBLE_STATUSES])
  );

  return onSnapshot(
    reservationsQuery,
    (snapshot) => {
      const slots: UserActiveSlot[] = [];

      snapshot.docs.forEach((reservationDoc) => {
        const data = reservationDoc.data() as EnrichedReservationRecord;
        if (
          data.date &&
          data.startTime &&
          data.endTime &&
          data.roomId &&
          (data.status === "approved" || data.status === "pending")
        ) {
          slots.push({
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            roomId: data.roomId,
            roomName: data.roomName || data.roomId,
            status: data.status,
          });
        }
      });

      callback(
        slots.sort(
          (left, right) =>
            left.date.localeCompare(right.date) ||
            left.startTime.localeCompare(right.startTime)
        )
      );
    },
    (error) => {
      console.warn(
        "Firestore listener error (active reservations by user):",
        error
      );
    }
  );
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
