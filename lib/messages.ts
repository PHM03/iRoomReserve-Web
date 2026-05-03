import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/configs/firebase";
import { normalizeRole, USER_ROLES, type UserRole } from "@/lib/domain/roles";

/**
 * Roles that participate in the staff-to-staff messaging mesh.
 * Students intentionally cannot send or receive these messages – they have
 * their own "Messages with Administration" thread elsewhere in the inbox.
 */
const STAFF_ROLES: UserRole[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.UTILITY,
  USER_ROLES.FACULTY,
];

export const STAFF_ROLE_QUERY_VALUES = [
  ...STAFF_ROLES,
  // Legacy values that still exist in older user docs
  "Faculty",
  "Utility",
  "Admin",
  "Building Admin",
  "building admin",
  "building_admin",
];

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  receiverId: string;
  receiverName: string;
  receiverRole: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt?: Timestamp;
}

export interface MessageRecipient {
  uid: string;
  name: string;
  email: string;
  role: string;
}

export interface ComposeMessageInput {
  senderId: string;
  senderName: string;
  senderRole: string;
  receiverId: string;
  receiverName: string;
  receiverRole: string;
  subject: string;
  body: string;
}

export function isStaffRole(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  return normalized != null && STAFF_ROLES.includes(normalized);
}

export async function sendMessage(input: ComposeMessageInput): Promise<string> {
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (!subject) {
    throw new Error("Subject is required.");
  }
  if (!body) {
    throw new Error("Message body is required.");
  }
  if (!input.receiverId) {
    throw new Error("Pick a recipient before sending.");
  }
  if (input.senderId === input.receiverId) {
    throw new Error("You cannot send a message to yourself.");
  }

  const ref = await addDoc(collection(db, "messages"), {
    senderId: input.senderId,
    senderName: input.senderName,
    senderRole: input.senderRole,
    receiverId: input.receiverId,
    receiverName: input.receiverName,
    receiverRole: input.receiverRole,
    subject,
    body,
    isRead: false,
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

function mapMessage(snapshotDoc: {
  id: string;
  data: () => Record<string, unknown>;
}): Message {
  const data = snapshotDoc.data() as Partial<Message>;
  return {
    id: snapshotDoc.id,
    senderId: String(data.senderId ?? ""),
    senderName: String(data.senderName ?? "Unknown sender"),
    senderRole: String(data.senderRole ?? ""),
    receiverId: String(data.receiverId ?? ""),
    receiverName: String(data.receiverName ?? "Unknown recipient"),
    receiverRole: String(data.receiverRole ?? ""),
    subject: String(data.subject ?? ""),
    body: String(data.body ?? ""),
    isRead: Boolean(data.isRead),
    createdAt: data.createdAt as Timestamp | undefined,
  };
}

/**
 * Real-time inbox listener. Requires a composite index on
 * (receiverId asc, createdAt desc); Firestore will surface a console link the
 * first time the query runs in production if the index is missing.
 *
 * Important: this helper does NOT call `callback` synchronously on the
 * unsubscribed/empty path. Doing so previously caused setState-during-effect
 * cascades under React StrictMode that, combined with rapid re-subscribes,
 * triggered Firestore SDK assertion failures (IDs ca9 / b815). Consumers
 * should keep their existing state until the first real snapshot arrives.
 */
export function onInboxMessages(
  uid: string,
  callback: (messages: Message[]) => void
): Unsubscribe {
  if (!uid) {
    return () => {};
  }

  const inboxQuery = query(
    collection(db, "messages"),
    where("receiverId", "==", uid),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    inboxQuery,
    (snapshot) => callback(snapshot.docs.map(mapMessage)),
    (error) => {
      // Don't clobber state on transient errors (missing index, permission
      // hiccup during sign-out, network blip). Just log and let the next
      // successful snapshot replace the data.
      console.warn("Firestore listener error (inbox messages):", error);
    }
  );
}

/**
 * Real-time "Sent" folder listener. Requires a composite index on
 * (senderId asc, createdAt desc).
 */
export function onSentMessages(
  uid: string,
  callback: (messages: Message[]) => void
): Unsubscribe {
  if (!uid) {
    return () => {};
  }

  const sentQuery = query(
    collection(db, "messages"),
    where("senderId", "==", uid),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    sentQuery,
    (snapshot) => callback(snapshot.docs.map(mapMessage)),
    (error) => {
      console.warn("Firestore listener error (sent messages):", error);
    }
  );
}

export async function fetchInboxMessages(uid: string): Promise<Message[]> {
  if (!uid) return [];

  const snapshot = await getDocs(
    query(
      collection(db, "messages"),
      where("receiverId", "==", uid),
      orderBy("createdAt", "desc")
    )
  );
  return snapshot.docs.map(mapMessage);
}

export async function fetchSentMessages(uid: string): Promise<Message[]> {
  if (!uid) return [];

  const snapshot = await getDocs(
    query(
      collection(db, "messages"),
      where("senderId", "==", uid),
      orderBy("createdAt", "desc")
    )
  );
  return snapshot.docs.map(mapMessage);
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  await updateDoc(doc(db, "messages", messageId), {
    isRead: true
  });
}

/**
 * Returns staff members the current user is allowed to message. The Firestore
 * security rules also enforce that only staff-to-staff sends are accepted;
 * this query just keeps the dropdown clean and avoids non-staff accounts.
 */
export async function getStaffRecipients(
  excludeUid: string
): Promise<MessageRecipient[]> {
  const staffQuery = query(
    collection(db, "users"),
    where("role", "in", STAFF_ROLE_QUERY_VALUES)
  );

  const snapshot = await getDocs(staffQuery);

  return snapshot.docs
    .reduce<MessageRecipient[]>((acc, userDoc) => {
      const data = userDoc.data() as Record<string, unknown>;
      const status = String(data.status ?? "approved");
      if (userDoc.id === excludeUid || status === "disabled") {
        return acc;
      }

      const firstName = String(data.firstName ?? "").trim();
      const lastName = String(data.lastName ?? "").trim();
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      const email = String(data.email ?? "");
      const role = normalizeRole(String(data.role ?? "")) ?? String(data.role ?? "");

      acc.push({
        uid: userDoc.id,
        name: fullName || email || "Unknown user",
        email,
        role,
      });
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name));
}
