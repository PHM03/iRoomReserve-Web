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
import { auth, db } from "@/lib/firebase/firebase";
import { createGuardedSnapshotCallback } from "@/lib/firebase/firestoreListener";
import {
  resolveFeedbackSentimentLabel,
  type FeedbackSentimentFields,
  type FeedbackSentimentSummary,
} from "@/lib/feedback/feedback-sentiment";
import {
  type SentimentAnalysis,
  type SentimentLabel,
} from "@/lib/ai/sentiment";
import {
  analyzeFeedbackText,
  normalizeCategoryRatings,
  normalizeDetectedAspects,
  normalizeFeedbackKeywords,
  type DetectedFeedbackAspects,
  type FeedbackCategoryRatings,
} from "@/lib/feedback/feedback-analytics";

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
  overallRating: number;
  categoryRatings: Partial<FeedbackCategoryRatings>;
  feedbackText: string;
  compoundScore?: number;
  vaderCompoundScore?: number;
  positiveScore?: number;
  neutralScore?: number;
  negativeScore?: number;
  sentimentLabel?: SentimentLabel;
  sentimentClassification?: SentimentLabel;
  detectedAspects: DetectedFeedbackAspects;
  extractedKeywords: string[];
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
  categoryRatings: FeedbackCategoryRatings;
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
    category_ratings?: unknown;
    created_at?: TimestampLike;
    detected_aspects?: unknown;
    extracted_keywords?: unknown;
    feedback_text?: string | null;
    id?: string;
    overall_rating?: number | null;
    sentimentClassification?: string | null;
    sentiment_classification?: string | null;
    sentimentLabel?: string | null;
    text?: string;
    vaderCompoundScore?: number | null;
    vader_compound_score?: number | null;
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
  const text =
    data.feedback_text?.trim() ||
    data.feedbackText?.trim() ||
    data.text?.trim() ||
    data.message?.trim() ||
    "";
  const fallbackAnalytics = text ? analyzeFeedbackText(text) : null;
  const normalizedAspects = normalizeDetectedAspects(
    data.detectedAspects ?? data.detected_aspects
  );
  const detectedAspects =
    Object.keys(normalizedAspects).length > 0
      ? normalizedAspects
      : (fallbackAnalytics?.detectedAspects ?? {});
  const normalizedKeywords = normalizeFeedbackKeywords(
    data.extractedKeywords ?? data.extracted_keywords
  );
  const extractedKeywords =
    normalizedKeywords.length > 0
      ? normalizedKeywords
      : (fallbackAnalytics?.extractedKeywords ?? []);
  const categoryRatings = normalizeCategoryRatings(
    data.categoryRatings ?? data.category_ratings
  );
  const compoundScore =
    typeof data.vaderCompoundScore === "number"
      ? data.vaderCompoundScore
      : typeof data.vader_compound_score === "number"
        ? data.vader_compound_score
        : typeof data.compoundScore === "number"
          ? data.compoundScore
          : undefined;
  const sentimentClassification = resolveFeedbackSentimentLabel({
    compoundScore,
    detectedAspects,
    sentimentClassification:
      data.sentimentClassification ?? data.sentiment_classification ?? undefined,
    sentimentLabel: data.sentimentLabel ?? undefined,
    vaderCompoundScore: compoundScore,
  });
  const overallRating =
    typeof data.overallRating === "number"
      ? data.overallRating
      : typeof data.overall_rating === "number"
        ? data.overall_rating
        : typeof data.rating === "number"
          ? data.rating
          : 0;

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
    rating: overallRating,
    overallRating,
    categoryRatings,
    feedbackText: text,
    compoundScore,
    vaderCompoundScore: compoundScore,
    positiveScore:
      typeof data.positiveScore === "number" ? data.positiveScore : undefined,
    neutralScore:
      typeof data.neutralScore === "number" ? data.neutralScore : undefined,
    negativeScore:
      typeof data.negativeScore === "number" ? data.negativeScore : undefined,
    sentimentClassification,
    sentimentLabel: sentimentClassification,
    detectedAspects,
    extractedKeywords,
    adminResponse: data.adminResponse ?? null,
    respondedAt: reviveTimestamp(data.respondedAt) ?? null,
    createdAt: reviveTimestamp(data.createdAt ?? data.created_at) ?? undefined,
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

  const analytics = analyzeFeedbackText(text);
  const sentiment = analytics.sentiment;
  const sentimentLabel = analytics.sentimentClassification;
  const createdAt = serverTimestamp();
  const feedbackRef = await addDoc(collection(db, "feedback"), {
    roomId: normalizedRoomId,
    userId: currentUser.uid,
    userName: currentUser.displayName?.trim() ?? "",
    text,
    message: text,
    feedbackText: text,
    feedback_text: text,
    rating: 0,
    overallRating: 0,
    overall_rating: 0,
    compoundScore: sentiment.compound,
    vaderCompoundScore: sentiment.compound,
    vader_compound_score: sentiment.compound,
    positiveScore: sentiment.positive,
    neutralScore: sentiment.neutral,
    negativeScore: sentiment.negative,
    detectedAspects: analytics.detectedAspects,
    detected_aspects: analytics.detectedAspects,
    extractedKeywords: analytics.extractedKeywords,
    extracted_keywords: analytics.extractedKeywords,
    sentimentClassification: sentimentLabel,
    sentiment_classification: sentimentLabel,
    sentimentLabel,
    adminResponse: null,
    respondedAt: null,
    createdAt,
    created_at: createdAt,
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
  const payload = await apiRequest<{ feedback: Array<FeedbackSnapshot & { id: string }> }>(
    "/api/feedback",
    {
      method: "GET",
      params: { userId },
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
    params: { buildingId },
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
    params: { roomId: normalizedRoomId },
  });

  return payload.average;
}
