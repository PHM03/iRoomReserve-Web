import "server-only";

import {
  averageSentimentScores,
} from "@/lib/ai/sentiment";
import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import {
  analyzeFeedbackText,
  normalizeCategoryRatings,
  normalizeDetectedAspects,
  normalizeFeedbackKeywords,
  type DetectedFeedbackAspects,
  type FeedbackCategoryRatings,
} from "@/lib/feedback/feedback-analytics";
import {
  resolveFeedbackSentimentLabel,
  type FeedbackGenderSentimentSummary,
  summarizeFeedbackSentimentByGender,
  summarizeFeedbackSentiment,
  type FeedbackSentimentFields,
  type FeedbackSentimentSummary,
} from "@/lib/feedback/feedback-sentiment";
import {
  FEEDBACK_ANALYTICS_PERIODS,
  filterFeedbackByPeriod,
  type FeedbackAnalyticsPeriod,
} from "@/lib/feedback/feedback-period";
import { getAssignedManagerIds } from "@/lib/server/services/building-managers";
import { assertFeedbackSubmissionEligibility } from "@/lib/server/feedback-eligibility";
import {
  queueNotificationWrite,
  sendQueuedPushNotifications,
  type AppNotificationInput,
} from "@/lib/server/services/push-notifications";

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
  categoryRatings: FeedbackCategoryRatings;
}

export interface FeedbackRecord extends FeedbackSentimentFields {
  adminResponse: string | null;
  buildingId: string;
  buildingName: string;
  categoryRatings: Partial<FeedbackCategoryRatings>;
  category_ratings: Partial<FeedbackCategoryRatings>;
  compoundScore?: number;
  created_at?: unknown;
  createdAt?: unknown;
  detectedAspects: DetectedFeedbackAspects;
  detected_aspects: DetectedFeedbackAspects;
  extractedKeywords: string[];
  extracted_keywords: string[];
  feedbackText: string;
  feedback_text: string;
  gender?: unknown;
  id: string;
  message: string;
  negativeScore?: number;
  neutralScore?: number;
  overallRating: number;
  overall_rating: number;
  positiveScore?: number;
  rating: number;
  reservationId: string;
  respondedAt?: unknown;
  roomId: string;
  roomName: string;
  role?: unknown;
  sentimentLabel: ReturnType<typeof resolveFeedbackSentimentLabel>;
  sentimentClassification: ReturnType<typeof resolveFeedbackSentimentLabel>;
  sentiment_classification: ReturnType<typeof resolveFeedbackSentimentLabel>;
  text: string;
  userId: string;
  userName: string;
  vaderCompoundScore?: number;
  vader_compound_score?: number;
}

export interface BuildingFeedbackSnapshot {
  feedback: FeedbackRecord[];
  summary: FeedbackSentimentSummary;
  genderBreakdownByPeriod: Partial<Record<FeedbackAnalyticsPeriod, FeedbackGenderSentimentSummary[]>>;
}

type FeedbackDocumentData = Partial<FeedbackRecord> & {
  category_ratings?: unknown;
  created_at?: unknown;
  detected_aspects?: unknown;
  extracted_keywords?: unknown;
  feedback_text?: string | null;
  overall_rating?: number | null;
  sentiment_classification?: string | null;
  sentimentLabel?: string | null;
  text?: string | null;
  vader_compound_score?: number | null;
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
  const vaderCompoundScore =
    typeof data.vaderCompoundScore === "number"
      ? data.vaderCompoundScore
      : typeof data.vader_compound_score === "number"
        ? data.vader_compound_score
        : typeof data.compoundScore === "number"
          ? data.compoundScore
          : undefined;
  const sentimentClassification = resolveFeedbackSentimentLabel({
    compoundScore: vaderCompoundScore,
    detectedAspects,
    sentimentClassification:
      data.sentimentClassification ?? data.sentiment_classification ?? undefined,
    sentimentLabel: data.sentimentLabel ?? undefined,
    vaderCompoundScore,
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
    adminResponse: data.adminResponse ?? null,
    buildingId: data.buildingId ?? "",
    buildingName: data.buildingName ?? "",
    categoryRatings,
    category_ratings: categoryRatings,
    compoundScore: vaderCompoundScore,
    createdAt: data.createdAt ?? data.created_at,
    created_at: data.created_at ?? data.createdAt,
    detectedAspects,
    detected_aspects: detectedAspects,
    extractedKeywords,
    extracted_keywords: extractedKeywords,
    feedbackText: text,
    feedback_text: text,
    id: feedbackDoc.id,
    message: data.message ?? text,
    negativeScore:
      typeof data.negativeScore === "number" ? data.negativeScore : undefined,
    neutralScore:
      typeof data.neutralScore === "number" ? data.neutralScore : undefined,
    overallRating,
    overall_rating: overallRating,
    positiveScore:
      typeof data.positiveScore === "number" ? data.positiveScore : undefined,
    rating: overallRating,
    reservationId: data.reservationId ?? "",
    respondedAt: data.respondedAt,
    roomId: data.roomId ?? "",
    roomName: data.roomName ?? "",
    sentimentClassification,
    sentimentLabel: sentimentClassification,
    sentiment_classification: sentimentClassification,
    text,
    userId: data.userId ?? "",
    userName: data.userName ?? "",
    vaderCompoundScore,
    vader_compound_score: vaderCompoundScore,
  };
}

export async function createFeedbackRecord(
  data: FeedbackCreateInput,
  submitterRole: string | null,
) {
  const feedbackText = data.message.trim();
  const analytics = analyzeFeedbackText(feedbackText);
  const sentiment = analytics.sentiment;
  const sentimentClassification = analytics.sentimentClassification;
  const createdAt = serverTimestamp();

  const feedbackRef = db.collection("feedback").doc();
  const feedbackData = {
    ...data,
    categoryRatings: data.categoryRatings,
    category_ratings: data.categoryRatings,
    detectedAspects: analytics.detectedAspects,
    detected_aspects: analytics.detectedAspects,
    extractedKeywords: analytics.extractedKeywords,
    extracted_keywords: analytics.extractedKeywords,
    feedbackText,
    feedback_text: feedbackText,
    overallRating: data.rating,
    overall_rating: data.rating,
    text: feedbackText,
    message: feedbackText,
    compoundScore: sentiment.compound,
    positiveScore: sentiment.positive,
    neutralScore: sentiment.neutral,
    negativeScore: sentiment.negative,
    sentimentClassification,
    sentimentLabel: sentimentClassification,
    sentiment_classification: sentimentClassification,
    vaderCompoundScore: sentiment.compound,
    vader_compound_score: sentiment.compound,
    adminResponse: null,
    respondedAt: null,
    createdAt,
    created_at: createdAt,
  };

  const reservationRef = db.collection("reservations").doc(data.reservationId);
  const duplicateFeedbackQuery = db
    .collection("feedback")
    .where("reservationId", "==", data.reservationId)
    .limit(1);

  await db.runTransaction(async (transaction) => {
    const reservationSnapshot = await transaction.get(reservationRef);
    const duplicateFeedbackSnapshot = await transaction.get(duplicateFeedbackQuery);
    const reservation = reservationSnapshot.exists
      ? reservationSnapshot.data() ?? null
      : null;

    assertFeedbackSubmissionEligibility(
      data,
      submitterRole,
      reservation,
      !duplicateFeedbackSnapshot.empty,
    );

    transaction.create(feedbackRef, feedbackData);
  });

  const adminIds = await getAssignedManagerIds(data.buildingId);
  const batch = db.batch();
  const queuedNotifications: AppNotificationInput[] = [];

  adminIds.forEach((adminUid) => {
    queueNotificationWrite(batch, queuedNotifications, {
      recipientUid: adminUid,
      type: "feedback",
      title: "New Room Feedback",
      message: `${data.userName} left feedback for ${data.roomName}: "${feedbackText.slice(
        0,
        60
      )}${feedbackText.length > 60 ? "..." : ""}"`,
      buildingId: data.buildingId,
      reservationId: feedbackRef.id,
    });
  });

  await batch.commit();
  await sendQueuedPushNotifications(queuedNotifications);
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
      summary: {
        ...summarizeFeedbackSentiment([]),
        genderBreakdown: [],
      },
      genderBreakdownByPeriod: {},
    };
  }

  const snapshot = await db
    .collection("feedback")
    .where("buildingId", "==", normalizedBuildingId)
    .get();
  const feedback = snapshot.docs.map(mapFeedbackDocument).sort(sortFeedbackRecords);
  const userIds = [...new Set(feedback.map((item) => item.userId).filter(Boolean))];
  const profileByUserId = new Map<string, { gender?: unknown; role?: unknown }>();

  await Promise.all(
    userIds.map(async (userId) => {
      const profileSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("private")
        .doc("profile")
        .get();

      if (profileSnapshot.exists) {
        const profileData = profileSnapshot.data() ?? {};
        profileByUserId.set(userId, {
          gender: profileData.gender,
          role: profileData.role,
        });
      }
    })
  );

  const withProfile = (items: FeedbackRecord[]) => items.map((item) => ({
      ...item,
      gender: profileByUserId.get(item.userId)?.gender,
      role: profileByUserId.get(item.userId)?.role,
    }));
  const genderBreakdown = summarizeFeedbackSentimentByGender(withProfile(feedback));
  const genderBreakdownByPeriod = Object.fromEntries(
    FEEDBACK_ANALYTICS_PERIODS.map((period) => [
      period,
      summarizeFeedbackSentimentByGender(
        withProfile(filterFeedbackByPeriod(feedback, period).items)
      ),
    ])
  ) as Partial<Record<FeedbackAnalyticsPeriod, FeedbackGenderSentimentSummary[]>>;

  return {
    feedback: withProfile(feedback),
    summary: {
      ...summarizeFeedbackSentiment(feedback),
      genderBreakdown,
    },
    genderBreakdownByPeriod,
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
      const data = feedbackDoc.data() as {
        compoundScore?: unknown;
        vaderCompoundScore?: unknown;
        vader_compound_score?: unknown;
      };

      if (typeof data.vaderCompoundScore === "number") {
        return data.vaderCompoundScore;
      }

      if (typeof data.vader_compound_score === "number") {
        return data.vader_compound_score;
      }

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
