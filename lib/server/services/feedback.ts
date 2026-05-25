import "server-only";

import {
  analyzeFeedbackSentiment,
  averageSentimentScores,
  getSentimentLabel,
} from "@/lib/ai/sentiment";
import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import {
  resolveFeedbackSentimentLabel,
  summarizeFeedbackSentiment,
  type FeedbackSentimentFields,
  type FeedbackSentimentSummary,
} from "@/lib/feedback/feedback-sentiment";
import { getAssignedManagerIds } from "@/lib/server/services/building-managers";

export interface FeedbackCreateInput {
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

export interface FeedbackRecord extends FeedbackSentimentFields {
  adminResponse: string | null;
  buildingId: string;
  buildingName: string;
  compoundScore?: number;
  createdAt?: unknown;
  id: string;
  message: string;
  negativeScore?: number;
  neutralScore?: number;
  positiveScore?: number;
  rating: number;
  reservationId: string;
  respondedAt?: unknown;
  roomId: string;
  roomName: string;
  sentimentLabel: ReturnType<typeof resolveFeedbackSentimentLabel>;
  text: string;
  userId: string;
  userName: string;
}

export interface BuildingFeedbackSnapshot {
  feedback: FeedbackRecord[];
  summary: FeedbackSentimentSummary;
}

type FeedbackDocumentData = Partial<FeedbackRecord> & {
  sentimentLabel?: string | null;
  text?: string | null;
};

function getTimestampSeconds(value: unknown) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const candidate = value as {
    seconds?: unknown;
    _seconds?: unknown;
  };

  if (typeof candidate.seconds === "number") {
    return candidate.seconds;
  }

  if (typeof candidate._seconds === "number") {
    return candidate._seconds;
  }

  return 0;
}

function sortFeedbackRecords(left: FeedbackRecord, right: FeedbackRecord) {
  const timestampOrder =
    getTimestampSeconds(right.createdAt) - getTimestampSeconds(left.createdAt);

  if (timestampOrder !== 0) {
    return timestampOrder;
  }

  return right.id.localeCompare(left.id);
}

function mapFeedbackDocument(
  feedbackDoc: FirebaseFirestore.QueryDocumentSnapshot
): FeedbackRecord {
  const data = feedbackDoc.data() as FeedbackDocumentData;
  const text = data.text?.trim() || data.message?.trim() || "";

  return {
    adminResponse: data.adminResponse ?? null,
    buildingId: data.buildingId ?? "",
    buildingName: data.buildingName ?? "",
    compoundScore:
      typeof data.compoundScore === "number" ? data.compoundScore : undefined,
    createdAt: data.createdAt,
    id: feedbackDoc.id,
    message: data.message ?? text,
    negativeScore:
      typeof data.negativeScore === "number" ? data.negativeScore : undefined,
    neutralScore:
      typeof data.neutralScore === "number" ? data.neutralScore : undefined,
    positiveScore:
      typeof data.positiveScore === "number" ? data.positiveScore : undefined,
    rating: typeof data.rating === "number" ? data.rating : 0,
    reservationId: data.reservationId ?? "",
    respondedAt: data.respondedAt,
    roomId: data.roomId ?? "",
    roomName: data.roomName ?? "",
    sentimentLabel: resolveFeedbackSentimentLabel({
      compoundScore:
        typeof data.compoundScore === "number" ? data.compoundScore : undefined,
      sentimentLabel: data.sentimentLabel ?? undefined,
    }),
    text,
    userId: data.userId ?? "",
    userName: data.userName ?? "",
  };
}

export async function createFeedbackRecord(data: FeedbackCreateInput) {
  const adminIds = await getAssignedManagerIds(data.buildingId);
  const feedbackText = data.message.trim();
  const sentiment = analyzeFeedbackSentiment(feedbackText, data.rating);
  const sentimentLabel = getSentimentLabel(sentiment.compound);

  const feedbackRef = db.collection("feedback").doc();
  const batch = db.batch();

  batch.set(feedbackRef, {
    ...data,
    text: feedbackText,
    message: feedbackText,
    compoundScore: sentiment.compound,
    positiveScore: sentiment.positive,
    neutralScore: sentiment.neutral,
    negativeScore: sentiment.negative,
    sentimentLabel,
    adminResponse: null,
    respondedAt: null,
    createdAt: serverTimestamp(),
  });

  adminIds.forEach((adminUid) => {
    const notificationRef = db.collection("notifications").doc();
    batch.set(notificationRef, {
      recipientUid: adminUid,
      type: "feedback",
      title: "New Room Feedback",
      message: `${data.userName} left feedback for ${data.roomName}: "${feedbackText.slice(
        0,
        60
      )}${feedbackText.length > 60 ? "..." : ""}"`,
      buildingId: data.buildingId,
      reservationId: feedbackRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return feedbackRef.id;
}

export async function getFeedbackRecordsByUser(
  userId: string
): Promise<FeedbackRecord[]> {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    return [];
  }

  const snapshot = await db
    .collection("feedback")
    .where("userId", "==", normalizedUserId)
    .get();

  return snapshot.docs.map(mapFeedbackDocument).sort(sortFeedbackRecords);
}

export async function getFeedbackRecordsByBuilding(
  buildingId: string
): Promise<BuildingFeedbackSnapshot> {
  const normalizedBuildingId = buildingId.trim();

  if (!normalizedBuildingId) {
    return {
      feedback: [],
      summary: summarizeFeedbackSentiment([]),
    };
  }

  const snapshot = await db
    .collection("feedback")
    .where("buildingId", "==", normalizedBuildingId)
    .get();
  const feedback = snapshot.docs.map(mapFeedbackDocument).sort(sortFeedbackRecords);

  return {
    feedback,
    summary: summarizeFeedbackSentiment(feedback),
  };
}

export async function getAverageFeedbackSentiment(roomId: string) {
  const normalizedRoomId = roomId.trim();

  if (!normalizedRoomId) {
    return 0;
  }

  const snapshot = await db
    .collection("feedback")
    .where("roomId", "==", normalizedRoomId)
    .get();

  return averageSentimentScores(
    snapshot.docs.map((feedbackDoc) => {
      const data = feedbackDoc.data() as { compoundScore?: unknown };
      return typeof data.compoundScore === "number" ? data.compoundScore : null;
    })
  );
}

export async function respondToFeedbackRecord(feedbackId: string, response: string) {
  const batch = db.batch();
  batch.update(db.collection("feedback").doc(feedbackId), {
    adminResponse: response,
    respondedAt: serverTimestamp(),
  });
  await batch.commit();
}
