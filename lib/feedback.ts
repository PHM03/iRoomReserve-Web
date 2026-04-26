import {
  addDoc,
  collection,
  type DocumentData,
  getDocs,
  onSnapshot,
  orderBy,
  type QueryDocumentSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import { db } from "@/lib/configs/firebase";
import { createGuardedSnapshotCallback } from "@/lib/firestoreListener";
import {
  analyzeSentiment,
  averageSentimentScores,
  getSentimentLabel,
  type SentimentAnalysis,
  type SentimentLabel,
} from "@/lib/sentiment";

export interface Feedback {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  reservationId: string;
  userId: string;
  userName: string;
  text: string;
  message: string;
  rating: number;
  compoundScore?: number;
  positiveScore?: number;
  neutralScore?: number;
  negativeScore?: number;
  sentimentLabel?: SentimentLabel;
  adminResponse: string | null;
  respondedAt?: Timestamp | null;
  createdAt?: Timestamp;
}

export interface FeedbackInput {
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  reservationId: string;
  userId: string;
  userName: string;
  message: string;
  rating: number;
}

export interface SubmitFeedbackResult {
  id: string;
  sentiment: SentimentAnalysis;
  sentimentLabel: SentimentLabel;
}

type FeedbackSnapshot = Partial<Feedback> & {
  sentimentLabel?: string;
  text?: string;
};

function isSentimentLabel(value: unknown): value is SentimentLabel {
  return value === "positive" || value === "neutral" || value === "negative";
}

function mapFeedback(
  feedbackDoc: QueryDocumentSnapshot<DocumentData>
): Feedback {
  const data = feedbackDoc.data() as FeedbackSnapshot;
  const text = data.text ?? data.message ?? "";

  return {
    id: feedbackDoc.id,
    roomId: data.roomId ?? "",
    roomName: data.roomName ?? "",
    buildingId: data.buildingId ?? "",
    buildingName: data.buildingName ?? "",
    reservationId: data.reservationId ?? "",
    userId: data.userId ?? "",
    userName: data.userName ?? "",
    text,
    message: data.message ?? text,
    rating: typeof data.rating === "number" ? data.rating : 0,
    compoundScore:
      typeof data.compoundScore === "number" ? data.compoundScore : undefined,
    positiveScore:
      typeof data.positiveScore === "number" ? data.positiveScore : undefined,
    neutralScore:
      typeof data.neutralScore === "number" ? data.neutralScore : undefined,
    negativeScore:
      typeof data.negativeScore === "number" ? data.negativeScore : undefined,
    sentimentLabel: isSentimentLabel(data.sentimentLabel)
      ? data.sentimentLabel
      : undefined,
    adminResponse: data.adminResponse ?? null,
    respondedAt: data.respondedAt ?? null,
    createdAt: data.createdAt,
  };
}

export async function createFeedback(data: FeedbackInput): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/feedback", {
    body: data,
    method: "POST",
    userId: data.userId,
  });

  return payload.id;
}

export async function submitFeedback(
  roomId: string,
  feedbackText: string
): Promise<SubmitFeedbackResult> {
  const normalizedRoomId = roomId.trim();
  const text = feedbackText.trim();

  if (!normalizedRoomId) {
    throw new Error("A room id is required to submit feedback.");
  }

  if (!text) {
    throw new Error("Feedback text cannot be empty.");
  }

  const sentiment = analyzeSentiment(text);
  const sentimentLabel = getSentimentLabel(sentiment.compound);
  const feedbackRef = await addDoc(collection(db, "feedback"), {
    roomId: normalizedRoomId,
    text,
    compoundScore: sentiment.compound,
    positiveScore: sentiment.positive,
    neutralScore: sentiment.neutral,
    negativeScore: sentiment.negative,
    sentimentLabel,
    createdAt: serverTimestamp(),
  });

  return {
    id: feedbackRef.id,
    sentiment,
    sentimentLabel,
  };
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
  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      listener.emit(snapshot.docs.map(mapFeedback));
    },
    (error) => {
      if (listener.isCancelled()) {
        return;
      }
      console.warn("Firestore listener error (feedback):", error);
    }
  );
  return listener.wrap(unsubscribe);
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
  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      listener.emit(snapshot.docs.map(mapFeedback));
    },
    (error) => {
      if (listener.isCancelled()) {
        return;
      }
      console.warn("Firestore listener error (feedback by user):", error);
    }
  );
  return listener.wrap(unsubscribe);
}

export async function getFeedbackByUser(userId: string): Promise<Feedback[]> {
  const q = query(
    collection(db, "feedback"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map(mapFeedback);
}

export async function getAverageSentiment(roomId: string): Promise<number> {
  const normalizedRoomId = roomId.trim();

  if (!normalizedRoomId) {
    return 0;
  }

  const sentimentQuery = query(
    collection(db, "feedback"),
    where("roomId", "==", normalizedRoomId)
  );
  const snapshot = await getDocs(sentimentQuery);

  return averageSentimentScores(
    snapshot.docs.map((feedbackDoc) => {
      const data = feedbackDoc.data() as { compoundScore?: unknown };
      return typeof data.compoundScore === "number" ? data.compoundScore : null;
    })
  );
}
