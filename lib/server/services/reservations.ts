import "server-only";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import { normalizeRole } from "@/lib/domain/roles";
import {
  canReservationCheckIn,
  compareReservationSchedule,
  normalizeRoomStatus,
  type RoomCheckInMethod,
} from "@/lib/roomStatus";
import { ApiError } from "@/lib/server/api-error";
import { serverClientDb } from "@/lib/server/firebase-client";

type ReservationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

interface ReservationRecord {
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
  status: ReservationStatus;
  adminUid: string | null;
  recurringGroupId?: string;
  checkedInAt?: Timestamp | null;
  checkInMethod?: RoomCheckInMethod | null;
}

export interface ReservationCreateInput {
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
}

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDatesForDays(
  startDate: string,
  endDate: string,
  selectedDays: number[]
) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    if (selectedDays.includes(current.getDay())) {
      dates.push(getLocalDateString(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function getApprovedReservationsForRoom(roomId: string) {
  const reservationsSnapshot = await getDocs(
    query(
      collection(serverClientDb, "reservations"),
      where("roomId", "==", roomId),
      where("status", "==", "approved")
    )
  );

  return reservationsSnapshot.docs
    .map(
      (reservationDoc) =>
        ({
          id: reservationDoc.id,
          ...reservationDoc.data(),
        }) as ReservationRecord
    )
    .sort(compareReservationSchedule);
}

async function getBuildingManagerIds(buildingId: string) {
  const usersSnapshot = await getDocs(
    query(
      collection(serverClientDb, "users"),
      where("assignedBuildingId", "==", buildingId),
      where("status", "==", "approved")
    )
  );

  return usersSnapshot.docs.map((userDoc) => userDoc.id);
}

function getRoomStatusPayload(
  approvedReservations: ReservationRecord[],
  preferredReservationId?: string | null
) {
  if (approvedReservations.length === 0) {
    return {
      status: "Available",
      reservedBy: null,
      activeReservationId: null,
      checkedInAt: null,
      checkInMethod: null,
    } as const;
  }

  const checkedInReservation = approvedReservations.find((reservation) =>
    Boolean(reservation.checkedInAt)
  );
  const preferredReservation = preferredReservationId
    ? approvedReservations.find(
        (reservation) => reservation.id === preferredReservationId
      )
    : null;
  const selectedReservation =
    checkedInReservation ?? preferredReservation ?? approvedReservations[0];

  return {
    status: selectedReservation.checkedInAt ? "Ongoing" : "Reserved",
    reservedBy: selectedReservation.userId ?? null,
    activeReservationId: selectedReservation.id,
    checkedInAt: selectedReservation.checkedInAt ?? null,
    checkInMethod: selectedReservation.checkInMethod ?? null,
  } as const;
}

function addNotification(
  batch: ReturnType<typeof writeBatch>,
  input: {
    recipientUid: string;
    type:
      | "new_reservation"
      | "reservation_cancelled"
      | "reservation_approved"
      | "reservation_rejected"
      | "feedback"
      | "system";
    title: string;
    message: string;
    buildingId: string;
    reservationId: string;
  }
) {
  const notificationRef = doc(collection(serverClientDb, "notifications"));
  batch.set(notificationRef, {
    ...input,
    read: false,
    createdAt: serverTimestamp(),
  });
}

function addRoomHistory(
  batch: ReturnType<typeof writeBatch>,
  reservation: ReservationRecord,
  status: ReservationStatus
) {
  const roomHistoryRef = doc(collection(serverClientDb, "roomHistory"));
  batch.set(roomHistoryRef, {
    roomId: reservation.roomId,
    roomName: reservation.roomName,
    buildingId: reservation.buildingId,
    userName: reservation.userName,
    userRole: normalizeRole(reservation.userRole) ?? reservation.userRole,
    date: reservation.date,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    type: "reservation",
    purpose: reservation.purpose,
    sourceId: reservation.id,
    status,
    createdAt: serverTimestamp(),
  });
}

function formatEquipmentSummary(equipment?: Record<string, number>) {
  if (!equipment) {
    return "";
  }

  return Object.entries(equipment)
    .filter(([, quantity]) => quantity > 0)
    .map(([name, quantity]) => `${name} (x${quantity})`)
    .join(", ");
}

export async function createReservationRecord(data: ReservationCreateInput) {
  const managerIds = await getBuildingManagerIds(data.buildingId);
  const reservationRef = doc(collection(serverClientDb, "reservations"));
  const batch = writeBatch(serverClientDb);

  batch.set(reservationRef, {
    ...data,
    userRole: normalizeRole(data.userRole) ?? data.userRole,
    status: "pending",
    adminUid: managerIds[0] ?? null,
    checkedInAt: null,
    checkInMethod: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  managerIds.forEach((managerUid) => {
    addNotification(batch, {
      recipientUid: managerUid,
      type: "new_reservation",
      title: "New Reservation Request",
      message: `${data.userName} reserved ${data.roomName} on ${data.date} (${data.startTime} - ${data.endTime})`,
      buildingId: data.buildingId,
      reservationId: reservationRef.id,
    });
  });

  await batch.commit();
  return reservationRef.id;
}

export async function createRecurringReservationRecord(
  data: Omit<ReservationCreateInput, "date">,
  selectedDays: number[],
  startDate: string,
  endDate: string
) {
  const dates = getDatesForDays(startDate, endDate, selectedDays);
  if (dates.length === 0) {
    throw new ApiError(
      400,
      "invalid_dates",
      "No matching dates were found for the selected schedule."
    );
  }

  const managerIds = await getBuildingManagerIds(data.buildingId);
  const recurringGroupId = `recurring_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const batch = writeBatch(serverClientDb);
  const createdIds: string[] = [];

  dates.forEach((date) => {
    const reservationRef = doc(collection(serverClientDb, "reservations"));
    createdIds.push(reservationRef.id);
    batch.set(reservationRef, {
      ...data,
      date,
      userRole: normalizeRole(data.userRole) ?? data.userRole,
      status: "pending",
      adminUid: managerIds[0] ?? null,
      recurringGroupId,
      checkedInAt: null,
      checkInMethod: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const dayNames = selectedDays
    .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
    .join(", ");

  managerIds.forEach((managerUid) => {
    addNotification(batch, {
      recipientUid: managerUid,
      type: "new_reservation",
      title: "New Recurring Reservation",
      message: `${data.userName} reserved ${data.roomName} every ${dayNames} from ${startDate} to ${endDate} (${data.startTime} - ${data.endTime}) - ${dates.length} dates`,
      buildingId: data.buildingId,
      reservationId: createdIds[0],
    });
  });

  await batch.commit();
  return createdIds;
}

export async function approveReservationRecord(reservationId: string) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const reservationSnapshot = await getDoc(reservationRef);
  if (!reservationSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRecord;
  const approvedReservations = await getApprovedReservationsForRoom(
    reservation.roomId
  );
  const batch = writeBatch(serverClientDb);

  batch.update(reservationRef, {
    status: "approved",
    updatedAt: serverTimestamp(),
  });

  addNotification(batch, {
    recipientUid: reservation.userId,
    type: "reservation_approved",
    title: "Reservation Approved",
    message: `Your reservation for ${reservation.roomName} on ${reservation.date} has been approved.`,
    buildingId: reservation.buildingId,
    reservationId,
  });

  addRoomHistory(batch, reservation, "approved");

  const roomStatusPayload = getRoomStatusPayload(
    [
      ...approvedReservations.filter(
        (approvedReservation) => approvedReservation.id !== reservationId
      ),
      {
        ...reservation,
        status: "approved" as const,
      },
    ].sort(compareReservationSchedule),
    reservationId
  );

  batch.update(doc(serverClientDb, "rooms", reservation.roomId), {
    ...roomStatusPayload,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function rejectReservationRecord(reservationId: string) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const reservationSnapshot = await getDoc(reservationRef);
  if (!reservationSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRecord;
  const approvedReservations =
    reservation.status === "approved"
      ? await getApprovedReservationsForRoom(reservation.roomId)
      : [];
  const batch = writeBatch(serverClientDb);

  batch.update(reservationRef, {
    status: "rejected",
    updatedAt: serverTimestamp(),
  });

  addNotification(batch, {
    recipientUid: reservation.userId,
    type: "reservation_rejected",
    title: "Reservation Rejected",
    message: `Your reservation for ${reservation.roomName} on ${reservation.date} has been rejected.`,
    buildingId: reservation.buildingId,
    reservationId,
  });

  if (reservation.status === "approved") {
    batch.update(doc(serverClientDb, "rooms", reservation.roomId), {
      ...getRoomStatusPayload(
        approvedReservations.filter(
          (approvedReservation) => approvedReservation.id !== reservationId
        )
      ),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function cancelReservationRecord(
  reservationId: string,
  userId: string
) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const reservationSnapshot = await getDoc(reservationRef);
  if (!reservationSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRecord;
  if (reservation.userId !== userId) {
    throw new ApiError(403, "forbidden", "You cannot cancel this reservation.");
  }
  if (reservation.status !== "pending" && reservation.status !== "approved") {
    throw new ApiError(
      400,
      "invalid_status",
      "Only pending or approved reservations can be cancelled."
    );
  }

  const managerIds = await getBuildingManagerIds(reservation.buildingId);
  const approvedReservations =
    reservation.status === "approved"
      ? await getApprovedReservationsForRoom(reservation.roomId)
      : [];
  const batch = writeBatch(serverClientDb);

  batch.update(reservationRef, {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });

  managerIds.forEach((managerUid) => {
    addNotification(batch, {
      recipientUid: managerUid,
      type: "reservation_cancelled",
      title: "Reservation Cancelled",
      message: `${reservation.userName} cancelled their reservation for ${reservation.roomName} on ${reservation.date} (${reservation.startTime} - ${reservation.endTime})`,
      buildingId: reservation.buildingId,
      reservationId,
    });
  });

  if (reservation.status === "approved") {
    batch.update(doc(serverClientDb, "rooms", reservation.roomId), {
      ...getRoomStatusPayload(
        approvedReservations.filter(
          (approvedReservation) => approvedReservation.id !== reservationId
        )
      ),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function checkInReservationRecord(
  reservationId: string,
  userId: string,
  method: RoomCheckInMethod = "manual"
) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const reservationSnapshot = await getDoc(reservationRef);
  if (!reservationSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRecord;
  if (reservation.userId !== userId) {
    throw new ApiError(403, "forbidden", "You cannot check in for this reservation.");
  }
  if (!canReservationCheckIn(reservation)) {
    throw new ApiError(
      400,
      "invalid_check_in",
      "Check-in is only available for today's approved reservations."
    );
  }

  const roomRef = doc(serverClientDb, "rooms", reservation.roomId);
  const roomSnapshot = await getDoc(roomRef);
  if (!roomSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Room not found.");
  }

  const roomStatus = normalizeRoomStatus(
    (roomSnapshot.data() as { status?: string | null }).status
  );
  if (roomStatus === "Unavailable") {
    throw new ApiError(
      400,
      "room_unavailable",
      "This room is currently unavailable for check-in."
    );
  }

  const managerIds = await getBuildingManagerIds(reservation.buildingId);
  const batch = writeBatch(serverClientDb);

  batch.update(reservationRef, {
    checkedInAt: serverTimestamp(),
    checkInMethod: method,
    updatedAt: serverTimestamp(),
  });

  batch.update(roomRef, {
    status: "Ongoing",
    reservedBy: reservation.userId,
    activeReservationId: reservationId,
    checkedInAt: serverTimestamp(),
    checkInMethod: method,
    updatedAt: serverTimestamp(),
  });

  managerIds.forEach((managerUid) => {
    addNotification(batch, {
      recipientUid: managerUid,
      type: "system",
      title: "Room Checked In",
      message: `${reservation.userName} checked in to ${reservation.roomName} on ${reservation.date} (${reservation.startTime} - ${reservation.endTime}).`,
      buildingId: reservation.buildingId,
      reservationId,
    });
  });

  await batch.commit();
}

export async function completeReservationRecord(
  reservationId: string,
  userId: string
) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const reservationSnapshot = await getDoc(reservationRef);
  if (!reservationSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRecord;
  if (reservation.userId !== userId) {
    throw new ApiError(403, "forbidden", "You cannot complete this reservation.");
  }
  if (reservation.status !== "approved") {
    throw new ApiError(
      400,
      "invalid_status",
      "Only approved reservations can be marked as completed."
    );
  }

  const managerIds = await getBuildingManagerIds(reservation.buildingId);
  const approvedReservations = await getApprovedReservationsForRoom(
    reservation.roomId
  );
  const batch = writeBatch(serverClientDb);

  batch.update(reservationRef, {
    status: "completed",
    updatedAt: serverTimestamp(),
  });

  managerIds.forEach((managerUid) => {
    addNotification(batch, {
      recipientUid: managerUid,
      type: "system",
      title: "Reservation Completed",
      message: `${reservation.userName} marked their reservation for ${reservation.roomName} on ${reservation.date} as completed.`,
      buildingId: reservation.buildingId,
      reservationId,
    });
  });

  addRoomHistory(batch, reservation, "completed");

  batch.update(doc(serverClientDb, "rooms", reservation.roomId), {
    ...getRoomStatusPayload(
      approvedReservations.filter(
        (approvedReservation) => approvedReservation.id !== reservationId
      )
    ),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function deleteReservationRecord(
  reservationId: string,
  userId: string
) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const reservationSnapshot = await getDoc(reservationRef);
  if (!reservationSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const reservation = {
    id: reservationSnapshot.id,
    ...reservationSnapshot.data(),
  } as ReservationRecord;
  if (reservation.userId !== userId) {
    throw new ApiError(403, "forbidden", "You cannot delete this reservation.");
  }

  const approvedReservations =
    reservation.status === "approved"
      ? await getApprovedReservationsForRoom(reservation.roomId)
      : [];
  const batch = writeBatch(serverClientDb);

  batch.delete(reservationRef);

  if (reservation.status === "approved") {
    batch.update(doc(serverClientDb, "rooms", reservation.roomId), {
      ...getRoomStatusPayload(
        approvedReservations.filter(
          (approvedReservation) => approvedReservation.id !== reservationId
        )
      ),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export function buildReservationSummary(reservation: ReservationRecord) {
  const equipmentSummary = formatEquipmentSummary(reservation.equipment);
  const details = [
    reservation.purpose,
    equipmentSummary,
    reservation.endorsedByEmail
      ? `Endorsed by ${reservation.endorsedByEmail}`
      : "",
  ].filter(Boolean);

  return details.join(" | ");
}
