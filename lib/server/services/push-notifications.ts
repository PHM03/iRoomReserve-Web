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
const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const RESERVATION_UPDATES_CHANNEL_ID = "reservation-updates";
const APP_URL = "https://eroomreserve.vercel.app";

let hasWarnedAboutEmailConfiguration = false;

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
    const emailByRecipientId = new Map<string, string>();

    recipientSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) {
        return;
      }

      const userData = snapshot.data();
      tokensByRecipientId.set(snapshot.id, getExpoPushTokens(userData));

      const email = userData?.email;
      if (typeof email === "string" && email.trim().length > 0) {
        emailByRecipientId.set(snapshot.id, email.trim());
      }
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

    if (messages.length > 0) {
      try {
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
        // Email delivery should still be attempted if Expo is temporarily unavailable.
        console.warn("[push-notifications] unable to send Expo push notifications", error);
      }
    }

    await sendQueuedGmailNotifications(queuedNotifications, emailByRecipientId);
  } catch (error) {
    console.warn("[push-notifications] unable to send Expo push notifications", error);
  }
}

async function sendQueuedGmailNotifications(
  queuedNotifications: AppNotificationInput[],
  emailByRecipientId: Map<string, string>
) {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const senderEmail = process.env.GMAIL_SENDER_EMAIL?.trim();

  if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
    if (!hasWarnedAboutEmailConfiguration) {
      hasWarnedAboutEmailConfiguration = true;
      console.warn(
        "[notification-email] Email delivery is disabled. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL to enable it."
      );
    }
    return;
  }

  const accessToken = await getGmailAccessToken({
    clientId,
    clientSecret,
    refreshToken,
  });
  if (!accessToken) {
    return;
  }

  const emailRequests = queuedNotifications.flatMap((notification) => {
    const to = emailByRecipientId.get(notification.recipientUid);
    if (!to) {
      return [];
    }

    return [
      fetch(GMAIL_SEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: createGmailMessage({
            from: senderEmail,
            to,
            subject: notification.title,
            text: `${notification.message}\n\nVisit here: ${APP_URL}`,
          }),
        }),
      }).then((response) => {
        if (!response.ok) {
          console.warn("[notification-email] Gmail send request failed", {
            status: response.status,
            statusText: response.statusText,
          });
        }
      }),
    ];
  });

  const results = await Promise.allSettled(emailRequests);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn("[notification-email] unable to send Gmail notification", result.reason);
    }
  });
}

async function getGmailAccessToken({
  clientId,
  clientSecret,
  refreshToken,
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  try {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.warn("[notification-email] unable to refresh Gmail access token", {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const responseBody = (await response.json()) as { access_token?: unknown };
    return typeof responseBody.access_token === "string"
      ? responseBody.access_token
      : null;
  } catch (error) {
    console.warn("[notification-email] unable to refresh Gmail access token", error);
    return null;
  }
}

function createGmailMessage({
  from,
  to,
  subject,
  text,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const sanitizeHeader = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  const mimeMessage = [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(to)}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");

  return Buffer.from(mimeMessage).toString("base64url");
}
