import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import { db } from "@/lib/firebase";
import { type RoomCheckInMethod } from "@/lib/roomStatus";

export interface Reservation {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  equipment?: Record<string, number>;
  endorsedByEmail?: string;
  status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
  adminUid: string | null;
  recurringGroupId?: string;
  checkedInAt?: Timestamp | null;
  checkInMethod?: RoomCheckInMethod | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ReservationInput = Omit<
  Reservation,
  | "id"
  | "status"
  | "adminUid"
  | "checkedInAt"
  | "checkInMethod"
  | "createdAt"
  | "updatedAt"
>;

export async function createReservation(data: ReservationInput): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/reservations", {
    body: {
      type: "single",
      reservation: data,
    },
    method: "POST",
    role: data.userRole as never,
    userId: data.userId,
  });

  return payload.id;
}

export async function createRecurringReservation(
  data: Omit<ReservationInput, "date">,
  selectedDays: number[],
  startDate: string,
  endDate: string
): Promise<string[]> {
  const payload = await apiRequest<{ ids: string[] }>("/api/reservations", {
    body: {
      type: "recurring",
      reservation: data,
      selectedDays,
      startDate,
      endDate,
    },
    method: "POST",
    role: data.userRole as never,
    userId: data.userId,
  });

  return payload.ids;
}

export function onPendingReservationsByBuilding(
  buildingId: string,
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const reservationsQuery = query(
    collection(db, "reservations"),
    where("buildingId", "==", buildingId),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    reservationsQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (reservationDoc) =>
            ({
              id: reservationDoc.id,
              ...reservationDoc.data(),
            }) as Reservation
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (pending reservations):", error);
    }
  );
}

export function onReservationsByBuilding(
  buildingId: string,
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const reservationsQuery = query(
    collection(db, "reservations"),
    where("buildingId", "==", buildingId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    reservationsQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (reservationDoc) =>
            ({
              id: reservationDoc.id,
              ...reservationDoc.data(),
            }) as Reservation
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (reservations by building):", error);
    }
  );
}

export function onReservationsByUser(
  userId: string,
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const reservationsQuery = query(
    collection(db, "reservations"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    reservationsQuery,
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (reservationDoc) =>
            ({
              id: reservationDoc.id,
              ...reservationDoc.data(),
            }) as Reservation
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (reservations by user):", error);
    }
  );
}

export async function getReservationsByUser(
  userId: string
): Promise<Reservation[]> {
  const reservationsQuery = query(
    collection(db, "reservations"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(reservationsQuery);

  return snapshot.docs.map(
    (reservationDoc) =>
      ({
        id: reservationDoc.id,
        ...reservationDoc.data(),
      }) as Reservation
  );
}

export async function approveReservation(reservationId: string): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: { action: "approve" },
    method: "PATCH",
  });
}

export async function rejectReservation(reservationId: string): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: { action: "reject" },
    method: "PATCH",
  });
}

export async function checkInReservation(
  reservationId: string,
  userId: string,
  method: RoomCheckInMethod = "manual"
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "check-in",
      userId,
      method,
    },
    method: "PATCH",
    userId,
  });
}

export async function cancelReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "cancel",
      userId,
    },
    method: "PATCH",
    userId,
  });
}

export async function completeReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "complete",
      userId,
    },
    method: "PATCH",
    userId,
  });
}

export async function deleteReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "delete",
      userId,
    },
    method: "PATCH",
    userId,
  });
}
