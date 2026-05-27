import "server-only";

import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";

export type AppNotificationType =
  | "new_reservation"
  | "reservation_cancelled"
  | "reservation_approved"
  | "reservation_rejected"
  | "feedback"
  | "system";

export interface AppNotificationInput {
  recipientUid: string;
  type: AppNotificationType;
  title: string;
  message: string;
  buildingId: string;
  reservationId: string;
  route?: string;
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const RESERVATION_UPDATES_CHANNEL_ID = "reservation-updates";

function isExpoPushToken(token: string) {
  return /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token.trim());
}

function getExpoPushTokens(userData: Record<string, unknown> | undefined) {
  if (!userData) {
    return [];
  }

  const candidateTokens = Array.isArray(userData.expoPushTokens)
    ? userData.expoPushTokens
    : typeof userData.expoPushToken === "string"
      ? [userData.expoPushToken]
      : [];

  return candidateTokens
    .filter((token): token is string => typeof token === "string")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && isExpoPushToken(token));
}

export function queueNotificationWrite(
  batch: FirebaseFirestore.WriteBatch,
  queuedNotifications: AppNotificationInput[],
  input: AppNotificationInput
) {
  const notificationRef = db.collection("notifications").doc();
  batch.set(notificationRef, {
    ...input,
    read: false,
    createdAt: serverTimestamp(),
  });
  queuedNotifications.push(input);
}

export function queuePushNotification(
  queuedNotifications: AppNotificationInput[],
  input: AppNotificationInput
) {
  queuedNotifications.push(input);
}

export async function sendQueuedPushNotifications(
  queuedNotifications: AppNotificationInput[]
) {
  if (queuedNotifications.length === 0) {
    return;
  }

  try {
    const uniqueRecipientIds = [...new Set(queuedNotifications.map((item) => item.recipientUid))];
    const recipientSnapshots = await Promise.all(
      uniqueRecipientIds.map((recipientUid) => db.collection("users").doc(recipientUid).get())
    );
    const tokensByRecipientId = new Map<string, string[]>();

    recipientSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) {
        return;
      }

      tokensByRecipientId.set(snapshot.id, getExpoPushTokens(snapshot.data()));
    });

    const messages = queuedNotifications.flatMap((notification) => {
      const recipientTokens = tokensByRecipientId.get(notification.recipientUid) ?? [];

      return recipientTokens.map((to) => ({
        to,
        title: notification.title,
        body: notification.message,
        channelId: RESERVATION_UPDATES_CHANNEL_ID,
        data: {
          reservationId: notification.reservationId,
          route: notification.route ?? "/(main)/dashboard/inbox",
          type: notification.type,
        },
      }));
    });

    if (messages.length === 0) {
      return;
    }

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.warn("[push-notifications] Expo push request failed", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.warn("[push-notifications] unable to send Expo push notifications", error);
  }
}
