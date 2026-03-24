import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import { db } from "@/lib/firebase";

export interface Feedback {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  reservationId: string;
  userId: string;
  userName: string;
  message: string;
  rating: number;
  adminResponse: string | null;
  respondedAt?: Timestamp | null;
  createdAt?: Timestamp;
}

export type FeedbackInput = Omit<
  Feedback,
  "id" | "adminResponse" | "respondedAt" | "createdAt"
>;

export async function createFeedback(data: FeedbackInput): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/feedback", {
    body: data,
    method: "POST",
    userId: data.userId,
  });

  return payload.id;
}

export function onFeedbackByBuilding(
  buildingId: string,
  callback: (feedback: Feedback[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "feedback"),
    where("buildingId", "==", buildingId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (feedbackDoc) =>
            ({
              id: feedbackDoc.id,
              ...feedbackDoc.data(),
            }) as Feedback
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (feedback):", error);
    }
  );
}

export async function respondToFeedback(
  feedbackId: string,
  response: string
): Promise<void> {
  await apiRequest(`/api/feedback/${feedbackId}`, {
    body: { response },
    method: "PATCH",
  });
}

export function onFeedbackByUser(
  userId: string,
  callback: (feedback: Feedback[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "feedback"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map(
          (feedbackDoc) =>
            ({
              id: feedbackDoc.id,
              ...feedbackDoc.data(),
            }) as Feedback
        )
      );
    },
    (error) => {
      console.warn("Firestore listener error (feedback by user):", error);
    }
  );
}
