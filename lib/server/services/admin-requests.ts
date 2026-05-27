import "server-only";

import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import { getAssignedManagerIds } from "@/lib/server/services/building-managers";
import {
  queueNotificationWrite,
  sendQueuedPushNotifications,
  type AppNotificationInput,
} from "@/lib/server/services/push-notifications";

export interface AdminRequestCreateInput {
  userId: string;
  userName: string;
  reservationId: string | null;
  type: "equipment" | "general" | "other";
  subject: string;
  message: string;
  buildingId: string;
  buildingName: string;
}

export async function createAdminRequestRecord(data: AdminRequestCreateInput) {
  const adminIds = await getAssignedManagerIds(data.buildingId);

  const requestRef = db.collection("adminRequests").doc();
  const batch = db.batch();
  const queuedNotifications: AppNotificationInput[] = [];

  batch.set(requestRef, {
    ...data,
    status: "open",
    adminResponse: null,
    createdAt: serverTimestamp(),
  });

  adminIds.forEach((adminUid) => {
    queueNotificationWrite(batch, queuedNotifications, {
      recipientUid: adminUid,
      type: "system",
      title: "New Admin Request",
      message: `${data.userName}: ${data.subject} - "${data.message.slice(0, 60)}${
        data.message.length > 60 ? "..." : ""
      }"`,
      buildingId: data.buildingId,
      reservationId: requestRef.id,
    });
  });

  await batch.commit();
  await sendQueuedPushNotifications(queuedNotifications);
  return requestRef.id;
}

export async function respondToAdminRequestRecord(
  requestId: string,
  responseText: string
) {
  const requestRef = db.collection("adminRequests").doc(requestId);
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists) {
    throw new Error("Admin request not found.");
  }

  const requestData = requestSnapshot.data() as {
    userId: string;
    subject: string;
    buildingId: string;
  };

  const batch = db.batch();
  const queuedNotifications: AppNotificationInput[] = [];
  batch.update(requestRef, {
    adminResponse: responseText,
    status: "responded",
  });

  queueNotificationWrite(batch, queuedNotifications, {
    recipientUid: requestData.userId,
    type: "system",
    title: "Admin Replied",
    message: `Your request "${requestData.subject}" received a response: "${responseText.slice(
      0,
      80
    )}${responseText.length > 80 ? "..." : ""}"`,
    buildingId: requestData.buildingId,
    reservationId: requestId,
  });

  await batch.commit();
  await sendQueuedPushNotifications(queuedNotifications);
}
