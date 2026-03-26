import "server-only";

import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { serverClientDb } from "@/lib/server/firebase-client";
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

export async function createFeedbackRecord(data: FeedbackCreateInput) {
  const adminIds = await getAssignedManagerIds(data.buildingId);

  const feedbackRef = doc(collection(serverClientDb, "feedback"));
  const batch = writeBatch(serverClientDb);

  batch.set(feedbackRef, {
    ...data,
    adminResponse: null,
    respondedAt: null,
    createdAt: serverTimestamp(),
  });

  adminIds.forEach((adminUid) => {
    const notificationRef = doc(collection(serverClientDb, "notifications"));
    batch.set(notificationRef, {
      recipientUid: adminUid,
      type: "feedback",
      title: "New Room Feedback",
      message: `${data.userName} left feedback for ${data.roomName}: "${data.message.slice(
        0,
        60
      )}${data.message.length > 60 ? "..." : ""}"`,
      buildingId: data.buildingId,
      reservationId: feedbackRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return feedbackRef.id;
}

export async function respondToFeedbackRecord(feedbackId: string, response: string) {
  const batch = writeBatch(serverClientDb);
  batch.update(doc(serverClientDb, "feedback", feedbackId), {
    adminResponse: response,
    respondedAt: serverTimestamp(),
  });
  await batch.commit();
}
