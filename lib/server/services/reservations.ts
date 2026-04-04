import "server-only";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  inferCampusFromBuilding,
  normalizeCampus,
  type ReservationCampus,
} from "@/lib/campuses";
import { normalizeRole, USER_ROLES } from "@/lib/domain/roles";
import {
  buildApprovalFlow,
  getCurrentApprovalStep,
  getNextApprovalStep,
  isCurrentApproverEmail,
  normalizeApprovalEmail,
  type DigiReservationApproverInput,
  type MainReservationApproverInput,
  type ReservationApprovalRecord,
  type ReservationApprovalStep,
  type ReservationApproverInput,
} from "@/lib/reservation-approval";
import {
  canReservationCheckIn,
  compareReservationSchedule,
  normalizeRoomCheckInMethod,
  normalizeRoomStatus,
  type RoomCheckInMethod,
} from "@/lib/roomStatus";
import { ApiError } from "@/lib/server/api-error";
import { serverClientDb } from "@/lib/server/firebase-client";
import { getAssignedManagerIds } from "@/lib/server/services/building-managers";

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
  campus: ReservationCampus;
  date: string;
  startTime: string;
  endTime: string;
  programDepartmentOrganization?: string;
  purpose: string;
  approvalDocumentName?: string;
  approvalDocumentUrl?: string;
  equipment?: Record<string, number>;
  approvalFlow: ReservationApprovalStep[];
  currentStep: number;
  approvals: ReservationApprovalRecord[];
  rejectedBy?: string;
  reason?: string;
  status: ReservationStatus;
  adminUid: string | null;
  recurringGroupId?: string;
  checkedInAt?: Timestamp | null;
  checkInMethod?: RoomCheckInMethod | null;
}

interface ReservationCreateBaseInput {
  userId: string;
  userName: string;
  userRole: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  campus: ReservationCampus;
  date: string;
  startTime: string;
  endTime: string;
  programDepartmentOrganization: string;
  purpose: string;
  approvalDocumentName?: string;
  approvalDocumentUrl?: string;
  equipment?: Record<string, number>;
}

export type ReservationCreateInput =
  | (ReservationCreateBaseInput & DigiReservationApproverInput)
  | (ReservationCreateBaseInput & MainReservationApproverInput);

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
  return getAssignedManagerIds(buildingId);
}

async function getUserIdsByEmail(email: string) {
  const usersSnapshot = await getDocs(
    query(
      collection(serverClientDb, "users"),
      where("email", "==", normalizeApprovalEmail(email)),
      where("status", "==", "approved")
    )
  );

  return usersSnapshot.docs.map((userDoc) => userDoc.id);
}

async function getApprovedUsersByEmail(email: string) {
  const usersSnapshot = await getDocs(
    query(
      collection(serverClientDb, "users"),
      where("email", "==", normalizeApprovalEmail(email)),
      where("status", "==", "approved")
    )
  );

  return usersSnapshot.docs.map((userDoc) => ({
    id: userDoc.id,
    role: normalizeRole(
      (userDoc.data() as { role?: string | null }).role ?? null
    ),
  }));
}

export async function validateReservationApprover(input: {
  campus: ReservationCampus;
  email: string;
}) {
  const normalizedEmail = normalizeApprovalEmail(input.email);
  const approvedUsers = await getApprovedUsersByEmail(normalizedEmail);

  if (approvedUsers.length === 0) {
    throw new ApiError(
      400,
      "approver_not_found",
      input.campus === "main"
        ? "The adviser, department head, or professor email must belong to an approved iRoomReserve faculty account."
        : "The Digital Campus building admin email must belong to an approved iRoomReserve account."
    );
  }

  if (
    input.campus === "main" &&
    !approvedUsers.some((user) => user.role === USER_ROLES.FACULTY)
  ) {
    throw new ApiError(
      400,
      "invalid_approver_role",
      "The adviser, department head, or professor email must belong to an approved faculty iRoomReserve account."
    );
  }

  return {
    email: normalizedEmail,
    matchedUserIds: approvedUsers.map((user) => user.id),
  };
}

async function getBuildingCampus(buildingId: string) {
  const buildingSnapshot = await getDoc(doc(serverClientDb, "buildings", buildingId));
  if (!buildingSnapshot.exists()) {
    return null;
  }

  const buildingData = buildingSnapshot.data() as {
    campus?: string | null;
    code?: string | null;
    name?: string | null;
  };

  return inferCampusFromBuilding({
    id: buildingId,
    campus: buildingData.campus,
    code: buildingData.code,
    name: buildingData.name,
  });
}

async function resolveReservationCampus(input: {
  buildingId: string;
  buildingName: string;
  campus: ReservationCampus;
}) {
  const campusFromBuilding = await getBuildingCampus(input.buildingId);
  const normalizedInputCampus = normalizeCampus(input.campus);

  if (campusFromBuilding && normalizedInputCampus && campusFromBuilding !== normalizedInputCampus) {
    throw new ApiError(
      400,
      "invalid_campus",
      "Reservation campus does not match the selected building."
    );
  }

  return (
    campusFromBuilding ??
    normalizedInputCampus ??
    inferCampusFromBuilding({
      id: input.buildingId,
      name: input.buildingName,
    }) ??
    "main"
  );
}

function getReservationApproverInput(
  input: ReservationCreateInput | Omit<ReservationCreateInput, "date">,
  campus: ReservationCampus
): ReservationApproverInput {
  if (campus === "digi") {
    if (!("buildingAdminEmail" in input)) {
      throw new ApiError(
        400,
        "missing_approvers",
        "Digital Campus reservations require a building admin email."
      );
    }

    return {
      campus,
      buildingAdminEmail: input.buildingAdminEmail,
    };
  }

  if (
    !("advisorEmail" in input)
  ) {
    throw new ApiError(
      400,
      "missing_approvers",
      "Main Campus reservations require an adviser, department head, or professor email."
    );
  }

  return {
    campus,
    advisorEmail: input.advisorEmail,
  };
}

async function getInitialApproverIdsOrThrow(
  approvalFlow: ReservationApprovalStep[],
  campus: ReservationCampus
) {
  const firstApprovalStep = getCurrentApprovalStep(approvalFlow, 0);
  if (!firstApprovalStep) {
    throw new ApiError(
      400,
      "invalid_approval_flow",
      "Reservation approval flow is incomplete."
    );
  }

  const validation = await validateReservationApprover({
    campus,
    email: firstApprovalStep.email,
  });

  return {
    firstApprovalStep,
    firstApproverIds: validation.matchedUserIds,
  };
}

function assertReservationPendingApproval(reservation: ReservationRecord) {
  if (reservation.status !== "pending") {
    throw new ApiError(
      400,
      "invalid_status",
      "Only pending reservations can be reviewed."
    );
  }
}

function getReservationCurrentApprovalStep(reservation: ReservationRecord) {
  const currentApprovalStep = getCurrentApprovalStep(
    reservation.approvalFlow,
    reservation.currentStep
  );

  if (!currentApprovalStep) {
    throw new ApiError(
      400,
      "invalid_approval_flow",
      "Reservation approval flow is incomplete or already finished."
    );
  }

  return currentApprovalStep;
}

function getRoomStatusPayload(
  approvedReservations: ReservationRecord[],
  preferredReservationId?: string | null
) {
  if (approvedReservations.length === 0) {
    return {
      status: "Available",
      beaconConnected: false,
      beaconDeviceName: null,
      beaconLastConnectedAt: null,
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
  const selectedCheckInMethod = normalizeRoomCheckInMethod(
    selectedReservation.checkInMethod
  );

  return {
    status: selectedReservation.checkedInAt ? "Ongoing" : "Reserved",
    beaconConnected:
      Boolean(selectedReservation.checkedInAt) &&
      selectedCheckInMethod === "bluetooth",
    beaconDeviceName: null,
    beaconLastConnectedAt:
      selectedCheckInMethod === "bluetooth"
        ? selectedReservation.checkedInAt ?? null
        : null,
    reservedBy: selectedReservation.userId ?? null,
    activeReservationId: selectedReservation.id,
    checkedInAt: selectedReservation.checkedInAt ?? null,
    checkInMethod: selectedCheckInMethod ?? null,
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
  const campus = await resolveReservationCampus(data);
  const approvalFlow = buildApprovalFlow(
    getReservationApproverInput(data, campus)
  );
  const { firstApprovalStep, firstApproverIds } =
    await getInitialApproverIdsOrThrow(approvalFlow, campus);
  const reservationRef = doc(collection(serverClientDb, "reservations"));
  const batch = writeBatch(serverClientDb);

  batch.set(reservationRef, {
    userId: data.userId,
    userName: data.userName,
    userRole: normalizeRole(data.userRole) ?? data.userRole,
    roomId: data.roomId,
    roomName: data.roomName,
    buildingId: data.buildingId,
    buildingName: data.buildingName,
    campus,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    programDepartmentOrganization: data.programDepartmentOrganization,
    purpose: data.purpose,
    ...(data.approvalDocumentName
      ? { approvalDocumentName: data.approvalDocumentName }
      : {}),
    ...(data.approvalDocumentUrl ? { approvalDocumentUrl: data.approvalDocumentUrl } : {}),
    ...(data.equipment ? { equipment: data.equipment } : {}),
    approvalFlow,
    currentStep: 0,
    approvals: [],
    status: "pending",
    adminUid: null,
    checkedInAt: null,
    checkInMethod: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  firstApproverIds.forEach((recipientUid) => {
    addNotification(batch, {
      recipientUid,
      type: "new_reservation",
      title: "New Reservation Request",
      message: `${data.userName} reserved ${data.roomName} on ${data.date} (${data.startTime} - ${data.endTime}). Review is requested for the ${firstApprovalStep?.role ?? "current"} step.`,
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

  const campus = await resolveReservationCampus(data);
  const approvalFlow = buildApprovalFlow(
    getReservationApproverInput(data, campus)
  );
  const { firstApprovalStep, firstApproverIds } =
    await getInitialApproverIdsOrThrow(approvalFlow, campus);
  const recurringGroupId = `recurring_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const batch = writeBatch(serverClientDb);
  const createdIds: string[] = [];

  dates.forEach((date) => {
    const reservationRef = doc(collection(serverClientDb, "reservations"));
    createdIds.push(reservationRef.id);
    batch.set(reservationRef, {
      userId: data.userId,
      userName: data.userName,
      date,
      userRole: normalizeRole(data.userRole) ?? data.userRole,
      roomId: data.roomId,
      roomName: data.roomName,
      buildingId: data.buildingId,
      buildingName: data.buildingName,
      campus,
      startTime: data.startTime,
      endTime: data.endTime,
      programDepartmentOrganization: data.programDepartmentOrganization,
      purpose: data.purpose,
      ...(data.approvalDocumentName
        ? { approvalDocumentName: data.approvalDocumentName }
        : {}),
      ...(data.approvalDocumentUrl ? { approvalDocumentUrl: data.approvalDocumentUrl } : {}),
      ...(data.equipment ? { equipment: data.equipment } : {}),
      approvalFlow,
      currentStep: 0,
      approvals: [],
      status: "pending",
      adminUid: null,
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

  firstApproverIds.forEach((recipientUid) => {
    addNotification(batch, {
      recipientUid,
      type: "new_reservation",
      title: "New Recurring Reservation",
      message: `${data.userName} reserved ${data.roomName} every ${dayNames} from ${startDate} to ${endDate} (${data.startTime} - ${data.endTime}) - ${dates.length} dates. Review is requested for the ${firstApprovalStep?.role ?? "current"} step.`,
      buildingId: data.buildingId,
      reservationId: createdIds[0],
    });
  });

  await batch.commit();
  return createdIds;
}

export async function approveReservationRecord(
  reservationId: string,
  userEmail: string
) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const approvalResult = await runTransaction(
    serverClientDb,
    async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists()) {
        throw new ApiError(404, "not_found", "Reservation not found.");
      }

      const reservation = {
        id: reservationSnapshot.id,
        ...reservationSnapshot.data(),
      } as ReservationRecord;

      assertReservationPendingApproval(reservation);

      const currentApprovalStep = getReservationCurrentApprovalStep(reservation);
      if (!isCurrentApproverEmail(currentApprovalStep, userEmail)) {
        throw new ApiError(
          403,
          "forbidden",
          "You are not the current approver for this reservation."
        );
      }

      const nextStepIndex = reservation.currentStep + 1;
      const isFinalApproval = nextStepIndex >= reservation.approvalFlow.length;
      const approvalEntry: ReservationApprovalRecord = {
        role: currentApprovalStep.role,
        email: currentApprovalStep.email,
        date: Timestamp.now(),
        status: "approved",
      };

      transaction.update(reservationRef, {
        approvals: [...(reservation.approvals ?? []), approvalEntry],
        currentStep: nextStepIndex,
        status: isFinalApproval ? "approved" : "pending",
        updatedAt: serverTimestamp(),
      });

      return {
        reservation,
        currentApprovalStep,
        nextApprovalStep: getNextApprovalStep(
          reservation.approvalFlow,
          reservation.currentStep
        ),
        isFinalApproval,
      };
    }
  );

  if (!approvalResult.isFinalApproval) {
    const nextApproverIds = approvalResult.nextApprovalStep
      ? await getUserIdsByEmail(approvalResult.nextApprovalStep.email)
      : [];

    if (nextApproverIds.length === 0) {
      return;
    }

    const batch = writeBatch(serverClientDb);
    nextApproverIds.forEach((recipientUid) => {
      addNotification(batch, {
        recipientUid,
        type: "new_reservation",
        title: "Reservation Approval Required",
        message: `${approvalResult.reservation.userName} reserved ${approvalResult.reservation.roomName} on ${approvalResult.reservation.date} (${approvalResult.reservation.startTime} - ${approvalResult.reservation.endTime}). Your ${approvalResult.nextApprovalStep?.role ?? "next"} approval is required.`,
        buildingId: approvalResult.reservation.buildingId,
        reservationId,
      });
    });

    await batch.commit();
    return;
  }

  const approvedReservations = await getApprovedReservationsForRoom(
    approvalResult.reservation.roomId
  );
  const batch = writeBatch(serverClientDb);

  addNotification(batch, {
    recipientUid: approvalResult.reservation.userId,
    type: "reservation_approved",
    title: "Reservation Approved",
    message: `Your reservation for ${approvalResult.reservation.roomName} on ${approvalResult.reservation.date} has been fully approved.`,
    buildingId: approvalResult.reservation.buildingId,
    reservationId,
  });

  addRoomHistory(batch, approvalResult.reservation, "approved");

  batch.update(doc(serverClientDb, "rooms", approvalResult.reservation.roomId), {
    ...getRoomStatusPayload(approvedReservations, reservationId),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function rejectReservationRecord(
  reservationId: string,
  userEmail: string,
  reason: string
) {
  const reservationRef = doc(serverClientDb, "reservations", reservationId);
  const rejectionResult = await runTransaction(
    serverClientDb,
    async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists()) {
        throw new ApiError(404, "not_found", "Reservation not found.");
      }

      const reservation = {
        id: reservationSnapshot.id,
        ...reservationSnapshot.data(),
      } as ReservationRecord;

      assertReservationPendingApproval(reservation);

      const currentApprovalStep = getReservationCurrentApprovalStep(reservation);
      if (!isCurrentApproverEmail(currentApprovalStep, userEmail)) {
        throw new ApiError(
          403,
          "forbidden",
          "You are not the current approver for this reservation."
        );
      }

      transaction.update(reservationRef, {
        status: "rejected",
        rejectedBy: normalizeApprovalEmail(userEmail),
        reason: reason.trim(),
        updatedAt: serverTimestamp(),
      });

      return {
        reservation,
        currentApprovalStep,
      };
    }
  );

  const batch = writeBatch(serverClientDb);

  addNotification(batch, {
    recipientUid: rejectionResult.reservation.userId,
    type: "reservation_rejected",
    title: "Reservation Rejected",
    message: `Your reservation for ${rejectionResult.reservation.roomName} on ${rejectionResult.reservation.date} was rejected during the ${rejectionResult.currentApprovalStep.role} step. Reason: ${reason.trim()}`,
    buildingId: rejectionResult.reservation.buildingId,
    reservationId,
  });

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
  const normalizedMethod = normalizeRoomCheckInMethod(method) ?? "manual";
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
  const roomData = roomSnapshot.data() as {
    beaconId?: string | null;
    bleBeaconId?: string | null;
  };
  const roomBeaconId =
    typeof roomData.bleBeaconId === "string" && roomData.bleBeaconId.trim().length > 0
      ? roomData.bleBeaconId.trim()
      : typeof roomData.beaconId === "string" && roomData.beaconId.trim().length > 0
        ? roomData.beaconId.trim()
        : "";
  if (roomStatus === "Unavailable") {
    throw new ApiError(
      400,
      "room_unavailable",
      "This room is currently unavailable for check-in."
    );
  }
  if (normalizedMethod === "bluetooth" && roomBeaconId.length === 0) {
    throw new ApiError(
      400,
      "missing_beacon",
      "This room does not have a Bluetooth beacon configured yet."
    );
  }

  const managerIds = await getBuildingManagerIds(reservation.buildingId);
  const batch = writeBatch(serverClientDb);

  batch.update(reservationRef, {
    checkedInAt: serverTimestamp(),
    checkInMethod: normalizedMethod,
    updatedAt: serverTimestamp(),
  });

  batch.update(roomRef, {
    status: "Ongoing",
    beaconConnected: normalizedMethod === "bluetooth",
    beaconDeviceName:
      normalizedMethod === "bluetooth" ? roomBeaconId : null,
    beaconLastConnectedAt:
      normalizedMethod === "bluetooth" ? serverTimestamp() : null,
    beaconLastDisconnectedAt: null,
    reservedBy: reservation.userId,
    activeReservationId: reservationId,
    checkedInAt: serverTimestamp(),
    checkInMethod: normalizedMethod,
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

export async function disconnectReservationBeaconRecord(
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
    throw new ApiError(
      403,
      "forbidden",
      "You cannot update Bluetooth for this reservation."
    );
  }
  if (reservation.status !== "approved") {
    return;
  }

  const roomRef = doc(serverClientDb, "rooms", reservation.roomId);
  const roomSnapshot = await getDoc(roomRef);
  if (!roomSnapshot.exists()) {
    throw new ApiError(404, "not_found", "Room not found.");
  }

  const roomData = roomSnapshot.data() as {
    activeReservationId?: string | null;
    beaconConnected?: boolean | null;
    checkInMethod?: string | null;
  };
  const roomCheckInMethod = normalizeRoomCheckInMethod(roomData.checkInMethod);
  const shouldResetRoom =
    roomData.activeReservationId === reservationId ||
    roomData.beaconConnected === true ||
    roomCheckInMethod === "bluetooth";

  const batch = writeBatch(serverClientDb);

  batch.update(reservationRef, {
    checkedInAt: null,
    checkInMethod: null,
    updatedAt: serverTimestamp(),
  });

  if (shouldResetRoom) {
    batch.update(roomRef, {
      status: "Available",
      beaconConnected: false,
      beaconDeviceName: null,
      beaconLastDisconnectedAt: serverTimestamp(),
      reservedBy: null,
      activeReservationId: null,
      checkedInAt: null,
      checkInMethod: null,
      updatedAt: serverTimestamp(),
    });
  }

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
  const details = [reservation.purpose, equipmentSummary].filter(Boolean);

  return details.join(" | ");
}
