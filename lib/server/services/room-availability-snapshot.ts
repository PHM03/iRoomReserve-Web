import "server-only";

import { db } from "@/lib/firebase/firebase-admin";
import {
  sanitizeRoomReservation,
  type PublicRoomReservation,
} from "@/lib/reservations/roomAvailabilitySnapshot";

export type SanitizedRoomReservation = PublicRoomReservation;

/** Returns only schedule fields needed by the reservation picker and assistant. */
export async function getSanitizedRoomReservations(
  buildingIds: readonly string[],
  currentUserId: string
): Promise<SanitizedRoomReservation[]> {
  const uniqueBuildingIds = [...new Set(buildingIds.filter(Boolean))];
  const result: SanitizedRoomReservation[] = [];

  for (let index = 0; index < uniqueBuildingIds.length; index += 10) {
    const chunk = uniqueBuildingIds.slice(index, index + 10);
    const snapshot = await db
      .collection("reservations")
      .where("buildingId", "in", chunk)
      .get();

    snapshot.docs.forEach((document) => {
      const sanitized = sanitizeRoomReservation(document.data(), currentUserId);
      if (sanitized) result.push(sanitized);
    });
  }

  return result;
}
