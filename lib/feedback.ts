import {
  addDoc,
  collection,
  type DocumentData,
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
import { auth, db } from "@/lib/configs/firebase";
import { createGuardedSnapshotCallback } from "@/lib/firestoreListener";
import {
  resolveFeedbackSentimentLabel,
  type FeedbackSentimentFields,
  type FeedbackSentimentSummary,
} from "@/lib/feedback-sentiment";
import {
  analyzeSentiment,
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

export interface BuildingFeedbackResult {
  feedback: Feedback[];
  summary: FeedbackSentimentSummary;
}

type TimestampLike =
  | Timestamp
  | {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    }
  | null
  | undefined;

type FeedbackSnapshot = Partial<Feedback> &
  FeedbackSentimentFields & {
    id?: string;
    sentimentLabel?: string | null;
    text?: string;
  };

function reviveTimestamp(value: TimestampLike): Timestamp | null | undefined {
  if (!value) {
    return value ?? undefined;
  }

  if (value instanceof Timestamp) {
    return value;
  }

  const seconds =
    typeof value.seconds === "number"
      ? value.seconds
      : typeof value._seconds === "number"
        ? value._seconds
        : null;
  const nanoseconds =
    typeof value.nanoseconds === "number"
      ? value.nanoseconds
      : typeof value._nanoseconds === "number"
        ? value._nanoseconds
        : 0;

  if (seconds === null) {
    return undefined;
  }

  return new Timestamp(seconds, nanoseconds);
}

function mapFeedbackData(id: string, data: FeedbackSnapshot): Feedback {
  const text = data.text ?? data.message ?? "";
  const compoundScore =
    typeof data.compoundScore === "number" ? data.compoundScore : undefined;

  return {
    id,
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
    compoundScore,
    positiveScore:
      typeof data.positiveScore === "number" ? data.positiveScore : undefined,
    neutralScore:
      typeof data.neutralScore === "number" ? data.neutralScore : undefined,
    negativeScore:
      typeof data.negativeScore === "number" ? data.negativeScore : undefined,
    sentimentLabel: resolveFeedbackSentimentLabel({
      compoundScore,
      sentimentLabel: data.sentimentLabel ?? undefined,
    }),
    adminResponse: data.adminResponse ?? null,
    respondedAt: reviveTimestamp(data.respondedAt) ?? null,
    createdAt: reviveTimestamp(data.createdAt) ?? undefined,
  };
}

function mapApiFeedback(feedback: FeedbackSnapshot & { id: string }) {
  return mapFeedbackData(feedback.id, feedback);
}

function mapFeedback(
  feedbackDoc: QueryDocumentSnapshot<DocumentData>
): Feedback {
  return mapFeedbackData(feedbackDoc.id, feedbackDoc.data() as FeedbackSnapshot);
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
  const currentUser = auth.currentUser;

  if (!normalizedRoomId) {
    throw new Error("A room id is required to submit feedback.");
  }

  if (!text) {
    throw new Error("Feedback text cannot be empty.");
  }

  if (!currentUser) {
    throw new Error("You must be signed in to submit feedback.");
  }

  const sentiment = analyzeSentiment(text);
  const sentimentLabel = getSentimentLabel(sentiment.compound);
  const feedbackRef = await addDoc(collection(db, "feedback"), {
    roomId: normalizedRoomId,
    userId: currentUser.uid,
    userName: currentUser.displayName?.trim() ?? "",
    text,
    message: text,
    rating: 0,
    compoundScore: sentiment.compound,
    positiveScore: sentiment.positive,
    neutralScore: sentiment.neutral,
    negativeScore: sentiment.negative,
    sentimentLabel,
    adminResponse: null,
    respondedAt: null,
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
    body: {
      response
    },
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
  const payload = await apiRequest<{ feedback: Array<FeedbackSnapshot & { id: string }> }>(
    "/api/feedback",
    {
      method: "GET",
      params: {
        userId
      },
      userId,
    }
  );

  return payload.feedback.map(mapApiFeedback);
}

export async function getFeedbackByBuilding(
  buildingId: string
): Promise<BuildingFeedbackResult> {
  const payload = await apiRequest<{
    feedback: Array<FeedbackSnapshot & { id: string }>;
    summary: FeedbackSentimentSummary;
  }>("/api/feedback", {
    method: "GET",
    params: {
      buildingId
    },
  });

  return {
    feedback: payload.feedback.map(mapApiFeedback),
    summary: payload.summary,
  };
}

export async function getAverageSentiment(roomId: string): Promise<number> {
  const normalizedRoomId = roomId.trim();

  if (!normalizedRoomId) {
    return 0;
  }

  const payload = await apiRequest<{ average: number }>("/api/feedback/average", {
    method: "GET",
    params: {
      roomId: normalizedRoomId
    },
  });

  return payload.average;
}
