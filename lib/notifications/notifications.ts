import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
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
import { db } from "@/lib/firebase/firebase";
import { createGuardedSnapshotCallback } from "@/lib/firebase/firestoreListener";
import {
  isStaleReservationRequestNotification,
  type ReservationNotificationTarget,
} from "@/lib/notifications/staleReservationRequest";

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

function handleNotificationListenerError(
  scope: string,
  error: unknown,
  callback: (notifications: Notification[]) => void
) {
  console.warn(`Firestore listener error (${scope}):`, error);
  callback([]);
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
  try {
    const q = query(
      collection(db, "notifications"),
      where("recipientUid", "==", uid),
      where("read", "==", false),
      orderBy("createdAt", "desc")
    );
    const listener = createGuardedSnapshotCallback(callback);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs: Notification[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Notification));
        listener.emit(notifs);
      },
      (error) => {
        if (listener.isCancelled()) {
          return;
        }
        handleNotificationListenerError("unread notifications", error, callback);
      }
    );
    return listener.wrap(unsubscribe);
  } catch (error) {
    handleNotificationListenerError("unread notifications setup", error, callback);
    return () => {};
  }
}

// ─── Real-time All Notifications for a User ─────────────────────
export function onAllNotifications(
  uid: string,
  callback: (notifications: Notification[]) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, "notifications"),
      where("recipientUid", "==", uid),
      orderBy("createdAt", "desc")
    );
    const listener = createGuardedSnapshotCallback(callback);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs: Notification[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Notification));
        listener.emit(notifs);
      },
      (error) => {
        if (listener.isCancelled()) {
          return;
        }
        handleNotificationListenerError("all notifications", error, callback);
      }
    );
    return listener.wrap(unsubscribe);
  } catch (error) {
    handleNotificationListenerError("all notifications setup", error, callback);
    return () => {};
  }
}

// ─── Mark Single Notification as Read ───────────────────────────
export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await deleteDoc(doc(db, "notifications", notificationId));
}

export async function shouldDeleteNotificationOnClick(
  notification: Notification,
  userEmail?: string | null
): Promise<boolean> {
  if (
    notification.type !== "new_reservation" ||
    !notification.reservationId?.trim()
  ) {
    return false;
  }

  const reservationSnapshot = await getDoc(
    doc(db, "reservations", notification.reservationId)
  );

  if (!reservationSnapshot.exists()) {
    return true;
  }

  return isStaleReservationRequestNotification(
    reservationSnapshot.data() as ReservationNotificationTarget,
    userEmail
  );
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
