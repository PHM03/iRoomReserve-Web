import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  getDocs,
  Unsubscribe,
  Timestamp,
} from "firebase/firestore";
import { db } from "./configs/firebase";

// ─── Types ──────────────────────────────────────────────────────
export interface Notification {
  id: string;
  recipientUid: string;
  type: "new_reservation" | "reservation_cancelled" | "reservation_approved" | "reservation_rejected" | "feedback" | "system";
  title: string;
  message: string;
  buildingId: string;
  reservationId: string;
  read: boolean;
  createdAt?: Timestamp;
}

// ─── Create Notification ────────────────────────────────────────
export async function createNotification(data: {
  recipientUid: string;
  type: Notification["type"];
  title: string;
  message: string;
  buildingId: string;
  reservationId: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, "notifications"), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ─── Real-time Unread Notifications for a User ──────────────────
export function onUnreadNotifications(
  uid: string,
  callback: (notifications: Notification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    where("recipientUid", "==", uid),
    where("read", "==", false),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const notifs: Notification[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Notification));
    callback(notifs);
  }, (error) => {
    console.warn('Firestore listener error (unread notifications):', error);
  });
}

// ─── Real-time All Notifications for a User ─────────────────────
export function onAllNotifications(
  uid: string,
  callback: (notifications: Notification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    where("recipientUid", "==", uid),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const notifs: Notification[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Notification));
    callback(notifs);
  }, (error) => {
    console.warn('Firestore listener error (all notifications):', error);
  });
}

// ─── Mark Single Notification as Read ───────────────────────────
export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  await updateDoc(doc(db, "notifications", notificationId), {
    read: true,
  });
}

// ─── Mark All Notifications as Read for a User ──────────────────
export async function markAllNotificationsRead(uid: string): Promise<void> {
  const q = query(
    collection(db, "notifications"),
    where("recipientUid", "==", uid),
    where("read", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { read: true });
  });
  await batch.commit();
}
