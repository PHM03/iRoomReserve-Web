"use client";

import { useEffect, useRef, useState } from "react";

import {
  onReservationsByUser,
  type Reservation,
} from "@/lib/reservations/reservations";
import { formatTimeRange } from "@/lib/utils/dateTime";

const DC_SPACE_URL = "https://dcspace-final.vercel.app";

function needsDcSpaceEventManagement(reservation: Reservation) {
  return (
    reservation.isEvent === "Yes" &&
    reservation.status === "approved" &&
    !reservation.dcSpaceEventId?.trim()
  );
}

interface DcSpaceEventApprovedModalProps {
  userId: string;
}

/**
 * Prompts once for each authenticated app session. The prompt is deliberately
 * not shown again while Firestore updates arrive during the same login.
 */
export default function DcSpaceEventApprovedModal({
  userId,
}: Readonly<DcSpaceEventApprovedModalProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [eventReservation, setEventReservation] = useState<Reservation | null>(
    null
  );
  const promptedReservationIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const unsubscribe = onReservationsByUser(userId, (reservations) => {
      const unresolvedEventReservations = reservations.filter(
        needsDcSpaceEventManagement
      );
      const nextUnpromptedEvent = unresolvedEventReservations.find(
        (reservation) => !promptedReservationIdsRef.current.has(reservation.id)
      );

      if (!nextUnpromptedEvent) {
        return;
      }

      // Mark the current set as prompted so "Maybe Later" does not reopen the
      // dialog repeatedly. A reservation approved later in this login remains
      // unmarked and will open the dialog once.
      unresolvedEventReservations.forEach((reservation) => {
        promptedReservationIdsRef.current.add(reservation.id);
      });
      setEventReservation(nextUnpromptedEvent);
      setIsOpen(true);
    });

    return unsubscribe;
  }, [userId]);

  if (!isOpen || !eventReservation) {
    return null;
  }

  return (
    <div
      aria-labelledby="dc-space-event-approved-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="m5 12 4.5 4.5L19 7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
              />
            </svg>
          </div>

          <div>
            <h2
              className="text-xl font-bold text-slate-900"
              id="dc-space-event-approved-title"
            >
              Your event has been approved
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {eventReservation.purpose} at {eventReservation.roomName} from{" "}
              {formatTimeRange(
                eventReservation.startTime,
                eventReservation.endTime
              )}. To manage it, continue to DC Space.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            Maybe Later
          </button>
          <a
            className="rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-primary-hover"
            href={DC_SPACE_URL}
            onClick={() => setIsOpen(false)}
            rel="noreferrer"
            target="_blank"
          >
            Sure
          </a>
        </div>
      </div>
    </div>
  );
}
