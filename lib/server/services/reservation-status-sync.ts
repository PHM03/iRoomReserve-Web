import "server-only";

import { db } from "@/lib/firebase/firebase-admin";

type SyncableReservationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export interface ReservationStatusSyncInput {
  dcSpaceEventId?: string | null;
  id: string;
  roomId: string;
  roomName: string;
  status: SyncableReservationStatus;
}

interface ReservationStatusSyncPayload {
  eventId?: string;
  reservationId: string;
  status: SyncableReservationStatus;
  room: {
    id: string;
    name: string;
    capacity: number;
  };
  updatedAt: string;
}

function getDcSpaceEventId(responseBody: unknown, reservationId: string) {
  if (!responseBody || typeof responseBody !== "object") {
    return null;
  }

  const reservation = (responseBody as { reservation?: unknown }).reservation;
  if (!reservation || typeof reservation !== "object") {
    return null;
  }

  const result = reservation as {
    dcSpaceEventId?: unknown;
    eventId?: unknown;
    reservationId?: unknown;
  };

  if (result.reservationId !== reservationId) {
    console.warn("[reservation-status-sync] Ignoring mismatched response", {
      expectedReservationId: reservationId,
      responseReservationId: result.reservationId,
    });
    return null;
  }

  const eventId = result.eventId ?? result.dcSpaceEventId;
  return typeof eventId === "string" && eventId.trim().length > 0
    ? eventId.trim()
    : null;
}

function getIntegrationConfig() {
  const endpoint = process.env.RESERVATION_STATUS_SYNC_URL?.trim();
  const secret = process.env.RESERVATION_STATUS_SYNC_SECRET?.trim();

  if (!endpoint || !secret) {
    return null;
  }

  return { endpoint, secret };
}

/**
 * Delivers status changes to the collaborating system without ever exposing its
 * credentials to the browser. A failed delivery is logged but does not undo a
 * completed Firestore reservation update.
 */
export async function syncReservationStatuses(
  reservations: ReservationStatusSyncInput[]
) {
  const config = getIntegrationConfig();
  if (!config || reservations.length === 0) {
    return;
  }

  await Promise.allSettled(
    reservations.map(async (reservation) => {
      const roomSnapshot = await db.collection("rooms").doc(reservation.roomId).get();
      const roomData = roomSnapshot.exists
        ? (roomSnapshot.data() as { capacity?: unknown })
        : undefined;
      const capacity =
        typeof roomData?.capacity === "number" && Number.isFinite(roomData.capacity)
          ? roomData.capacity
          : 0;
      const payload: ReservationStatusSyncPayload = {
        reservationId: reservation.id,
        status: reservation.status,
        room: {
          id: reservation.roomId,
          name: reservation.roomName,
          capacity,
        },
        updatedAt: new Date().toISOString(),
      };

      if (reservation.dcSpaceEventId?.trim()) {
        payload.eventId = reservation.dcSpaceEventId.trim();
      }

      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.secret}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Partner API responded with ${response.status}.`);
      }

      const responseBody: unknown = await response.json().catch(() => null);
      const dcSpaceEventId = getDcSpaceEventId(responseBody, reservation.id);

      if (dcSpaceEventId) {
        await db.collection("reservations").doc(reservation.id).set(
          { dcSpaceEventId },
          { merge: true }
        );
      }
    })
  ).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error("[reservation-status-sync] Delivery failed", {
          reservationId: reservations[index].id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  });
}
