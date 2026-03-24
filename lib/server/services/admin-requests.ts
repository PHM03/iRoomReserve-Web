import "server-only";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import { serverClientDb } from "@/lib/server/firebase-client";

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
  const adminsSnapshot = await getDocs(
    query(
      collection(serverClientDb, "users"),
      where("assignedBuildingId", "==", data.buildingId),
      where("status", "==", "approved")
    )
  );

  const requestRef = doc(collection(serverClientDb, "adminRequests"));
  const batch = writeBatch(serverClientDb);

  batch.set(requestRef, {
    ...data,
    status: "open",
    adminResponse: null,
    createdAt: serverTimestamp(),
  });

  adminsSnapshot.docs.forEach((adminDoc) => {
    const notificationRef = doc(collection(serverClientDb, "notifications"));
    batch.set(notificationRef, {
      recipientUid: adminDoc.id,
      type: "system",
      title: "New Admin Request",
      message: `${data.userName}: ${data.subject} - "${data.message.slice(0, 60)}${
        data.message.length > 60 ? "..." : ""
      }"`,
      buildingId: data.buildingId,
      reservationId: requestRef.id,
      read: false,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return requestRef.id;
}

export async function respondToAdminRequestRecord(
  requestId: string,
  responseText: string
) {
  const requestRef = doc(serverClientDb, "adminRequests", requestId);
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists()) {
    throw new Error("Admin request not found.");
  }

  const requestData = requestSnapshot.data() as {
    userId: string;
    subject: string;
    buildingId: string;
  };

  const batch = writeBatch(serverClientDb);
  batch.update(requestRef, {
    adminResponse: responseText,
    status: "responded",
  });

  const notificationRef = doc(collection(serverClientDb, "notifications"));
  batch.set(notificationRef, {
    recipientUid: requestData.userId,
    type: "system",
    title: "Admin Replied",
    message: `Your request "${requestData.subject}" received a response: "${responseText.slice(
      0,
      80
    )}${responseText.length > 80 ? "..." : ""}"`,
    buildingId: requestData.buildingId,
    reservationId: requestId,
    read: false,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
}
