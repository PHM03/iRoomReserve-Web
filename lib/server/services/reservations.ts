import "server-only";

import { db, serverTimestamp, Timestamp } from "@/lib/firebase/firebase-admin";
import {
  inferCampusFromBuilding,
  normalizeCampus,
  type ReservationCampus,
} from "@/lib/buildings/campuses";
import { formatTimeRange } from "../../utils/dateTime";
import { normalizeRole, USER_ROLES } from "@/lib/auth/roles";
import type { FirestoreTimestampLike } from "@/lib/types/firestore-types";
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
} from "@/lib/reservations/reservation-approval";
import {
  canReservationCheckIn,
  compareReservationSchedule,
  normalizeRoomCheckInMethod,
  normalizeRoomStatus,
  type RoomCheckInMethod,
} from "@/lib/rooms/roomStatus";
import type { Schedule } from "@/lib/schedules/schedules";
import { ApiError } from "@/lib/server/api-error";
import { getAssignedManagerIds } from "@/lib/server/services/building-managers";
import {
  queuePushNotification,
  queueNotificationWrite,
  sendQueuedPushNotifications,
  type AppNotificationInput,
} from "@/lib/server/services/push-notifications";
import { syncReservationStatuses } from "@/lib/server/services/reservation-status-sync";

type ReservationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";
type ReservationPresenceAppState = "background" | "foreground";
type ReservationPresenceStatus =
  | "healthy"
  | "stopped"
  | "timed_out"
  | "warning";

const PRESENCE_HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

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
  dcSpaceEventId?: string | null;
  startTime: string;
  endTime: string;
  programDepartmentOrganization?: string;
  purpose: string;
  isEvent?: "Yes" | "No";
  approvalDocumentName?: string;
  approvalDocumentUrl?: string;
  approvalDocumentPath?: string;
  approvalDocumentMimeType?: string;
  approvalDocumentSize?: number;
  equipment?: Record<string, number>;
  otherEquipment?: string;
  approvalFlow: ReservationApprovalStep[];
  currentStep: number;
  approvals: ReservationApprovalRecord[];
  rejectedBy?: string;
  reason?: string;
  status: ReservationStatus;
  adminUid: string | null;
  recurringGroupId?: string;
  checkedInAt?: FirestoreTimestampLike | null;
  completedAt?: FirestoreTimestampLike | null;
  occupancyReleasedAt?: FirestoreTimestampLike | null;
  occupancyReleasedByUid?: string | null;
  checkInMethod?: RoomCheckInMethod | null;
  presenceMonitorBeaconId?: string | null;
  presenceMonitoringStartedAt?: FirestoreTimestampLike | null;
  presenceLastHeartbeatAt?: FirestoreTimestampLike | null;
  presenceLastHeartbeatClientAt?: string | null;
  presenceLastAppState?: ReservationPresenceAppState | null;
  presenceLastBluetoothOn?: boolean | null;
  presenceLastInRange?: boolean | null;
  presenceLastRssi?: number | null;
  presenceStatus?: ReservationPresenceStatus | null;
  createdAt?: FirestoreTimestampLike;
  updatedAt?: FirestoreTimestampLike;
}

interface ReservationCreateBaseInput {
  dcSpaceEventId?: string;
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
  isEvent: "Yes" | "No";
  approvalDocumentName?: string;
  approvalDocumentUrl?: string;
  approvalDocumentPath?: string;
  approvalDocumentMimeType?: string;
  approvalDocumentSize?: number;
  equipment?: Record<string, number>;
  otherEquipment?: string;
}

function formatReservationScheduleLabel(input: {
  date: string;
  startTime: string;
  endTime: string;
}) {
  return `${formatNotificationDate(input.date)} (${formatTimeRange(
    input.startTime,
    input.endTime
  )})`;
}

function formatNotificationDate(dateString: string) {
  const trimmedValue = dateString.trim();
  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const parsedDate = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );

    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(parsedDate);
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return trimmedValue;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

export type ReservationCreateInput =
  | (ReservationCreateBaseInput & DigiReservationApproverInput)
  | (ReservationCreateBaseInput & MainReservationApproverInput);

type FirestoreBatch = ReturnType<(typeof db)["batch"]>;

function logReservationServiceError(
  operation: string,
  error: unknown,
  metadata?: Record<string, unknown>
) {
  const errorWithCode =
    error instanceof Error ? (error as Error & { code?: unknown }) : null;

  console.error(`[reservations] ${operation} failed`, {
    ...metadata,
    error,
    message: error instanceof Error ? error.message : String(error),
    code: errorWithCode?.code,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

function getLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeStringToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function slotsOverlap(
  left: { startTime: string; endTime: string },
  right: { startTime: string; endTime: string }
) {
  return (
    timeStringToMinutes(left.startTime) < timeStringToMinutes(right.endTime) &&
    timeStringToMinutes(left.endTime) > timeStringToMinutes(right.startTime)
  );
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
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && selectedDays.includes(dayOfWeek)) {
      dates.push(getLocalDateString(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function getApprovedReservationsForRoom(roomId: string) {
  const reservationsSnapshot = await db
    .collection("reservations")
    .where("roomId", "==", roomId)
    .where("status", "==", "approved")
    .get();

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

async function getActiveReservationsForRoom(roomId: string) {
  const reservationsSnapshot = await db
    .collection("reservations")
    .where("roomId", "==", roomId)
    .where("status", "in", ["pending", "approved"])
    .get();

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

async function getActiveReservationsForUser(userId: string) {
  const reservationsSnapshot = await db
    .collection("reservations")
    .where("userId", "==", userId)
    .where("status", "in", ["pending", "approved"])
    .get();

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

async function getSchedulesForRoom(roomId: string): Promise<Schedule[]> {
  const schedulesSnapshot = await db
    .collection("schedules")
    .where("roomId", "==", roomId)
    .get();

  return schedulesSnapshot.docs.map(
    (scheduleDoc) =>
      ({
        id: scheduleDoc.id,
        ...scheduleDoc.data(),
      }) as Schedule
  );
}

async function assertReservationDatesAvailable(
  input: Omit<ReservationCreateInput, "date"> & { date?: string },
  dateKeys: string[]
) {
  if (dateKeys.length === 0) {
    throw new ApiError(
      400,
      "invalid_dates",
      "No matching dates were found for the selected schedule."
    );
  }

  const requestSlot = {
    endTime: input.endTime,
    startTime: input.startTime,
  };
  const [roomSchedules, roomReservations, userReservations] = await Promise.all([
    getSchedulesForRoom(input.roomId),
    getActiveReservationsForRoom(input.roomId),
    getActiveReservationsForUser(input.userId),
  ]);

  for (const dateKey of dateKeys) {
    const date = new Date(`${dateKey}T00:00:00`);
    const dayOfWeek = date.getDay();

    const conflictingUserReservation = userReservations.find(
      (reservation) =>
        reservation.date === dateKey &&
        slotsOverlap(requestSlot, {
          endTime: reservation.endTime,
          startTime: reservation.startTime,
        })
    );

    if (conflictingUserReservation) {
      throw new ApiError(
        409,
        "user_timeslot_conflict",
        "You already have a reservation request for one of the selected timeslots. Remove or change that reservation first.",
        {
          conflictingReservationId: conflictingUserReservation.id,
          date: dateKey,
        }
      );
    }

    const blockedSchedule = roomSchedules.find(
      (schedule) =>
        schedule.dayOfWeek === dayOfWeek &&
        slotsOverlap(requestSlot, {
          endTime: schedule.endTime,
          startTime: schedule.startTime,
        })
    );

    if (blockedSchedule) {
      throw new ApiError(
        409,
        "room_timeslot_unavailable",
        "This room is unavailable for the selected timeslot/s. Would you like to see alternative rooms?",
        {
          date: dateKey,
          reason: "schedule_conflict",
        }
      );
    }

    const approvedReservation = roomReservations.find(
      (reservation) =>
        reservation.date === dateKey &&
        reservation.status === "approved" &&
        slotsOverlap(requestSlot, {
          endTime: reservation.endTime,
          startTime: reservation.startTime,
        })
    );

    if (approvedReservation) {
      throw new ApiError(
        409,
        "room_timeslot_unavailable",
        "This room is unavailable for the selected timeslot/s. Would you like to see alternative rooms?",
        {
          date: dateKey,
          reason: "room_reserved",
        }
      );
    }
  }
}

async function getBuildingManagerIds(buildingId: string) {
  return getAssignedManagerIds(buildingId);
}

async function getPrimaryBuildingManagerEmail(buildingId: string) {
  const managerIds = await getBuildingManagerIds(buildingId);

  if (managerIds.length === 0) {
    throw new ApiError(
      400,
      "missing_building_admin",
      "No approved building administrator is assigned to the selected building."
    );
  }

  for (const managerId of managerIds) {
    const managerSnapshot = await db.collection("users").doc(managerId).get();
    if (!managerSnapshot.exists) {
      continue;
    }

    const managerData = managerSnapshot.data() as {
      email?: string | null;
      status?: string | null;
      role?: string | null;
    };
    const normalizedRole = normalizeRole(managerData.role);
    const normalizedEmail = managerData.email?.trim().toLowerCase() ?? "";

    if (
      managerData.status === "approved" &&
      normalizedRole === USER_ROLES.ADMIN &&
      normalizedEmail
    ) {
      return normalizedEmail;
    }
  }

  throw new ApiError(
    400,
    "missing_building_admin",
    "No approved building administrator email is available for the selected building."
  );
}

async function getUserIdsByEmail(email: string) {
  const usersSnapshot = await db
    .collection("users")
    .where("email", "==", normalizeApprovalEmail(email))
    .where("status", "==", "approved")
    .get();

  return usersSnapshot.docs.map((userDoc) => userDoc.id);
}

async function getApprovedUsersByEmail(email: string) {
  const usersSnapshot = await db
    .collection("users")
    .where("email", "==", normalizeApprovalEmail(email))
    .where("status", "==", "approved")
    .get();

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
  approverRole?: ReservationApprovalStep["role"];
}) {
  try {
    const normalizedEmail = normalizeApprovalEmail(input.email);
    const approvedUsers = await getApprovedUsersByEmail(normalizedEmail);
    const expectedRole =
      input.approverRole ?? (input.campus === "main" ? "advisor" : "building_admin");

    if (approvedUsers.length === 0) {
      throw new ApiError(
        400,
        "approver_not_found",
        expectedRole === "advisor"
          ? "The adviser, department head, or professor email must belong to an approved e-RoomReserve faculty account."
          : "The building admin email must belong to an approved e-RoomReserve administrator account."
      );
    }

    if (
      expectedRole === "advisor" &&
      !approvedUsers.some((user) => user.role === USER_ROLES.FACULTY)
    ) {
      throw new ApiError(
        400,
        "invalid_approver_role",
        "The adviser, department head, or professor email must belong to an approved faculty e-RoomReserve account."
      );
    }

    if (
      expectedRole === "building_admin" &&
      !approvedUsers.some((user) => user.role === USER_ROLES.ADMIN)
    ) {
      throw new ApiError(
        400,
        "invalid_approver_role",
        "The building admin email must belong to an approved e-RoomReserve administrator account."
      );
    }

    return {
      email: normalizedEmail,
      matchedUserIds: approvedUsers.map((user) => user.id),
    };
  } catch (error) {
    logReservationServiceError("validateReservationApprover", error, {
      campus: input.campus,
      email: normalizeApprovalEmail(input.email),
    });
    throw error;
  }
}

async function getBuildingCampus(buildingId: string) {
  const buildingSnapshot = await db.collection("buildings").doc(buildingId).get();
  if (!buildingSnapshot.exists) {
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

async function getReservationApproverInput(
  input: ReservationCreateInput | Omit<ReservationCreateInput, "date">,
  campus: ReservationCampus
): Promise<ReservationApproverInput> {
  const normalizedRole = normalizeRole(input.userRole);

  if (normalizedRole === USER_ROLES.FACULTY) {
    return {
      campus,
      buildingAdminEmail: await getPrimaryBuildingManagerEmail(input.buildingId),
    };
  }

  if (campus === "digi") {
    return {
      campus,
      buildingAdminEmail: await getPrimaryBuildingManagerEmail(input.buildingId),
    };
  }

  if (
    !("advisorEmail" in input) ||
    !input.advisorEmail?.trim()
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
    buildingAdminEmail: await getPrimaryBuildingManagerEmail(input.buildingId),
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
    approverRole: firstApprovalStep.role,
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
    status: selectedReservation.checkedInAt ? "Occupied" : "Reserved",
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
  batch: FirestoreBatch,
  queuedNotifications: AppNotificationInput[],
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
    route?: string;
  }
) {
  queueNotificationWrite(batch, queuedNotifications, input);
}

function addPushNotification(
  queuedNotifications: AppNotificationInput[],
  input: AppNotificationInput
) {
  queuePushNotification(queuedNotifications, input);
}

function normalizePresenceAppState(
  appState?: string | null
): ReservationPresenceAppState | null {
  if (appState === "foreground" || appState === "background") {
    return appState;
  }

  return null;
}

function normalizePresenceStatus(
  input: {
    bluetoothOn: boolean;
    checkedAt: string | null;
    inRange: boolean;
  },
  now: Date = new Date()
): ReservationPresenceStatus {
  if (input.checkedAt) {
    const parsedCheckedAt = new Date(input.checkedAt);
    if (
      !Number.isNaN(parsedCheckedAt.getTime()) &&
      now.getTime() - parsedCheckedAt.getTime() > PRESENCE_HEARTBEAT_TIMEOUT_MS
    ) {
      return "timed_out";
    }
  }

  if (!input.bluetoothOn || !input.inRange) {
    return "warning";
  }

  return "healthy";
}

async function updateReservationRoomPresence(
  roomId: string,
  options: {
    beaconConnected: boolean;
    beaconId?: string | null;
  }
) {
  await db.collection("rooms").doc(roomId).update({
    beaconConnected: options.beaconConnected,
    beaconDeviceName: options.beaconConnected ? options.beaconId ?? null : null,
    beaconLastConnectedAt: options.beaconConnected ? serverTimestamp() : null,
    beaconLastDisconnectedAt: options.beaconConnected ? null : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function shouldSyncRoomPresence(
  reservation: ReservationRecord,
  nextState: {
    beaconConnected: boolean;
    beaconId?: string | null;
  }
) {
  const currentBeaconConnected = reservation.presenceStatus === "healthy";
  const currentBeaconId = reservation.presenceMonitorBeaconId ?? null;
  const nextBeaconId = nextState.beaconId ?? null;

  return (
    currentBeaconConnected !== nextState.beaconConnected ||
    currentBeaconId !== nextBeaconId
  );
}

function addRoomHistory(
  batch: FirestoreBatch,
  reservation: ReservationRecord,
  status: ReservationStatus
) {
  const roomHistoryRef = db.collection("roomHistory").doc();
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

function sortReservationDatesAscending(left: ReservationRecord, right: ReservationRecord) {
  return (
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.id.localeCompare(right.id)
  );
}

async function getRecurringReservationGroup(
  recurringGroupId: string
): Promise<ReservationRecord[]> {
  const snapshot = await db
    .collection("reservations")
    .where("recurringGroupId", "==", recurringGroupId)
    .get();

  return snapshot.docs
    .map(
      (reservationDoc) =>
        ({
          id: reservationDoc.id,
          ...reservationDoc.data(),
        }) as ReservationRecord
    )
    .sort(sortReservationDatesAscending);
}

function getGroupedReservationDates(reservations: ReservationRecord[]) {
  return reservations.map((reservation) => reservation.date);
}

function formatGroupedReservationDates(dates: string[]) {
  if (dates.length === 0) {
    return "";
  }

  if (dates.length === 1) {
    return formatNotificationDate(dates[0]);
  }

  return dates.map((date) => formatNotificationDate(date)).join(", ");
}

function formatGroupedScheduleSummary(reservations: ReservationRecord[]) {
  const dates = getGroupedReservationDates(reservations);
  const firstReservation = reservations[0];

  if (!firstReservation) {
    return "";
  }

  return `${formatGroupedReservationDates(dates)} (${formatTimeRange(
    firstReservation.startTime,
    firstReservation.endTime
  )})`;
}

async function getReservationGroupForMutation(reservation: ReservationRecord) {
  if (!reservation.recurringGroupId) {
    return [reservation];
  }

  return getRecurringReservationGroup(reservation.recurringGroupId);
}

export async function createReservationRecord(data: ReservationCreateInput) {
  try {
    await assertReservationDatesAvailable(data, [data.date]);

    const campus = await resolveReservationCampus(data);
    const approvalFlow = buildApprovalFlow(
      await getReservationApproverInput(data, campus)
    );
    const { firstApproverIds } = await getInitialApproverIdsOrThrow(
      approvalFlow,
      campus
    );
    const reservationRef = db.collection("reservations").doc();
    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];

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
      isEvent: data.isEvent,
      ...(data.dcSpaceEventId?.trim()
        ? { dcSpaceEventId: data.dcSpaceEventId.trim() }
        : {}),
      ...(data.approvalDocumentName
        ? { approvalDocumentName: data.approvalDocumentName }
        : {}),
      ...(data.approvalDocumentPath
        ? { approvalDocumentPath: data.approvalDocumentPath }
        : {}),
      ...(data.approvalDocumentMimeType
        ? { approvalDocumentMimeType: data.approvalDocumentMimeType }
        : {}),
      ...(typeof data.approvalDocumentSize === "number" &&
      Number.isFinite(data.approvalDocumentSize) &&
      data.approvalDocumentSize > 0
        ? { approvalDocumentSize: data.approvalDocumentSize }
        : {}),
      ...(data.approvalDocumentUrl
        ? { approvalDocumentUrl: data.approvalDocumentUrl }
        : {}),
      ...(data.equipment ? { equipment: data.equipment } : {}),
      ...(data.otherEquipment?.trim()
        ? { otherEquipment: data.otherEquipment.trim() }
        : {}),
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
      addNotification(batch, queuedNotifications, {
        recipientUid,
        type: "new_reservation",
        title: "New Reservation Request",
        message: `${data.userName} reserved ${data.roomName} on ${formatReservationScheduleLabel(
          data
        )}.`,
        buildingId: data.buildingId,
        reservationId: reservationRef.id,
      });
    });

    await batch.commit();
    await sendQueuedPushNotifications(queuedNotifications);
    return reservationRef.id;
  } catch (error) {
    logReservationServiceError("createReservationRecord", error, {
      roomId: data.roomId,
      buildingId: data.buildingId,
      date: data.date,
      userId: data.userId,
    });
    throw error;
  }
}

export async function createRecurringReservationRecord(
  data: Omit<ReservationCreateInput, "date">,
  selectedDays: number[],
  startDate: string,
  endDate: string
) {
  try {
    const dates = getDatesForDays(startDate, endDate, selectedDays);
    await assertReservationDatesAvailable(data, dates);

    const campus = await resolveReservationCampus(data);
    const approvalFlow = buildApprovalFlow(
      await getReservationApproverInput(data, campus)
    );
    const { firstApproverIds } = await getInitialApproverIdsOrThrow(
      approvalFlow,
      campus
    );
    const recurringGroupId = `recurring_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];
    const createdIds: string[] = [];

    dates.forEach((date) => {
      const reservationRef = db.collection("reservations").doc();
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
        isEvent: data.isEvent,
        ...(data.approvalDocumentName
          ? { approvalDocumentName: data.approvalDocumentName }
          : {}),
        ...(data.approvalDocumentPath
          ? { approvalDocumentPath: data.approvalDocumentPath }
          : {}),
        ...(data.approvalDocumentMimeType
          ? { approvalDocumentMimeType: data.approvalDocumentMimeType }
          : {}),
        ...(typeof data.approvalDocumentSize === "number" &&
        Number.isFinite(data.approvalDocumentSize) &&
        data.approvalDocumentSize > 0
          ? { approvalDocumentSize: data.approvalDocumentSize }
          : {}),
        ...(data.approvalDocumentUrl
          ? { approvalDocumentUrl: data.approvalDocumentUrl }
          : {}),
        ...(data.equipment ? { equipment: data.equipment } : {}),
        ...(data.otherEquipment?.trim()
          ? { otherEquipment: data.otherEquipment.trim() }
          : {}),
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
      .filter((day) => day >= 1 && day <= 6)
      .map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day])
      .join(", ");

    firstApproverIds.forEach((recipientUid) => {
      addNotification(batch, queuedNotifications, {
        recipientUid,
        type: "new_reservation",
        title: "New Recurring Reservation",
        message: `${data.userName} reserved ${data.roomName} every ${dayNames} from ${formatNotificationDate(
          startDate
        )} to ${formatNotificationDate(endDate)} (${formatTimeRange(
          data.startTime,
          data.endTime
        )}) - ${dates.length} dates.`,
        buildingId: data.buildingId,
        reservationId: createdIds[0],
      });
    });

    await batch.commit();
    await sendQueuedPushNotifications(queuedNotifications);
    return createdIds;
  } catch (error) {
    logReservationServiceError("createRecurringReservationRecord", error, {
      roomId: data.roomId,
      buildingId: data.buildingId,
      startDate,
      endDate,
      selectedDays,
      userId: data.userId,
    });
    throw error;
  }
}

export async function approveReservationRecord(
  reservationId: string,
  userEmail: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const approvalResult = await db.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists) {
        throw new ApiError(404, "not_found", "Reservation not found.");
      }

      const reservation = {
        id: reservationSnapshot.id,
        ...reservationSnapshot.data(),
      } as ReservationRecord;
      const groupedReservations = reservation.recurringGroupId
        ? (
            await transaction.get(
              db
                .collection("reservations")
                .where("recurringGroupId", "==", reservation.recurringGroupId)
            )
          ).docs
            .map(
              (groupedReservationDoc) =>
                ({
                  id: groupedReservationDoc.id,
                  ...groupedReservationDoc.data(),
                }) as ReservationRecord
            )
            .sort(sortReservationDatesAscending)
        : [reservation];
      const pendingReservations = groupedReservations.filter(
        (groupedReservation) => groupedReservation.status === "pending"
      );

      if (pendingReservations.length === 0) {
        throw new ApiError(
          400,
          "invalid_status",
          "Only pending reservations can be reviewed."
        );
      }

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

      pendingReservations.forEach((pendingReservation) => {
        assertReservationPendingApproval(pendingReservation);

        const reservationApprovalStep =
          getReservationCurrentApprovalStep(pendingReservation);
        if (!isCurrentApproverEmail(reservationApprovalStep, userEmail)) {
          throw new ApiError(
            403,
            "forbidden",
            "You are not the current approver for this reservation."
          );
        }

        const approvalEntry: ReservationApprovalRecord = {
          role: reservationApprovalStep.role,
          email: reservationApprovalStep.email,
          date: Timestamp.now() as unknown as ReservationApprovalRecord["date"],
          status: "approved",
        };

        transaction.update(
          db.collection("reservations").doc(pendingReservation.id),
          {
            approvals: [...(pendingReservation.approvals ?? []), approvalEntry],
            currentStep: pendingReservation.currentStep + 1,
            status: isFinalApproval ? "approved" : "pending",
            updatedAt: serverTimestamp(),
          }
        );
      });

      return {
        currentApprovalStep,
        groupedReservations: pendingReservations,
        nextApprovalStep: getNextApprovalStep(
          reservation.approvalFlow,
          reservation.currentStep
        ),
        isFinalApproval,
      };
    });

    if (!approvalResult.isFinalApproval) {
      const nextApproverIds = approvalResult.nextApprovalStep
        ? await getUserIdsByEmail(approvalResult.nextApprovalStep.email)
        : [];

      const batch = db.batch();
      const queuedNotifications: AppNotificationInput[] = [];

      if (approvalResult.currentApprovalStep.role === "advisor") {
        addNotification(batch, queuedNotifications, {
          recipientUid: approvalResult.groupedReservations[0].userId,
          type: "system",
          title: "Faculty Adviser Approved",
          message: `Your faculty adviser approved your reservation for ${
            approvalResult.groupedReservations[0].roomName
          } on ${formatGroupedScheduleSummary(
            approvalResult.groupedReservations
          )}. It is now waiting for the next approval step.`,
          buildingId: approvalResult.groupedReservations[0].buildingId,
          reservationId,
        });
      }

      nextApproverIds.forEach((recipientUid) => {
        addNotification(batch, queuedNotifications, {
          recipientUid,
          type: "new_reservation",
          title: "Reservation Approval Required",
          message: `${
            approvalResult.groupedReservations[0].userName
          } reserved ${
            approvalResult.groupedReservations[0].roomName
          } on ${formatGroupedScheduleSummary(
            approvalResult.groupedReservations
          )}. Your approval is required.`,
          buildingId: approvalResult.groupedReservations[0].buildingId,
          reservationId,
        });
      });

      if (queuedNotifications.length > 0) {
        await batch.commit();
        await sendQueuedPushNotifications(queuedNotifications);
      }
      return;
    }
    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];

    addNotification(batch, queuedNotifications, {
      recipientUid: approvalResult.groupedReservations[0].userId,
      type: "reservation_approved",
      title: "Reservation Approved",
      message: `Your reservation for ${
        approvalResult.groupedReservations[0].roomName
      } on ${formatGroupedScheduleSummary(
        approvalResult.groupedReservations
      )} has been fully approved.`,
      buildingId: approvalResult.groupedReservations[0].buildingId,
      reservationId,
    });

    const roomIds = [...new Set(approvalResult.groupedReservations.map((reservation) => reservation.roomId))];
    for (const roomId of roomIds) {
      const approvedReservations = await getApprovedReservationsForRoom(roomId);
      batch.update(db.collection("rooms").doc(roomId), {
        ...getRoomStatusPayload(approvedReservations),
        updatedAt: serverTimestamp(),
      });
    }

    approvalResult.groupedReservations.forEach((reservation) => {
      addRoomHistory(batch, reservation, "approved");
    });

    await batch.commit();
    await sendQueuedPushNotifications(queuedNotifications);
    await syncReservationStatuses(
      approvalResult.groupedReservations.map((reservation) => ({
        dcSpaceEventId: reservation.dcSpaceEventId,
        id: reservation.id,
        roomId: reservation.roomId,
        roomName: reservation.roomName,
        status: "approved" as const,
      }))
    );
  } catch (error) {
    logReservationServiceError("approveReservationRecord", error, {
      reservationId,
      userEmail: normalizeApprovalEmail(userEmail),
    });
    throw error;
  }
}

export async function rejectReservationRecord(
  reservationId: string,
  userEmail: string,
  reason: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const rejectionResult = await db.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
      if (!reservationSnapshot.exists) {
        throw new ApiError(404, "not_found", "Reservation not found.");
      }

      const reservation = {
        id: reservationSnapshot.id,
        ...reservationSnapshot.data(),
      } as ReservationRecord;
      const groupedReservations = reservation.recurringGroupId
        ? (
            await transaction.get(
              db
                .collection("reservations")
                .where("recurringGroupId", "==", reservation.recurringGroupId)
            )
          ).docs
            .map(
              (groupedReservationDoc) =>
                ({
                  id: groupedReservationDoc.id,
                  ...groupedReservationDoc.data(),
                }) as ReservationRecord
            )
            .sort(sortReservationDatesAscending)
        : [reservation];
      const pendingReservations = groupedReservations.filter(
        (groupedReservation) => groupedReservation.status === "pending"
      );

      if (pendingReservations.length === 0) {
        throw new ApiError(
          400,
          "invalid_status",
          "Only pending reservations can be reviewed."
        );
      }

      const currentApprovalStep = getReservationCurrentApprovalStep(reservation);
      if (!isCurrentApproverEmail(currentApprovalStep, userEmail)) {
        throw new ApiError(
          403,
          "forbidden",
          "You are not the current approver for this reservation."
        );
      }

      pendingReservations.forEach((pendingReservation) => {
        assertReservationPendingApproval(pendingReservation);

        const reservationApprovalStep =
          getReservationCurrentApprovalStep(pendingReservation);
        if (!isCurrentApproverEmail(reservationApprovalStep, userEmail)) {
          throw new ApiError(
            403,
            "forbidden",
            "You are not the current approver for this reservation."
          );
        }

        transaction.update(db.collection("reservations").doc(pendingReservation.id), {
          status: "rejected",
          rejectedBy: normalizeApprovalEmail(userEmail),
          reason: reason.trim(),
          updatedAt: serverTimestamp(),
        });
      });

      return {
        groupedReservations: pendingReservations,
        currentApprovalStep,
      };
    });

    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];

    addNotification(batch, queuedNotifications, {
      recipientUid: rejectionResult.groupedReservations[0].userId,
      type: "reservation_rejected",
      title: "Reservation Rejected",
      message: `Your reservation for ${
        rejectionResult.groupedReservations[0].roomName
      } on ${formatGroupedScheduleSummary(
        rejectionResult.groupedReservations
      )} was rejected during the ${
        rejectionResult.currentApprovalStep.role
      } step. Reason: ${reason.trim()}`,
      buildingId: rejectionResult.groupedReservations[0].buildingId,
      reservationId,
    });

    await batch.commit();
    await sendQueuedPushNotifications(queuedNotifications);
    await syncReservationStatuses(
      rejectionResult.groupedReservations.map((reservation) => ({
        dcSpaceEventId: reservation.dcSpaceEventId,
        id: reservation.id,
        roomId: reservation.roomId,
        roomName: reservation.roomName,
        status: "rejected" as const,
      }))
    );
  } catch (error) {
    logReservationServiceError("rejectReservationRecord", error, {
      reservationId,
      userEmail: normalizeApprovalEmail(userEmail),
    });
    throw error;
  }
}

export async function cancelReservationRecord(
  reservationId: string,
  userId: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
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

    const reservationsToCancel =
      reservation.recurringGroupId && reservation.status === "pending"
        ? (await getRecurringReservationGroup(reservation.recurringGroupId)).filter(
            (groupedReservation) =>
              groupedReservation.userId === userId &&
              groupedReservation.status === "pending"
          )
        : [reservation];
    const managerIds = await getBuildingManagerIds(reservation.buildingId);
    const approvedReservations =
      reservation.status === "approved"
        ? await getApprovedReservationsForRoom(reservation.roomId)
        : [];
    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];

    reservationsToCancel.forEach((reservationToCancel) => {
      batch.update(db.collection("reservations").doc(reservationToCancel.id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
    });

    managerIds.forEach((managerUid) => {
      addNotification(batch, queuedNotifications, {
        recipientUid: managerUid,
        type: "reservation_cancelled",
        title: "Reservation Cancelled",
        message: `${reservation.userName} cancelled their reservation for ${
          reservation.roomName
        } on ${
          reservationsToCancel.length > 1
            ? formatGroupedScheduleSummary(reservationsToCancel)
            : formatReservationScheduleLabel(reservation)
        }`,
        buildingId: reservation.buildingId,
        reservationId,
      });
    });

    if (reservation.status === "approved") {
      batch.update(db.collection("rooms").doc(reservation.roomId), {
        ...getRoomStatusPayload(
          approvedReservations.filter(
            (approvedReservation) => approvedReservation.id !== reservationId
          )
        ),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    await sendQueuedPushNotifications(queuedNotifications);
    await syncReservationStatuses(
      reservationsToCancel.map((reservationToCancel) => ({
        dcSpaceEventId: reservationToCancel.dcSpaceEventId,
        id: reservationToCancel.id,
        roomId: reservationToCancel.roomId,
        roomName: reservationToCancel.roomName,
        status: "cancelled" as const,
      }))
    );
  } catch (error) {
    logReservationServiceError("cancelReservationRecord", error, {
      reservationId,
      userId,
    });
    throw error;
  }
}

export async function checkInReservationRecord(
  reservationId: string,
  userId: string,
  method: RoomCheckInMethod = "manual"
) {
  try {
    const normalizedMethod = normalizeRoomCheckInMethod(method) ?? "manual";
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRecord;
    if (reservation.userId !== userId) {
      throw new ApiError(403, "forbidden", "You cannot check in for this reservation.");
    }
    if (
      !canReservationCheckIn({
        status: reservation.status,
        date: reservation.date,
        checkedInAt:
          reservation.checkedInAt as Parameters<
            typeof canReservationCheckIn
          >[0]["checkedInAt"],
      })
    ) {
      throw new ApiError(
        400,
        "invalid_check_in",
        "Check-in is only available for today's approved reservations."
      );
    }

    const roomRef = db.collection("rooms").doc(reservation.roomId);
    const roomSnapshot = await roomRef.get();
    if (!roomSnapshot.exists) {
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
    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];

    batch.update(reservationRef, {
      checkedInAt: serverTimestamp(),
      checkInMethod: normalizedMethod,
      updatedAt: serverTimestamp(),
    });

    batch.update(roomRef, {
      status: "Occupied",
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
      addPushNotification(queuedNotifications, {
        recipientUid: managerUid,
        type: "system",
        title: "Room Checked In",
        message: `${reservation.userName} checked in to ${reservation.roomName} on ${formatReservationScheduleLabel(
          reservation
        )}.`,
        buildingId: reservation.buildingId,
        reservationId,
        route: "/(main)/dashboard/rooms-status",
      });
    });

    await batch.commit();
    await sendQueuedPushNotifications(queuedNotifications);
  } catch (error) {
    logReservationServiceError("checkInReservationRecord", error, {
      reservationId,
      userId,
      method,
    });
    throw error;
  }
}

export async function disconnectReservationBeaconRecord(
  reservationId: string,
  userId: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
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

    const roomRef = db.collection("rooms").doc(reservation.roomId);
    const roomSnapshot = await roomRef.get();
    if (!roomSnapshot.exists) {
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

    const batch = db.batch();

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
  } catch (error) {
    logReservationServiceError("disconnectReservationBeaconRecord", error, {
      reservationId,
      userId,
    });
    throw error;
  }
}

export async function startReservationPresenceMonitorRecord(
  reservationId: string,
  userId: string,
  beaconId: string
) {
  try {
    const normalizedBeaconId = beaconId.trim();
    if (!normalizedBeaconId) {
      throw new ApiError(400, "missing_beacon", "Beacon ID is required.");
    }

    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
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
        "You cannot start monitoring for this reservation."
      );
    }
    if (reservation.status !== "approved" || !reservation.checkedInAt) {
      throw new ApiError(
        400,
        "invalid_status",
        "Presence monitoring is only available for checked-in approved reservations."
      );
    }
    if (normalizeRoomCheckInMethod(reservation.checkInMethod) !== "bluetooth") {
      throw new ApiError(
        400,
        "invalid_check_in_method",
        "Presence monitoring is only available for Bluetooth check-ins."
      );
    }

    await reservationRef.update({
      presenceMonitorBeaconId: normalizedBeaconId,
      presenceMonitoringStartedAt: serverTimestamp(),
      presenceStatus: "healthy",
      updatedAt: serverTimestamp(),
    });

    if (
      shouldSyncRoomPresence(reservation, {
        beaconConnected: true,
        beaconId: normalizedBeaconId,
      })
    ) {
      await updateReservationRoomPresence(reservation.roomId, {
        beaconConnected: true,
        beaconId: normalizedBeaconId,
      });
    }
  } catch (error) {
    logReservationServiceError("startReservationPresenceMonitorRecord", error, {
      reservationId,
      userId,
      beaconId,
    });
    throw error;
  }
}

export async function sendReservationPresenceHeartbeatRecord(
  reservationId: string,
  input: {
    appState: ReservationPresenceAppState;
    beaconId?: string;
    bluetoothOn: boolean;
    checkedAt?: string;
    inRange: boolean;
    rssi?: number | null;
    userId: string;
  }
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRecord;
    if (reservation.userId !== input.userId) {
      throw new ApiError(
        403,
        "forbidden",
        "You cannot send heartbeats for this reservation."
      );
    }
    const monitoringActive =
      !reservation.occupancyReleasedAt &&
      (reservation.status === "approved" || reservation.status === "completed") &&
      Boolean(reservation.checkedInAt);

    if (!monitoringActive) {
      return {
        healthy: false,
        status: "stopped" as const,
        timedOut: false,
      };
    }

    const normalizedAppState = normalizePresenceAppState(input.appState);
    if (!normalizedAppState) {
      throw new ApiError(400, "invalid_app_state", "App state is invalid.");
    }

    const checkedAt =
      typeof input.checkedAt === "string" && input.checkedAt.trim().length > 0
        ? input.checkedAt.trim()
        : new Date().toISOString();
    const normalizedBeaconId =
      typeof input.beaconId === "string" && input.beaconId.trim().length > 0
        ? input.beaconId.trim()
        : (reservation.presenceMonitorBeaconId ?? null);
    const status = normalizePresenceStatus({
      bluetoothOn: input.bluetoothOn,
      checkedAt,
      inRange: input.inRange,
    });

    await reservationRef.update({
      presenceMonitorBeaconId: normalizedBeaconId,
      presenceLastHeartbeatAt: serverTimestamp(),
      presenceLastHeartbeatClientAt: checkedAt,
      presenceLastAppState: normalizedAppState,
      presenceLastBluetoothOn: input.bluetoothOn,
      presenceLastInRange: input.inRange,
      presenceLastRssi:
        typeof input.rssi === "number" && Number.isFinite(input.rssi)
          ? input.rssi
          : null,
      presenceStatus: status,
      updatedAt: serverTimestamp(),
    });

    if (
      shouldSyncRoomPresence(reservation, {
        beaconConnected: status === "healthy",
        beaconId: normalizedBeaconId,
      })
    ) {
      await updateReservationRoomPresence(reservation.roomId, {
        beaconConnected: status === "healthy",
        beaconId: normalizedBeaconId,
      });
    }

    return {
      healthy: status === "healthy",
      status,
      timedOut: status === "timed_out",
    };
  } catch (error) {
    logReservationServiceError("sendReservationPresenceHeartbeatRecord", error, {
      reservationId,
      ...input,
    });
    throw error;
  }
}

export async function stopReservationPresenceMonitorRecord(
  reservationId: string,
  userId: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
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
        "You cannot stop monitoring for this reservation."
      );
    }

    await reservationRef.update({
      presenceStatus: "stopped",
      updatedAt: serverTimestamp(),
    });

    if (
      shouldSyncRoomPresence(reservation, {
        beaconConnected: false,
        beaconId: reservation.presenceMonitorBeaconId ?? null,
      })
    ) {
      await updateReservationRoomPresence(reservation.roomId, {
        beaconConnected: false,
        beaconId: reservation.presenceMonitorBeaconId ?? null,
      });
    }
  } catch (error) {
    logReservationServiceError("stopReservationPresenceMonitorRecord", error, {
      reservationId,
      userId,
    });
    throw error;
  }
}

export async function completeReservationRecord(
  reservationId: string,
  userId: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRecord;
    if (reservation.userId !== userId) {
      throw new ApiError(403, "forbidden", "You cannot complete this reservation.");
    }
    if (reservation.status === "completed") {
      return;
    }
    if (reservation.status !== "approved") {
      throw new ApiError(
        400,
        "invalid_status",
        "Only approved reservations can be marked as completed."
      );
    }

    const managerIds = await getBuildingManagerIds(reservation.buildingId);
    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];

    batch.update(reservationRef, {
      status: "completed",
      completedAt: serverTimestamp(),
      occupancyReleasedAt: null,
      occupancyReleasedByUid: null,
      updatedAt: serverTimestamp(),
    });

    managerIds.forEach((managerUid) => {
      addPushNotification(queuedNotifications, {
        recipientUid: managerUid,
        type: "system",
        title: "Reservation Completed",
        message: `${reservation.userName} marked their reservation for ${reservation.roomName} on ${formatNotificationDate(
          reservation.date
        )} as completed.`,
        buildingId: reservation.buildingId,
        reservationId,
        route: "/(main)/dashboard/rooms-status",
      });
    });

    addRoomHistory(batch, reservation, "completed");

    await batch.commit();
    await sendQueuedPushNotifications(queuedNotifications);
    await syncReservationStatuses([
      {
        dcSpaceEventId: reservation.dcSpaceEventId,
        id: reservation.id,
        roomId: reservation.roomId,
        roomName: reservation.roomName,
        status: "completed",
      },
    ]);
  } catch (error) {
    logReservationServiceError("completeReservationRecord", error, {
      reservationId,
      userId,
    });
    throw error;
  }
}

export async function confirmFinishedReservationRecord(
  reservationId: string,
  actingUserId: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRecord;

    if (reservation.occupancyReleasedAt) {
      return;
    }

    const canConfirmCompletedReservation = reservation.status === "completed";
    const canForceFinishCheckedInApprovedReservation =
      reservation.status === "approved" && Boolean(reservation.checkedInAt);

    if (
      !canConfirmCompletedReservation &&
      !canForceFinishCheckedInApprovedReservation
    ) {
      throw new ApiError(
        400,
        "invalid_status",
        "Only completed reservations or checked-in approved reservations can be confirmed as finished."
      );
    }

    const approvedReservations = await getApprovedReservationsForRoom(
      reservation.roomId
    );
    const batch = db.batch();

    batch.update(reservationRef, {
      checkedInAt: null,
      checkInMethod: null,
      completedAt:
        reservation.status === "completed"
          ? reservation.completedAt ?? serverTimestamp()
          : serverTimestamp(),
      occupancyReleasedAt: serverTimestamp(),
      occupancyReleasedByUid: actingUserId,
      presenceMonitorBeaconId: null,
      presenceMonitoringStartedAt: null,
      presenceStatus: "stopped",
      status: "completed",
      updatedAt: serverTimestamp(),
    });

    batch.update(db.collection("rooms").doc(reservation.roomId), {
      ...getRoomStatusPayload(
        approvedReservations.filter(
          (approvedReservation) => approvedReservation.id !== reservationId
        )
      ),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    await syncReservationStatuses([
      {
        dcSpaceEventId: reservation.dcSpaceEventId,
        id: reservation.id,
        roomId: reservation.roomId,
        roomName: reservation.roomName,
        status: "completed",
      },
    ]);
  } catch (error) {
    logReservationServiceError("confirmFinishedReservationRecord", error, {
      reservationId,
      actingUserId,
    });
    throw error;
  }
}

export async function deleteReservationRecord(
  reservationId: string,
  userId: string
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await reservationRef.get();
    if (!reservationSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: reservationSnapshot.id,
      ...reservationSnapshot.data(),
    } as ReservationRecord;
    if (reservation.userId !== userId) {
      throw new ApiError(403, "forbidden", "You cannot delete this reservation.");
    }

    const reservationsToDelete =
      reservation.recurringGroupId &&
      (reservation.status === "pending" ||
        reservation.status === "rejected" ||
        reservation.status === "cancelled")
        ? (await getRecurringReservationGroup(reservation.recurringGroupId)).filter(
            (groupedReservation) =>
              groupedReservation.userId === userId &&
              groupedReservation.status === reservation.status
          )
        : [reservation];
    const approvedReservations =
      reservation.status === "approved"
        ? await getApprovedReservationsForRoom(reservation.roomId)
        : [];
    const batch = db.batch();

    reservationsToDelete.forEach((reservationToDelete) => {
      batch.delete(db.collection("reservations").doc(reservationToDelete.id));
    });

    if (reservation.status === "approved") {
      batch.update(db.collection("rooms").doc(reservation.roomId), {
        ...getRoomStatusPayload(
          approvedReservations.filter(
            (approvedReservation) => approvedReservation.id !== reservationId
          )
        ),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    logReservationServiceError("deleteReservationRecord", error, {
      reservationId,
      userId,
    });
    throw error;
  }
}

export function buildReservationSummary(reservation: ReservationRecord) {
  const equipmentSummary = formatEquipmentSummary(reservation.equipment);
  const details = [reservation.purpose, equipmentSummary].filter(Boolean);

  return details.join(" | ");
}
