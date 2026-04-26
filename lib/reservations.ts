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
import { type ReservationCampus } from "@/lib/campuses";
import {
  type DigiReservationApproverInput,
  type MainReservationApproverInput,
  type ReservationApprovalRecord,
  type ReservationApprovalStep,
} from "@/lib/reservation-approval";
import { auth, db } from "@/lib/configs/firebase";
import { type RoomCheckInMethod } from "@/lib/roomStatus";
import { createGuardedSnapshotCallback } from "@/lib/firestoreListener";

export interface Reservation {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  campus: ReservationCampus;
  date: string;
  startTime: string;
  endTime: string;
  programDepartmentOrganization?: string;
  purpose: string;
  approvalDocumentName?: string;
  approvalDocumentUrl?: string;
  approvalDocumentPath?: string;
  approvalDocumentMimeType?: string;
  approvalDocumentSize?: number;
  equipment?: Record<string, number>;
  approvalFlow: ReservationApprovalStep[];
  currentStep: number;
  approvals: ReservationApprovalRecord[];
  rejectedBy?: string;
  reason?: string;
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
  | "approvalFlow"
  | "currentStep"
  | "approvals"
  | "rejectedBy"
  | "reason"
  | "status"
  | "adminUid"
  | "checkedInAt"
  | "checkInMethod"
  | "createdAt"
  | "updatedAt"
>;

type ReservationCreateBaseInput = Omit<ReservationInput, "date"> & { date: string };

export type ReservationCreateInput =
  | (ReservationCreateBaseInput & DigiReservationApproverInput)
  | (ReservationCreateBaseInput & MainReservationApproverInput);

export type RecurringReservationCreateInput =
  | (Omit<ReservationCreateBaseInput, "date"> & DigiReservationApproverInput)
  | (Omit<ReservationCreateBaseInput, "date"> & MainReservationApproverInput);

function handleReservationListenerError(
  scope: string,
  error: unknown,
  callback: (reservations: Reservation[]) => void
) {
  console.warn(`Firestore listener error (${scope}):`, error);
  callback([]);
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function sortReservations(left: Reservation, right: Reservation) {
  const leftSeconds = left.createdAt?.seconds ?? 0;
  const rightSeconds = right.createdAt?.seconds ?? 0;

  return (
    rightSeconds - leftSeconds ||
    right.date.localeCompare(left.date) ||
    right.startTime.localeCompare(left.startTime) ||
    left.id.localeCompare(right.id)
  );
}

function normalizeApprovalEmail(email: string) {
  return email.trim().toLowerCase();
}

function getCurrentApprovalStep(reservation: Reservation) {
  if (
    !Array.isArray(reservation.approvalFlow) ||
    typeof reservation.currentStep !== "number"
  ) {
    return null;
  }

  return reservation.approvalFlow[reservation.currentStep] ?? null;
}

export async function createReservation(
  data: ReservationCreateInput
): Promise<string> {
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
  data: RecurringReservationCreateInput,
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

export async function validateReservationApprover(
  campus: ReservationCampus,
  email: string
): Promise<{ email: string; ok: true }> {
  return apiRequest("/api/reservation-approvers/validate", {
    body: { campus, email },
    method: "POST",
    userId: auth.currentUser?.uid,
  });
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

  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    reservationsQuery,
    (snapshot) => {
      listener.emit(
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
      if (listener.isCancelled()) {
        return;
      }
      console.warn("Firestore listener error (pending reservations):", error);
    }
  );
  return listener.wrap(unsubscribe);
}

export function onPendingReservationsByApprover(
  userEmail: string,
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const normalizedEmail = normalizeApprovalEmail(userEmail);
  try {
    const reservationsQuery = query(
      collection(db, "reservations"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const listener = createGuardedSnapshotCallback(callback);
    const unsubscribe = onSnapshot(
      reservationsQuery,
      (snapshot) => {
        listener.emit(
          snapshot.docs
            .map(
              (reservationDoc) =>
                ({
                  id: reservationDoc.id,
                  ...reservationDoc.data(),
                }) as Reservation
            )
            .filter((reservation) => {
              const currentStep = getCurrentApprovalStep(reservation);
              return currentStep?.email === normalizedEmail;
            })
        );
      },
      (error) => {
        if (listener.isCancelled()) {
          return;
        }
        handleReservationListenerError(
          "pending reservations by approver",
          error,
          callback
        );
      }
    );
    return listener.wrap(unsubscribe);
  } catch (error) {
    handleReservationListenerError(
      "pending reservations by approver setup",
      error,
      callback
    );
    return () => {};
  }
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

  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    reservationsQuery,
    (snapshot) => {
      listener.emit(
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
      if (listener.isCancelled()) {
        return;
      }
      console.warn("Firestore listener error (reservations by building):", error);
    }
  );
  return listener.wrap(unsubscribe);
}

export function onReservationsByBuildingIds(
  buildingIds: string[],
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const uniqueBuildingIds = [...new Set(buildingIds.filter(Boolean))];
  if (uniqueBuildingIds.length === 0) {
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  const reservationsByChunk = new Map<number, Reservation[]>();
  const buildingChunks = chunkValues(uniqueBuildingIds, 10);

  const emit = () => {
    listener.emit([...reservationsByChunk.values()].flat().sort(sortReservations));
  };

  const unsubscribers = buildingChunks.map((buildingChunk, chunkIndex) =>
    onSnapshot(
      query(
        collection(db, "reservations"),
        where("buildingId", "in", buildingChunk)
      ),
      (snapshot) => {
        if (listener.isCancelled()) {
          return;
        }
        reservationsByChunk.set(
          chunkIndex,
          snapshot.docs.map(
            (reservationDoc) =>
              ({
                id: reservationDoc.id,
                ...reservationDoc.data(),
              }) as Reservation
          )
        );
        emit();
      },
      (error) => {
        if (listener.isCancelled()) {
          return;
        }
        console.warn(
          "Firestore listener error (reservations by building ids):",
          error
        );
      }
    )
  );

  return listener.wrap(() => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });
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

  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    reservationsQuery,
    (snapshot) => {
      listener.emit(
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
      if (listener.isCancelled()) {
        return;
      }
      console.warn("Firestore listener error (reservations by user):", error);
    }
  );
  return listener.wrap(unsubscribe);
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

export async function approveReservation(
  reservationId: string,
  userEmail: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: { action: "approve", userEmail },
    method: "PATCH",
    userId: auth.currentUser?.uid,
  });
}

export async function rejectReservation(
  reservationId: string,
  userEmail: string,
  reason: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: { action: "reject", userEmail, reason },
    method: "PATCH",
    userId: auth.currentUser?.uid,
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

export async function disconnectReservationBeacon(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "disconnect-beacon",
      userId,
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
