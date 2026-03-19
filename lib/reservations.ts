import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { createNotification } from "./notifications";
import { addRoomHistoryEntry } from "./roomHistory";

// ─── Types ──────────────────────────────────────────────────────
export interface Reservation {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  equipment?: Record<string, number>;
  endorsedByEmail?: string;
  status: "pending" | "approved" | "rejected" | "completed";
  adminUid: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ReservationInput = Omit<Reservation, "id" | "status" | "adminUid" | "createdAt" | "updatedAt">;

// ─── Create Reservation ─────────────────────────────────────────
export async function createReservation(
  data: ReservationInput
): Promise<string> {
  // 1. Find ALL admins/staff assigned to this building
  const adminsQuery = query(
    collection(db, "users"),
    where("assignedBuildingId", "==", data.buildingId),
    where("status", "==", "approved")
  );
  const adminsSnap = await getDocs(adminsQuery);
  const adminUids = adminsSnap.docs.map((d) => d.id);

  // 2. Create the reservation document
  const docRef = await addDoc(collection(db, "reservations"), {
    ...data,
    status: "pending",
    adminUid: adminUids[0] || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 3. Notify ALL assigned admins/staff for this building
  for (const uid of adminUids) {
    await createNotification({
      recipientUid: uid,
      type: "new_reservation",
      title: "New Reservation Request",
      message: `${data.userName} reserved ${data.roomName} on ${data.date} (${data.startTime} – ${data.endTime})`,
      buildingId: data.buildingId,
      reservationId: docRef.id,
    });
  }

  return docRef.id;
}

// ─── Real-time Pending Reservations by Building ─────────────────
export function onPendingReservationsByBuilding(
  buildingId: string,
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "reservations"),
    where("buildingId", "==", buildingId),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const reservations: Reservation[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Reservation));
    callback(reservations);
  }, (error) => {
    console.warn('Firestore listener error (pending reservations):', error);
  });
}

// ─── Real-time All Reservations by Building ─────────────────────
export function onReservationsByBuilding(
  buildingId: string,
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "reservations"),
    where("buildingId", "==", buildingId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const reservations: Reservation[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Reservation));
    callback(reservations);
  }, (error) => {
    console.warn('Firestore listener error (reservations by building):', error);
  });
}

// ─── Real-time Reservations by User ─────────────────────────────
export function onReservationsByUser(
  userId: string,
  callback: (reservations: Reservation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "reservations"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const reservations: Reservation[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Reservation));
    callback(reservations);
  }, (error) => {
    console.warn('Firestore listener error (reservations by user):', error);
  });
}

// ─── Approve Reservation ────────────────────────────────────────
export async function approveReservation(
  reservationId: string
): Promise<void> {
  const reservationRef = doc(db, "reservations", reservationId);
  const snap = await getDoc(reservationRef);

  await updateDoc(reservationRef, {
    status: "approved",
    updatedAt: serverTimestamp(),
  });

  // Notify the student
  if (snap.exists()) {
    const data = snap.data();
    await createNotification({
      recipientUid: data.userId,
      type: "reservation_approved",
      title: "Reservation Approved",
      message: `Your reservation for ${data.roomName} on ${data.date} has been approved.`,
      buildingId: data.buildingId,
      reservationId,
    });

    // Log to room history
    await addRoomHistoryEntry({
      roomId: data.roomId,
      roomName: data.roomName,
      buildingId: data.buildingId,
      userName: data.userName,
      userRole: data.userRole || "Student",
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      type: "reservation",
      purpose: data.purpose,
      sourceId: reservationId,
      status: "approved",
    });
  }
}

// ─── Reject Reservation ─────────────────────────────────────────
export async function rejectReservation(
  reservationId: string
): Promise<void> {
  const reservationRef = doc(db, "reservations", reservationId);
  const snap = await getDoc(reservationRef);

  await updateDoc(reservationRef, {
    status: "rejected",
    updatedAt: serverTimestamp(),
  });

  // Notify the student
  if (snap.exists()) {
    const data = snap.data();
    await createNotification({
      recipientUid: data.userId,
      type: "reservation_rejected",
      title: "Reservation Rejected",
      message: `Your reservation for ${data.roomName} on ${data.date} has been rejected.`,
      buildingId: data.buildingId,
      reservationId,
    });
  }
}
