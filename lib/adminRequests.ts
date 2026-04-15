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
import { db } from "@/lib/configs/firebase";

export interface AdminRequest {
  id: string;
  userId: string;
  userName: string;
  reservationId: string | null;
  type: "equipment" | "general" | "other";
  subject: string;
  message: string;
  status: "open" | "responded" | "closed";
  adminResponse: string | null;
  buildingId: string;
  buildingName: string;
  createdAt?: Timestamp;
}

export type AdminRequestInput = Omit<
  AdminRequest,
  "id" | "status" | "adminResponse" | "createdAt"
>;

export async function createAdminRequest(
  data: AdminRequestInput
): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/admin/requests", {
    body: data,
    method: "POST",
    userId: data.userId,
  });

  return payload.id;
}

export function onAdminRequestsByUser(
  userId: string,
  callback: (requests: AdminRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "adminRequests"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (requestDoc) =>
            ({
              id: requestDoc.id,
              ...requestDoc.data(),
            }) as AdminRequest
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (admin requests by user):", error);
    }
  );
}

export async function getAdminRequestsByUser(
  userId: string
): Promise<AdminRequest[]> {
  const q = query(
    collection(db, "adminRequests"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map(
    (requestDoc) =>
      ({
        id: requestDoc.id,
        ...requestDoc.data(),
      }) as AdminRequest
  );
}

export function onAdminRequestsByBuilding(
  buildingId: string,
  callback: (requests: AdminRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "adminRequests"),
    where("buildingId", "==", buildingId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (requestDoc) =>
            ({
              id: requestDoc.id,
              ...requestDoc.data(),
            }) as AdminRequest
        )
      );
    },
    (error) => {
      console.warn(
        "Firestore listener error (admin requests by building):",
        error
      );
    }
  );
}

export async function respondToAdminRequest(
  requestId: string,
  responseText: string
): Promise<void> {
  await apiRequest(`/api/admin/requests/${requestId}`, {
    body: { responseText },
    method: "PATCH",
  });
}
