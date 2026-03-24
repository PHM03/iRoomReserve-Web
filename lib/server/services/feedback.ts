import "server-only";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import { serverClientDb } from "@/lib/server/firebase-client";

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
  const adminsSnapshot = await getDocs(
    query(
      collection(serverClientDb, "users"),
      where("assignedBuildingId", "==", data.buildingId),
      where("status", "==", "approved")
    )
  );

  const feedbackRef = doc(collection(serverClientDb, "feedback"));
  const batch = writeBatch(serverClientDb);

  batch.set(feedbackRef, {
    ...data,
    adminResponse: null,
    respondedAt: null,
    createdAt: serverTimestamp(),
  });

  adminsSnapshot.docs.forEach((adminDoc) => {
    const notificationRef = doc(collection(serverClientDb, "notifications"));
    batch.set(notificationRef, {
      recipientUid: adminDoc.id,
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
