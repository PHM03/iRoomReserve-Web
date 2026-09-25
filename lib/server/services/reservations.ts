import "server-only";
import type { Transaction } from "firebase-admin/firestore";

import { db, deleteField, serverTimestamp, Timestamp } from "@/lib/firebase/firebase-admin";
import {
  inferCampusFromBuilding,
  normalizeCampus,
  type ReservationCampus,
} from "@/lib/buildings/campuses";
import { formatTimeRange } from "../../utils/dateTime";
import { normalizeRole, USER_ROLES } from "@/lib/auth/roles";
import { isMainCampusDsasProfile } from "@/lib/auth/dsas-designation";
import type { FirestoreTimestampLike } from "@/lib/types/firestore-types";
import {
  buildApprovalFlow,
  buildReservationRejectionNotice,
  buildReservationRejectionUpdate,
  getApprovalTransition,
  getCurrentApprovalStep,
  isAuthorizedDsasApprover,
  isCurrentApproverEmail,
  normalizeApprovalEmail,
  requiresDsasApproval,
  type DigiReservationApproverInput,
  type MainReservationApproverInput,
  type ReservationApprovalRecord,
  type ReservationApprovalStep,
  type ReservationApproverInput,
} from "@/lib/reservations/reservation-approval";
import {
  canReservationCheckIn,
  compareReservationSchedule,
  isRoomAdministrativelyUnavailable,
  normalizeRoomCheckInMethod,
  preserveAdministrativeUnavailableStatus,
  type RoomCheckInMethod,
} from "@/lib/rooms/roomStatus";
import type { Schedule } from "@/lib/schedules/schedules";
import {
  isScheduleInActiveContext,
  scheduleConflictsWithReservationSlot,
  type ScheduleAvailabilityContext,
} from "@/lib/schedules/scheduleConflicts";
import { normalizeScheduleContext } from "@/lib/schedules/scheduleContext";
import { ApiError } from "@/lib/server/api-error";
import type { RequestAuthContext } from "@/lib/server/request-auth";
import {
  assertCanManageBuilding,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import {
  getAssignedBuildingAdminIds,
  getAssignedManagerIds,
  getAssignedUtilityStaffIds,
  getResponsibleBuildingAdminIds,
} from "@/lib/server/services/building-managers";
import {
  queuePushNotification,
  queueNotificationWrite,
  sendQueuedPushNotifications,
  type AppNotificationInput,
} from "@/lib/server/services/push-notifications";
import { syncReservationStatuses } from "@/lib/server/services/reservation-status-sync";
import {
  formatOtherEquipment,
  getOtherEquipmentFields,
} from "@/lib/reservations/equipment";
import {
  hasActiveReservationRevision,
  isCurrentRequestedRevision,
  type ReservationRevisionRecord,
} from "@/lib/reservations/reservation-revisions";
import {
  getManilaDateKey,
  getMonitoringDayOffset,
  isPendingReservationDueForExpiration,
} from "@/lib/reservations/reservation-monitoring";
import {
  MAX_EXPIRATION_MESSAGE_LENGTH,
  normalizeExpirationMessage,
} from "@/lib/reservations/expiration-message";

type ReservationStatus =
  | "pending"
  | "approved"
  | "expired"
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
const mainCampusDsasAssignmentRef = db
  .collection("systemSettings")
  .doc("main-campus-dsas");
interface ReservationExpirationMessage {
  message: string;
  sentBy: string;
  sentAt?: FirestoreTimestampLike | null;
}

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
  otherEquipmentQuantity?: number;
  activeRevisionId?: string;
  activeRevisionStatus?: "requested";
  revisionScope?: "single" | "series";
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
  expiredAt?: FirestoreTimestampLike | null;
  expirationReason?: string | null;
  expirationMessage?: ReservationExpirationMessage | null;
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
  presenceLastWifiConnected?: boolean | null;
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
  otherEquipmentQuantity?: number;
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

function hasReservationEnded(
  reservation: Pick<ReservationRecord, "date" | "endTime">,
  now: Date = new Date()
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;
  const currentDate = `${values.year}-${values.month}-${values.day}`;
  const currentTime = `${values.hour}:${values.minute}`;

  return (
    reservation.date < currentDate ||
    (reservation.date === currentDate && reservation.endTime <= currentTime)
  );
}

function getMinutesUntilReservation(
  reservation: Pick<ReservationRecord, "date" | "startTime">,
  now: Date = new Date()
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;
  const [startHour, startMinute] = reservation.startTime.split(":").map(Number);
  const reservationTime = Date.UTC(
    Number(reservation.date.slice(0, 4)),
    Number(reservation.date.slice(5, 7)) - 1,
    Number(reservation.date.slice(8, 10)),
    startHour,
    startMinute
  );
  const currentTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute)
  );

  return Math.floor((reservationTime - currentTime) / 60_000);
}

function shouldSendUpcomingReservationReminder(
  reservation: ReservationRecord,
  now: Date = new Date()
) {
  const role = normalizeRole(reservation.userRole);
  if (
    reservation.status !== "approved" ||
    (role !== USER_ROLES.STUDENT && role !== USER_ROLES.FACULTY)
  ) {
    return false;
  }

  const minutesUntilReservation = getMinutesUntilReservation(reservation, now);
  return minutesUntilReservation >= 55 && minutesUntilReservation <= 60;
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

async function getApprovedReservationsForRoom(
  roomId: string,
  transaction?: FirebaseFirestore.Transaction
) {
  const reservationsQuery = db
    .collection("reservations")
    .where("roomId", "==", roomId)
    .where("status", "==", "approved");
  const reservationsSnapshot = transaction
    ? await transaction.get(reservationsQuery)
    : await reservationsQuery.get();

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

async function getActiveReservationsForRoom(
  roomId: string,
  transaction?: FirebaseFirestore.Transaction
) {
  const reservationsQuery = db
    .collection("reservations")
    .where("roomId", "==", roomId)
    .where("status", "in", ["pending", "approved"]);
  const reservationsSnapshot = transaction
    ? await transaction.get(reservationsQuery)
    : await reservationsQuery.get();

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

async function getManualUnavailableSlotsForRoom(
  roomId: string,
  transaction?: FirebaseFirestore.Transaction
) {
  const unavailabilityQuery = db
    .collection("roomUnavailability")
    .where("roomId", "==", roomId);
  const snapshot = transaction
    ? await transaction.get(unavailabilityQuery)
    : await unavailabilityQuery.get();

  return snapshot.docs.map((document) => document.data() as {
    date?: string;
    startTime?: string;
    endTime?: string;
  });
}

async function getActiveReservationsForUser(
  userId: string,
  transaction?: FirebaseFirestore.Transaction
) {
  const reservationsQuery = db
    .collection("reservations")
    .where("userId", "==", userId)
    .where("status", "in", ["pending", "approved"]);
  const reservationsSnapshot = transaction
    ? await transaction.get(reservationsQuery)
    : await reservationsQuery.get();

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

interface ReservationRoomContext {
  activeScheduleContext: ScheduleAvailabilityContext;
  buildingId: string;
  roomStatus: string | null;
}

async function getReservationRoomContext(
  roomId: string,
  requestedBuildingId: string,
  transaction?: FirebaseFirestore.Transaction
): Promise<ReservationRoomContext> {
  const roomRef = db.collection("rooms").doc(roomId);
  const roomSnapshot = transaction
    ? await transaction.get(roomRef)
    : await roomRef.get();

  if (!roomSnapshot.exists) {
    throw new ApiError(400, "invalid_room", "The selected room does not exist.");
  }

  const roomData = roomSnapshot.data() as {
    buildingId?: unknown;
    status?: unknown;
  };
  const buildingId =
    typeof roomData.buildingId === "string" ? roomData.buildingId.trim() : "";
  const roomStatus =
    typeof roomData.status === "string" ? roomData.status : null;

  if (!buildingId) {
    throw new ApiError(
      400,
      "invalid_room",
      "The selected room is not associated with a building."
    );
  }

  if (buildingId !== requestedBuildingId.trim()) {
    throw new ApiError(
      400,
      "invalid_room",
      "The selected room does not belong to the requested building."
    );
  }

  const buildingRef = db.collection("buildings").doc(buildingId);
  const buildingSnapshot = transaction
    ? await transaction.get(buildingRef)
    : await buildingRef.get();
  const scheduleContext = normalizeScheduleContext({
    academicYear: buildingSnapshot.data()?.activeScheduleAcademicYear,
    semester: buildingSnapshot.data()?.activeScheduleSemester,
  });

  return {
    activeScheduleContext: {
      ...scheduleContext,
      buildingId,
    },
    buildingId,
    roomStatus,
  };
}

async function getSchedulesForRoom(
  roomId: string,
  activeScheduleContext: ScheduleAvailabilityContext,
  transaction?: FirebaseFirestore.Transaction
): Promise<Schedule[]> {
  const schedulesQuery = db
    .collection("schedules")
    .where("roomId", "==", roomId);
  const schedulesSnapshot = transaction
    ? await transaction.get(schedulesQuery)
    : await schedulesQuery.get();

  return schedulesSnapshot.docs
    .map(
      (scheduleDoc) =>
        ({
          id: scheduleDoc.id,
          ...scheduleDoc.data(),
        }) as Schedule
    )
    .filter((schedule) =>
      isScheduleInActiveContext(schedule, activeScheduleContext)
    );
}

export interface ReservationAvailabilityInput {
  userId: string;
  roomId: string;
  buildingId: string;
  startTime: string;
  endTime: string;
}

export interface ReservationAvailabilityOptions {
  excludeReservationIds?: ReadonlySet<string>;
  /**
   * When supplied, every availability read participates in the caller's
   * Firestore transaction so a conflicting room/schedule mutation causes a
   * retry rather than being accepted between validation and the write.
   */
  transaction?: FirebaseFirestore.Transaction;
}

export async function assertReservationDatesAvailable(
  input: ReservationAvailabilityInput,
  dateKeys: string[],
  options: ReservationAvailabilityOptions = {}
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
  const roomContext = await getReservationRoomContext(
    input.roomId,
    input.buildingId,
    options.transaction
  );

  if (isRoomAdministrativelyUnavailable(roomContext.roomStatus)) {
    throw new ApiError(
      409,
      "room_administratively_unavailable",
      "This room is currently unavailable for reservations.",
      {
        reason: "administrative_unavailable",
      }
    );
  }

  const [roomSchedules, roomReservations, userReservations, manualUnavailableSlots] = await Promise.all([
    getSchedulesForRoom(
      input.roomId,
      roomContext.activeScheduleContext,
      options.transaction
    ),
    getActiveReservationsForRoom(input.roomId, options.transaction),
    getActiveReservationsForUser(input.userId, options.transaction),
    getManualUnavailableSlotsForRoom(input.roomId, options.transaction),
  ]);

  for (const dateKey of dateKeys) {
    const date = new Date(`${dateKey}T00:00:00`);
    const dayOfWeek = date.getDay();

    const conflictingUserReservation = userReservations.find(
      (reservation) =>
        !options.excludeReservationIds?.has(reservation.id) &&
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

    const blockedSchedule = roomSchedules.find((schedule) =>
      scheduleConflictsWithReservationSlot(schedule, {
        buildingId: roomContext.buildingId,
        dayOfWeek,
        endTime: requestSlot.endTime,
        roomId: input.roomId,
        startTime: requestSlot.startTime,
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

    const manualUnavailableSlot = manualUnavailableSlots.find(
      (slot) =>
        slot.date === dateKey &&
        typeof slot.startTime === "string" &&
        typeof slot.endTime === "string" &&
        slotsOverlap(requestSlot, { startTime: slot.startTime, endTime: slot.endTime })
    );

    if (manualUnavailableSlot) {
      throw new ApiError(
        409,
        "room_timeslot_unavailable",
        "This room is unavailable for the selected timeslot/s. Would you like to see alternative rooms?",
        { date: dateKey, reason: "manual_unavailability" }
      );
    }

    const approvedReservation = roomReservations.find(
      (reservation) =>
        !options.excludeReservationIds?.has(reservation.id) &&
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

async function getReservationMonitoringAdminIds(reservation: ReservationRecord) {
  const responsibleAdminIds = await getResponsibleBuildingAdminIds(
    reservation.approvalFlow
  );

  if (responsibleAdminIds.length > 0) {
    return responsibleAdminIds;
  }

  return getAssignedBuildingAdminIds(reservation.buildingId);
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

async function getMainCampusDsasApprover() {
  const assignmentSnapshot = await db
    .collection("systemSettings")
    .doc("main-campus-dsas")
    .get();
  const assignmentData = assignmentSnapshot.data() as {
    mainCampusDsasUid?: string | null;
  } | undefined;
  const uid = assignmentData?.mainCampusDsasUid?.trim();

  if (!uid) {
    throw new ApiError(
      503,
      "dsas_not_configured",
      "A Main Campus DSAS-designated Professor has not been assigned. Contact the Super Admin."
    );
  }

  const [userSnapshot, designatedSnapshot] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db
      .collection("users")
      .where("designation", "==", "DSAS")
      .where("designationCampus", "==", "main")
      .get(),
  ]);

  const designatedProfiles = designatedSnapshot.docs
    .map((userDoc) => ({
      uid: userDoc.id,
      ...(userDoc.data() as {
        role?: string | null;
        status?: string | null;
        designation?: string | null;
        designationCampus?: string | null;
      }),
    }))
    .filter(isMainCampusDsasProfile);
  const userData = userSnapshot.data() as {
    role?: string | null;
    status?: string | null;
    designation?: string | null;
    designationCampus?: string | null;
    email?: string | null;
  } | undefined;

  if (
    !userSnapshot.exists ||
    !userData ||
    !isMainCampusDsasProfile({ uid, ...userData }) ||
    designatedProfiles.length !== 1 ||
    designatedProfiles[0].uid !== uid ||
    !userData.email?.trim()
  ) {
    throw new ApiError(
      503,
      "dsas_configuration_invalid",
      "The Main Campus DSAS designation is missing or invalid. Contact the Super Admin."
    );
  }

  return {
    uid,
    email: normalizeApprovalEmail(userData.email),
  };
}

async function assertDsasStepStillAssigned(
  transaction: Transaction,
  step: ReservationApprovalStep
) {
  if (step.role !== "dsas" || !step.approverUid) {
    throw new ApiError(409, "dsas_unavailable", "The assigned DSAS approver is unavailable.");
  }

  const [userSnapshot, assignmentSnapshot] = await Promise.all([
    transaction.get(db.collection("users").doc(step.approverUid)),
    transaction.get(mainCampusDsasAssignmentRef),
  ]);
  const userData = userSnapshot.data() as {
    role?: string | null;
    status?: string | null;
    designation?: string | null;
    designationCampus?: string | null;
  } | undefined;
  const assignmentData = assignmentSnapshot.data() as {
    mainCampusDsasUid?: string | null;
  } | undefined;

  if (
    !userSnapshot.exists ||
    !userData ||
    !isMainCampusDsasProfile({ uid: step.approverUid, ...userData }) ||
    assignmentData?.mainCampusDsasUid !== step.approverUid
  ) {
    throw new ApiError(
      409,
      "dsas_unavailable",
      "The assigned DSAS Professor is no longer designated. Contact the Super Admin."
    );
  }
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

  const dsasApprover = requiresDsasApproval(campus, normalizedRole ?? "")
    ? await getMainCampusDsasApprover()
    : undefined;

  return {
    campus,
    advisorEmail: input.advisorEmail,
    ...(dsasApprover ? { dsasApprover } : {}),
    buildingAdminEmail: await getPrimaryBuildingManagerEmail(input.buildingId),
  };
}

async function getInitialApproverIdsOrThrow(
  approvalFlow: ReservationApprovalStep[],
  campus: ReservationCampus,
  buildingId: string
) {
  const firstApprovalStep = getCurrentApprovalStep(approvalFlow, 0);
  if (!firstApprovalStep) {
    throw new ApiError(
      400,
      "invalid_approval_flow",
      "Reservation approval flow is incomplete."
    );
  }

  if (firstApprovalStep.role === "building_admin") {
    const buildingAdminIds = await getAssignedBuildingAdminIds(buildingId);
    if (buildingAdminIds.length === 0) {
      throw new ApiError(
        400,
        "missing_building_admin",
        "No approved building administrator is assigned to the selected building."
      );
    }

    return {
      firstApprovalStep,
      firstApproverIds: buildingAdminIds,
    };
  }

  if (firstApprovalStep.role === "dsas") {
    const uid = firstApprovalStep.approverUid;
    if (!uid) {
      throw new ApiError(400, "invalid_approval_flow", "The DSAS approval step has no approver identity.");
    }
    const dsasSnapshot = await db.collection("users").doc(uid).get();
    const dsasData = dsasSnapshot.data() as {
      role?: string | null;
      status?: string | null;
      designation?: string | null;
      designationCampus?: string | null;
      email?: string | null;
    } | undefined;
    if (
      !dsasSnapshot.exists ||
      !dsasData ||
      !isMainCampusDsasProfile({ uid, ...dsasData }) ||
      normalizeApprovalEmail(dsasData.email ?? "") !== firstApprovalStep.email
    ) {
      throw new ApiError(400, "invalid_approval_flow", "The DSAS approver is not a valid designated Professor.");
    }
    return { firstApprovalStep, firstApproverIds: [uid] };
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

  if (hasActiveReservationRevision(reservation)) {
    throw new ApiError(
      409,
      "revision_pending",
      "This reservation has an active revision request and cannot be approved or rejected yet."
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

function assertCurrentStepCanBeApprovedBy(
  reservation: ReservationRecord,
  approvalStep: ReservationApprovalStep,
  userEmail: string,
  authContext?: RequestAuthContext
) {
  if (approvalStep.role === "dsas") {
    if (!isAuthorizedDsasApprover({
      campus: reservation.campus,
      requesterRole: normalizeRole(reservation.userRole) ?? reservation.userRole,
      step: approvalStep,
      userEmail,
      userRole: authContext?.role ?? null,
      userStatus: authContext?.status,
      userUid: authContext?.uid ?? null,
    })) {
      throw new ApiError(403, "forbidden", "Only the assigned Main Campus DSAS Professor can review this reservation.");
    }
    return;
  }

  if (approvalStep.role !== "building_admin") {
    if (!isCurrentApproverEmail(approvalStep, userEmail)) {
      throw new ApiError(403, "forbidden", "You are not the current approver for this reservation.");
    }
    return;
  }

  if (!authContext) {
    throw new ApiError(403, "forbidden", "Building Admin authorization is required.");
  }

  assertCanManageBuilding(authContext, reservation.buildingId);
  if (
    authContext.role !== USER_ROLES.SUPER_ADMIN &&
    (authContext.role !== USER_ROLES.ADMIN || authContext.status !== "approved")
  ) {
    throw new ApiError(403, "forbidden", "Only approved Building Admin accounts can approve this reservation.");
  }
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

async function updateRoomLifecycleStatus(roomId: string) {
  const roomRef = db.collection("rooms").doc(roomId);

  await db.runTransaction(async (transaction) => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) {
      return;
    }

    const approvedReservations = await getApprovedReservationsForRoom(
      roomId,
      transaction
    );
    const currentStatus = (roomSnapshot.data() as { status?: string | null }).status;
    transaction.update(roomRef, {
      ...preserveAdministrativeUnavailableStatus(
        currentStatus,
        getRoomStatusPayload(approvedReservations)
      ),
      updatedAt: serverTimestamp(),
    });
  });
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
    revisionId?: string;
    originalRoomId?: string;
    proposedRoomId?: string;
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
    wifiConnected?: boolean;
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

  if (!input.bluetoothOn || !input.inRange || input.wifiConnected === false) {
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

function formatEquipmentSummary(
  equipment?: Record<string, number>,
  otherEquipment?: string,
  otherEquipmentQuantity?: number
) {
  const standardEquipmentSummary = equipment
    ? Object.entries(equipment)
    .filter(([, quantity]) => quantity > 0)
    .map(([name, quantity]) => `${name} (x${quantity})`)
    .join(", ")
    : "";
  const otherEquipmentSummary = formatOtherEquipment(
    otherEquipment,
    otherEquipmentQuantity
  );

  return [standardEquipmentSummary, otherEquipmentSummary]
    .filter(Boolean)
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
      campus,
      data.buildingId
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
      ...getOtherEquipmentFields(
        data.otherEquipment,
        data.otherEquipmentQuantity
      ),
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
      campus,
      data.buildingId
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
        ...getOtherEquipmentFields(
          data.otherEquipment,
          data.otherEquipmentQuantity
        ),
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

/**
 * Applies the server-authoritative pending approval deadline and sends the
 * three-day monitoring reminders. Deterministic notification document IDs
 * make repeated cron/app-heartbeat runs idempotent.
 */
export async function monitorPendingReservations(now: Date = new Date()) {
  // Temporary hardware-testing switch. Keep the monitor implementation intact
  // so pending expiration and reminders resume when the flag is re-enabled.
  if (process.env.RESERVATION_EXPIRATION_ENABLED?.trim().toLowerCase() === "false") {
    return {
      expiredCount: 0,
      notificationCount: 0,
      manilaDate: getManilaDateKey(now),
    };
  }

  const pendingSnapshot = await db
    .collection("reservations")
    .where("status", "==", "pending")
    .get();
  const queuedNotifications: AppNotificationInput[] = [];
  let expiredCount = 0;

  await Promise.all(
    pendingSnapshot.docs.map(async (reservationDoc) => {
      const initialReservation = {
        id: reservationDoc.id,
        ...reservationDoc.data(),
      } as ReservationRecord;
      const adminIds = await getReservationMonitoringAdminIds(initialReservation);
      const recipientIds = [
        ...new Set([initialReservation.userId, ...adminIds]),
      ].filter(Boolean);

      const result = await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(reservationDoc.ref);
        if (!currentSnapshot.exists) {
          return { expired: false, notifications: [] as AppNotificationInput[] };
        }

        const reservation = {
          id: currentSnapshot.id,
          ...currentSnapshot.data(),
        } as ReservationRecord;
        if (
          reservation.status !== "pending" ||
          !reservation.date ||
          recipientIds.length === 0
        ) {
          return { expired: false, notifications: [] as AppNotificationInput[] };
        }

        const dayOffset = getMonitoringDayOffset(reservation.date, now);
        const isDue = isPendingReservationDueForExpiration(reservation.date, now);
        const notificationInputs: AppNotificationInput[] = [];
        const notificationRefs = recipientIds.map((recipientUid) => {
          const suffix = isDue ? "expired" : `approaching-${dayOffset}d`;
          return db
            .collection("notifications")
            .doc(`reservation-monitor-${reservation.id}-${suffix}-${recipientUid}`);
        });
        const existingNotifications = await Promise.all(
          notificationRefs.map((notificationRef) => transaction.get(notificationRef))
        );

        if (isDue) {
          const expirationDateLabel = formatNotificationDate(reservation.date);
          const requesterMessage = `Your reservation request for ${reservation.roomName} on ${formatReservationScheduleLabel(
            reservation
          )} expired on ${expirationDateLabel} because it was not processed before the reservation date.`;
          const adminMessage = `The reservation request for ${reservation.roomName} on ${formatReservationScheduleLabel(
            reservation
          )} expired on ${expirationDateLabel} because it was still pending when the reservation date arrived.`;

          transaction.update(reservationDoc.ref, {
            expiredAt: serverTimestamp(),
            expirationReason: "pending_approval_deadline",
            status: "expired",
            updatedAt: serverTimestamp(),
          });
          recipientIds.forEach((recipientUid, index) => {
            if (existingNotifications[index].exists) {
              return;
            }

            const isRequester = recipientUid === reservation.userId;
            const notificationInput: AppNotificationInput = {
              recipientUid,
              type: "system",
              title: "Reservation Request Expired",
              message: isRequester ? requesterMessage : adminMessage,
              buildingId: reservation.buildingId,
              reservationId: reservation.id,
              route: isRequester
                ? "/dashboard/reservations"
                : "/admin/dashboard?tab=pending",
            };
            transaction.set(notificationRefs[index], {
              ...notificationInput,
              read: false,
              createdAt: serverTimestamp(),
            });
            notificationInputs.push(notificationInput);
          });
        } else if (dayOffset !== null) {
          const adminMessage =
            dayOffset === 1
              ? `Reservation for ${reservation.roomName} on ${formatReservationScheduleLabel(
                  reservation
                )} still needs approval and will expire in 24 hours if it remains pending. Please review the request.`
              : `Reservation for ${reservation.roomName} on ${formatReservationScheduleLabel(
                  reservation
                )} needs approval and is ${dayOffset} days away. Please review the request before it expires when the reservation date arrives.`;

          recipientIds.forEach((recipientUid, index) => {
            if (existingNotifications[index].exists) {
              return;
            }

            const isRequester = recipientUid === reservation.userId;
            if (isRequester) {
              return;
            }
            const notificationInput: AppNotificationInput = {
              recipientUid,
              type: "system",
              title: "Reservation Needs Approval",
              message: adminMessage,
              buildingId: reservation.buildingId,
              reservationId: reservation.id,
              route: "/admin/dashboard?tab=pending",
            };
            transaction.set(notificationRefs[index], {
              ...notificationInput,
              read: false,
              createdAt: serverTimestamp(),
            });
            notificationInputs.push(notificationInput);
          });
        }

        return { expired: isDue, notifications: notificationInputs };
      });

      if (result.expired) {
        expiredCount += 1;
      }
      queuedNotifications.push(...result.notifications);
    })
  );

  await sendQueuedPushNotifications(queuedNotifications);
  return {
    expiredCount,
    notificationCount: queuedNotifications.length,
    manilaDate: getManilaDateKey(now),
  };
}

/**
 * Keeps the existing requester-triggered approved-reservation completion
 * cleanup, while also invoking the global pending monitor as a compatibility
 * fallback when the scheduled server route is not running.
 */
export async function expireOpenReservationsForUser(userId: string) {
  const openSnapshot = await db
    .collection("reservations")
    .where("userId", "==", userId)
    .where("status", "==", "approved")
    .get();
  const queuedNotifications: AppNotificationInput[] = [];
  let expiredCount = 0;

  await Promise.all(
    openSnapshot.docs.map(async (reservationDoc) => {
      const notification = await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(reservationDoc.ref);
        if (!currentSnapshot.exists) {
          return null;
        }

        const reservation = {
          id: currentSnapshot.id,
          ...currentSnapshot.data(),
        } as ReservationRecord;
        if (
          reservation.userId !== userId ||
          reservation.status !== "approved" ||
          !hasReservationEnded(reservation)
        ) {
          return null;
        }

        const notificationInput: AppNotificationInput = {
          recipientUid: userId,
          type: "system",
          title: "Reservation Expired",
          message: `Your approved reservation request for ${reservation.roomName} on ${formatReservationScheduleLabel(
            reservation
          )} has expired and was not completed.`,
          buildingId: reservation.buildingId,
          reservationId: reservation.id,
          route: "/dashboard/reservations",
        };
        transaction.update(reservationDoc.ref, {
          expiredAt: serverTimestamp(),
          status: "expired",
          updatedAt: serverTimestamp(),
        });
        transaction.set(
          db.collection("notifications").doc(`reservation-expired-${reservation.id}`),
          {
            ...notificationInput,
            read: false,
            createdAt: serverTimestamp(),
          }
        );
        return notificationInput;
      });

      if (notification) {
        expiredCount += 1;
        queuedNotifications.push(notification);
      }
    })
  );

  await Promise.all(
    openSnapshot.docs.map(async (reservationDoc) => {
      const notification = await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(reservationDoc.ref);
        if (!currentSnapshot.exists) {
          return null;
        }

        const reservation = {
          id: currentSnapshot.id,
          ...currentSnapshot.data(),
        } as ReservationRecord;
        if (
          reservation.userId !== userId ||
          !shouldSendUpcomingReservationReminder(reservation)
        ) {
          return null;
        }

        const notificationRef = db
          .collection("notifications")
          .doc(`reservation-upcoming-one-hour-${reservation.id}`);
        const existingNotification = await transaction.get(notificationRef);
        if (existingNotification.exists) {
          return null;
        }

        const notificationInput: AppNotificationInput = {
          recipientUid: userId,
          type: "system",
          title: "Upcoming Reservation",
          message: `You have an upcoming reservation in 1 hour for ${reservation.roomName} on ${formatReservationScheduleLabel(
            reservation
          )}.`,
          buildingId: reservation.buildingId,
          reservationId: reservation.id,
          route: "/dashboard/reservations",
        };
        transaction.set(notificationRef, {
          ...notificationInput,
          read: false,
          createdAt: serverTimestamp(),
        });
        return notificationInput;
      });

      if (notification) {
        queuedNotifications.push(notification);
      }
    })
  );

  const pendingMonitorResult = await monitorPendingReservations();
  await sendQueuedPushNotifications(queuedNotifications);
  return {
    expiredCount: expiredCount + pendingMonitorResult.expiredCount,
    notificationCount:
      queuedNotifications.length + pendingMonitorResult.notificationCount,
  };
}

export async function sendExpirationMessageRecord(
  reservationId: string,
  authContext: RequestAuthContext,
  message: string
) {
  assertVerifiedAuthentication(authContext);

  const normalizedMessage = normalizeExpirationMessage(message);
  if (!normalizedMessage) {
    if (message.trim().length > MAX_EXPIRATION_MESSAGE_LENGTH) {
      throw new ApiError(
        400,
        "message_too_long",
        `Message must be ${MAX_EXPIRATION_MESSAGE_LENGTH} characters or fewer.`
      );
    }
    throw new ApiError(400, "invalid_message", "Message cannot be empty.");
  }

  const reservationRef = db.collection("reservations").doc(reservationId);
  const initialSnapshot = await reservationRef.get();
  if (!initialSnapshot.exists) {
    throw new ApiError(404, "not_found", "Reservation not found.");
  }

  const initialReservation = {
    id: initialSnapshot.id,
    ...initialSnapshot.data(),
  } as ReservationRecord;
  if (!initialReservation.buildingId) {
    throw new ApiError(400, "invalid_reservation", "Reservation building is missing.");
  }

  assertCanManageBuilding(authContext, initialReservation.buildingId);
  if (
    authContext.role !== USER_ROLES.ADMIN &&
    authContext.role !== USER_ROLES.SUPER_ADMIN
  ) {
    throw new ApiError(403, "forbidden", "Only building administrators can send this message.");
  }

  if (authContext.role !== USER_ROLES.SUPER_ADMIN) {
    const responsibleAdminIds = await getReservationMonitoringAdminIds(initialReservation);
    if (!responsibleAdminIds.includes(authContext.uid!)) {
      throw new ApiError(
        403,
        "forbidden",
        "Only the responsible building administrator can send this message."
      );
    }
  }

  await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(reservationRef);
    if (!currentSnapshot.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }

    const reservation = {
      id: currentSnapshot.id,
      ...currentSnapshot.data(),
    } as ReservationRecord;
    if (
      reservation.status !== "expired" ||
      reservation.expirationReason !== "pending_approval_deadline"
    ) {
      throw new ApiError(
        400,
        "ineligible_reservation",
        "Only pending reservations expired at the approval deadline can receive this message."
      );
    }
    if (reservation.expirationMessage?.message?.trim()) {
      throw new ApiError(
        409,
        "message_already_sent",
        "An expiration message has already been sent for this reservation."
      );
    }

    transaction.update(reservationRef, {
      expirationMessage: {
        message: normalizedMessage,
        sentBy: "building_admin",
        sentAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  });
}

export async function approveReservationRecord(
  reservationId: string,
  userEmail: string,
  authContext?: RequestAuthContext
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
      assertCurrentStepCanBeApprovedBy(
        reservation,
        currentApprovalStep,
        userEmail,
        authContext
      );
      if (currentApprovalStep.role === "dsas") {
        await assertDsasStepStillAssigned(transaction, currentApprovalStep);
      }

      const transition = getApprovalTransition(
        reservation.approvalFlow,
        reservation.currentStep
      );
      const { isFinalApproval, nextApprovalStep } = transition;

      if (nextApprovalStep?.role === "dsas") {
        await assertDsasStepStillAssigned(transaction, nextApprovalStep);
      }

      const shouldSnapshotAdvisorApprover =
        currentApprovalStep.role === "advisor" &&
        reservation.campus === "main" &&
        normalizeRole(reservation.userRole) === USER_ROLES.STUDENT;
      const advisorApproverUid = shouldSnapshotAdvisorApprover
        ? authContext?.uid
        : null;
      const advisorApproverSnapshot = advisorApproverUid
        ? await transaction.get(db.collection("users").doc(advisorApproverUid))
        : null;
      const advisorApproverData = advisorApproverSnapshot?.data() as {
        firstName?: string | null;
        lastName?: string | null;
        displayName?: string | null;
      } | undefined;
      const advisorApproverName = advisorApproverData
        ? [advisorApproverData.firstName, advisorApproverData.lastName]
            .filter((part): part is string => Boolean(part?.trim()))
            .join(" ")
            .trim() || advisorApproverData.displayName?.trim() || undefined
        : undefined;

      pendingReservations.forEach((pendingReservation) => {
        assertReservationPendingApproval(pendingReservation);

        const reservationApprovalStep =
          getReservationCurrentApprovalStep(pendingReservation);
        assertCurrentStepCanBeApprovedBy(
          pendingReservation,
          reservationApprovalStep,
          userEmail,
          authContext
        );

        const approvalEntry: ReservationApprovalRecord = {
          role: reservationApprovalStep.role,
          email: reservationApprovalStep.email,
          ...(reservationApprovalStep.role === "advisor" && advisorApproverUid
            ? { approverUid: advisorApproverUid }
            : {}),
          ...(reservationApprovalStep.role === "advisor" && advisorApproverName
            ? { approverName: advisorApproverName }
            : {}),
          ...(reservationApprovalStep.approverUid
            ? { approverUid: reservationApprovalStep.approverUid }
            : {}),
          date: Timestamp.now() as unknown as ReservationApprovalRecord["date"],
          status: "approved",
        };

        transaction.update(
          db.collection("reservations").doc(pendingReservation.id),
          {
            approvals: [...(pendingReservation.approvals ?? []), approvalEntry],
            currentStep: pendingReservation.currentStep + 1,
            status: transition.nextStatus,
            updatedAt: serverTimestamp(),
          }
        );
      });

      return {
        currentApprovalStep,
        groupedReservations: pendingReservations,
        nextApprovalStep,
        isFinalApproval,
      };
    });

    if (!approvalResult.isFinalApproval) {
      const nextApproverIds = !approvalResult.nextApprovalStep
        ? []
        : approvalResult.nextApprovalStep.role === "building_admin"
          ? await getAssignedBuildingAdminIds(
              approvalResult.groupedReservations[0].buildingId
            )
          : approvalResult.nextApprovalStep.role === "dsas"
            ? approvalResult.nextApprovalStep.approverUid
              ? [approvalResult.nextApprovalStep.approverUid]
              : []
          : await getUserIdsByEmail(approvalResult.nextApprovalStep.email);

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
      } else if (approvalResult.currentApprovalStep.role === "dsas") {
        addNotification(batch, queuedNotifications, {
          recipientUid: approvalResult.groupedReservations[0].userId,
          type: "system",
          title: "DSAS Stage Approved",
          message: `The DSAS-designated Professor approved your reservation for ${
            approvalResult.groupedReservations[0].roomName
          } on ${formatGroupedScheduleSummary(
            approvalResult.groupedReservations
          )}. It is now waiting for Building Admin approval.`,
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

    approvalResult.groupedReservations.forEach((reservation) => {
      addRoomHistory(batch, reservation, "approved");
    });

    await batch.commit();
    await Promise.all(roomIds.map((roomId) => updateRoomLifecycleStatus(roomId)));
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
  reason: string,
  authContext?: RequestAuthContext
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
      assertCurrentStepCanBeApprovedBy(
        reservation,
        currentApprovalStep,
        userEmail,
        authContext
      );
      if (currentApprovalStep.role === "dsas") {
        await assertDsasStepStillAssigned(transaction, currentApprovalStep);
      }

      pendingReservations.forEach((pendingReservation) => {
        assertReservationPendingApproval(pendingReservation);

        const reservationApprovalStep =
          getReservationCurrentApprovalStep(pendingReservation);
        assertCurrentStepCanBeApprovedBy(
          pendingReservation,
          reservationApprovalStep,
          userEmail,
          authContext
        );

        transaction.update(
          db.collection("reservations").doc(pendingReservation.id),
          {
            ...buildReservationRejectionUpdate(userEmail, reason),
            updatedAt: serverTimestamp(),
          }
        );
      });

      return {
        groupedReservations: pendingReservations,
        currentApprovalStep,
      };
    });

    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];
    const rejectionNotice = buildReservationRejectionNotice({
      role: rejectionResult.currentApprovalStep.role,
      roomName: rejectionResult.groupedReservations[0].roomName,
      scheduleSummary: formatGroupedScheduleSummary(
        rejectionResult.groupedReservations
      ),
      reason,
    });

    addNotification(batch, queuedNotifications, {
      recipientUid: rejectionResult.groupedReservations[0].userId,
      type: "reservation_rejected",
      ...rejectionNotice,
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

async function cancelActiveRevisionReservationRecord(
  reservationId: string,
  userId: string,
  expectedRevisionId?: string
) {
  return db.runTransaction(async (transaction) => {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const reservationSnapshot = await transaction.get(reservationRef);

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
    if (reservation.status !== "pending") {
      throw new ApiError(
        409,
        "revision_not_allowed",
        "Only pending reservations can cancel an active revision reservation."
      );
    }

    const activeRevisionId = reservation.activeRevisionId?.trim();
    if (!activeRevisionId || reservation.activeRevisionStatus !== "requested") {
      throw new ApiError(409, "stale_revision", "This revision request is no longer active.");
    }
    if (expectedRevisionId && activeRevisionId !== expectedRevisionId) {
      throw new ApiError(409, "stale_revision", "This revision request is no longer active.");
    }

    const revisionRef = reservationRef
      .collection("revisions")
      .doc(activeRevisionId);
    const revisionSnapshot = await transaction.get(revisionRef);
    if (!revisionSnapshot.exists) {
      throw new ApiError(409, "stale_revision", "This revision request is no longer available.");
    }

    const revision = {
      revisionId: revisionSnapshot.id,
      ...revisionSnapshot.data(),
    } as ReservationRevisionRecord;
    if (
      !isCurrentRequestedRevision(
        reservation,
        revision,
        reservationId,
        activeRevisionId
      )
    ) {
      throw new ApiError(409, "stale_revision", "This revision request is no longer active.");
    }

    const occurrenceSnapshot = reservation.recurringGroupId
      ? await transaction.get(
          db
            .collection("reservations")
            .where("recurringGroupId", "==", reservation.recurringGroupId)
        )
      : null;
    const reservationsToCancel = occurrenceSnapshot
      ? occurrenceSnapshot.docs
          .map(
            (occurrenceDoc) =>
              ({
                id: occurrenceDoc.id,
                ...occurrenceDoc.data(),
              }) as ReservationRecord
          )
          .filter(
            (occurrence) =>
              occurrence.userId === userId &&
              occurrence.status === "pending"
          )
      : [reservation];

    if (reservationsToCancel.length === 0) {
      throw new ApiError(409, "stale_revision", "No pending reservation remains to cancel.");
    }

    reservationsToCancel.forEach((occurrence) => {
      if (
        !isCurrentRequestedRevision(
          occurrence,
          revision,
          reservationId,
          activeRevisionId
        )
      ) {
        throw new ApiError(409, "stale_revision", "The recurring revision request changed before cancellation.");
      }

      transaction.update(db.collection("reservations").doc(occurrence.id), {
        status: "cancelled",
        activeRevisionId: deleteField(),
        activeRevisionStatus: deleteField(),
        revisionScope: deleteField(),
        updatedAt: serverTimestamp(),
      });
    });

    transaction.update(revisionRef, {
      status: "cancelled",
      respondedByUid: userId,
      respondedAt: serverTimestamp(),
    });

    return {
      reservation,
      reservationsToCancel,
      revisionId: activeRevisionId,
    };
  });
}

export async function cancelReservationRevisionRecord(
  reservationId: string,
  authContext: RequestAuthContext,
  revisionId: string
) {
  assertVerifiedAuthentication(authContext);

  const userId = authContext.uid!;
  const result = await cancelActiveRevisionReservationRecord(
    reservationId,
    userId,
    revisionId
  );
  const managerIds = await getResponsibleBuildingAdminIds(
    result.reservation.approvalFlow
  );
  const batch = db.batch();
  const queuedNotifications: AppNotificationInput[] = [];

  managerIds.forEach((managerUid) => {
    addNotification(batch, queuedNotifications, {
      recipientUid: managerUid,
      type: "reservation_cancelled",
      title: "Reservation Cancelled",
      message: `${result.reservation.userName} cancelled their reservation for ${
        result.reservation.roomName
      } on ${
        result.reservationsToCancel.length > 1
          ? formatGroupedScheduleSummary(result.reservationsToCancel)
          : formatReservationScheduleLabel(result.reservation)
      }`,
      buildingId: result.reservation.buildingId,
      reservationId,
      revisionId: result.revisionId,
    });
  });

  await batch.commit();
  await sendQueuedPushNotifications(queuedNotifications);
  await syncReservationStatuses(
    result.reservationsToCancel.map((reservationToCancel) => ({
      dcSpaceEventId: reservationToCancel.dcSpaceEventId,
      id: reservationToCancel.id,
      roomId: reservationToCancel.roomId,
      roomName: reservationToCancel.roomName,
      status: "cancelled" as const,
    }))
  );
}

export async function cancelReservationRecord(
  reservationId: string,
  userId: string,
  authContext?: RequestAuthContext
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
    const hasRevisionMarker =
      (typeof reservation.activeRevisionId === "string" &&
        reservation.activeRevisionId.trim().length > 0) ||
      reservation.activeRevisionStatus === "requested";
    if (hasRevisionMarker) {
      const activeRevisionId = reservation.activeRevisionId?.trim();
      if (!activeRevisionId) {
        throw new ApiError(409, "stale_revision", "This revision request is no longer active.");
      }

      if (!authContext || authContext.uid !== userId) {
        throw new ApiError(401, "unauthenticated", "A verified authentication token is required.");
      }

      await cancelReservationRevisionRecord(
        reservationId,
        authContext,
        activeRevisionId
      );
      return;
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
    const cancellationRecipientIds =
      reservation.status === "approved"
        ? [
            ...new Set([
              ...(await getBuildingManagerIds(reservation.buildingId)),
              ...(
                await Promise.all(
                  reservation.approvalFlow
                    .filter(
                      (approvalStep) =>
                        approvalStep.role !== "building_admin" &&
                        approvalStep.email.trim().length > 0
                    )
                    .map((approvalStep) =>
                      approvalStep.role === "dsas" && approvalStep.approverUid
                        ? Promise.resolve([approvalStep.approverUid])
                        : getUserIdsByEmail(approvalStep.email)
                    )
                )
              ).flat(),
            ]),
          ]
        : [];
    const batch = db.batch();
    const queuedNotifications: AppNotificationInput[] = [];

    reservationsToCancel.forEach((reservationToCancel) => {
      batch.update(db.collection("reservations").doc(reservationToCancel.id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
    });

    cancellationRecipientIds.forEach((recipientUid) => {
      addNotification(batch, queuedNotifications, {
        recipientUid,
        type: "system",
        title: "Approved Reservation Cancelled",
        message: `${reservation.userName} has cancelled their reservation for ${
          reservation.roomName
        } on ${
          reservationsToCancel.length > 1
            ? formatGroupedScheduleSummary(reservationsToCancel)
            : formatReservationScheduleLabel(reservation)
        }.`,
        buildingId: reservation.buildingId,
        reservationId,
      });
    });

    await batch.commit();
    if (reservation.status === "approved") {
      await updateRoomLifecycleStatus(reservation.roomId);
    }
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
    const roomRef = db.collection("rooms").doc(reservation.roomId);
    const staffIds = await getAssignedUtilityStaffIds(reservation.buildingId);
    const queuedNotifications: AppNotificationInput[] = [];

    await db.runTransaction(async (transaction) => {
      const [latestReservationSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(reservationRef),
        transaction.get(roomRef),
      ]);
      if (!latestReservationSnapshot.exists) {
        throw new ApiError(404, "not_found", "Reservation not found.");
      }
      if (!roomSnapshot.exists) {
        throw new ApiError(404, "not_found", "Room not found.");
      }

      const latestReservation = {
        id: latestReservationSnapshot.id,
        ...latestReservationSnapshot.data(),
      } as ReservationRecord;
      if (latestReservation.userId !== userId) {
        throw new ApiError(403, "forbidden", "You cannot check in for this reservation.");
      }
      if (
        !canReservationCheckIn({
          status: latestReservation.status,
          date: latestReservation.date,
          checkedInAt:
            latestReservation.checkedInAt as Parameters<
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

      const roomData = roomSnapshot.data() as {
        beaconId?: string | null;
        bleBeaconId?: string | null;
        status?: string | null;
      };
      if (isRoomAdministrativelyUnavailable(roomData.status)) {
        throw new ApiError(
          400,
          "room_unavailable",
          "This room is currently unavailable for check-in."
        );
      }
      const roomBeaconId =
        typeof roomData.bleBeaconId === "string" && roomData.bleBeaconId.trim().length > 0
          ? roomData.bleBeaconId.trim()
          : typeof roomData.beaconId === "string" && roomData.beaconId.trim().length > 0
            ? roomData.beaconId.trim()
            : "";
      if (normalizedMethod === "bluetooth" && roomBeaconId.length === 0) {
        throw new ApiError(
          400,
          "missing_beacon",
          "This room does not have a Bluetooth beacon configured yet."
        );
      }

      transaction.update(reservationRef, {
        checkedInAt: serverTimestamp(),
        checkInMethod: normalizedMethod,
        updatedAt: serverTimestamp(),
      });
      transaction.update(roomRef, {
        status: "Occupied",
        beaconConnected: normalizedMethod === "bluetooth",
        beaconDeviceName:
          normalizedMethod === "bluetooth" ? roomBeaconId : null,
        beaconLastConnectedAt:
          normalizedMethod === "bluetooth" ? serverTimestamp() : null,
        beaconLastDisconnectedAt: null,
        reservedBy: latestReservation.userId,
        activeReservationId: reservationId,
        checkedInAt: serverTimestamp(),
        checkInMethod: normalizedMethod,
        updatedAt: serverTimestamp(),
      });
    });

    staffIds.forEach((staffUid) => {
      addPushNotification(queuedNotifications, {
        recipientUid: staffUid,
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
      status?: string | null;
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
        ...preserveAdministrativeUnavailableStatus(roomData.status, {
          status: "Available",
        }),
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
    wifiConnected?: boolean;
    rssi?: number | null;
    userId: string;
  }
) {
  try {
    const reservationRef = db.collection("reservations").doc(reservationId);
    const normalizedAppState = normalizePresenceAppState(input.appState);
    if (!normalizedAppState) {
      throw new ApiError(400, "invalid_app_state", "App state is invalid.");
    }

    const checkedAt =
      typeof input.checkedAt === "string" && input.checkedAt.trim().length > 0
        ? input.checkedAt.trim()
        : new Date().toISOString();
    return await db.runTransaction(async (transaction) => {
      const reservationSnapshot = await transaction.get(reservationRef);
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
        reservation.status === "approved" &&
        Boolean(reservation.checkedInAt);

      if (!monitoringActive) {
        if (
          reservation.status === "completed" &&
          (reservation.presenceStatus !== "stopped" ||
            reservation.presenceMonitorBeaconId != null ||
            reservation.presenceMonitoringStartedAt != null)
        ) {
          transaction.update(reservationRef, {
            presenceMonitorBeaconId: null,
            presenceMonitoringStartedAt: null,
            presenceStatus: "stopped",
            updatedAt: serverTimestamp(),
          });
          transaction.update(db.collection("rooms").doc(reservation.roomId), {
            beaconConnected: false,
            beaconDeviceName: null,
            beaconLastConnectedAt: null,
            beaconLastDisconnectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return {
          healthy: false,
          status: "stopped" as const,
          timedOut: false,
        };
      }

      const normalizedBeaconId =
        typeof input.beaconId === "string" && input.beaconId.trim().length > 0
          ? input.beaconId.trim()
          : (reservation.presenceMonitorBeaconId ?? null);
      const status = normalizePresenceStatus({
        bluetoothOn: input.bluetoothOn,
        checkedAt,
        inRange: input.inRange,
        wifiConnected: input.wifiConnected,
      });
      const nextRoomPresence = {
        beaconConnected: input.bluetoothOn && input.inRange,
        beaconId: normalizedBeaconId,
      };

      transaction.update(reservationRef, {
        presenceMonitorBeaconId: normalizedBeaconId,
        presenceLastHeartbeatAt: serverTimestamp(),
        presenceLastHeartbeatClientAt: checkedAt,
        presenceLastAppState: normalizedAppState,
        presenceLastBluetoothOn: input.bluetoothOn,
        presenceLastInRange: input.inRange,
        presenceLastWifiConnected: input.wifiConnected ?? null,
        presenceLastRssi:
          typeof input.rssi === "number" && Number.isFinite(input.rssi)
            ? input.rssi
            : null,
        presenceStatus: status,
        updatedAt: serverTimestamp(),
      });

      if (shouldSyncRoomPresence(reservation, nextRoomPresence)) {
        transaction.update(db.collection("rooms").doc(reservation.roomId), {
          beaconConnected: nextRoomPresence.beaconConnected,
          beaconDeviceName: nextRoomPresence.beaconConnected
            ? nextRoomPresence.beaconId
            : null,
          beaconLastConnectedAt: nextRoomPresence.beaconConnected
            ? serverTimestamp()
            : null,
          beaconLastDisconnectedAt: nextRoomPresence.beaconConnected
            ? null
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      return {
        healthy: status === "healthy",
        status,
        timedOut: status === "timed_out",
      };
    });
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
      presenceMonitorBeaconId: null,
      presenceMonitoringStartedAt: null,
      presenceStatus: "stopped",
      updatedAt: serverTimestamp(),
    });
    await updateReservationRoomPresence(reservation.roomId, {
      beaconConnected: false,
      beaconId: null,
    });
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
      await reservationRef.update({
        presenceMonitorBeaconId: null,
        presenceMonitoringStartedAt: null,
        presenceStatus: "stopped",
        updatedAt: serverTimestamp(),
      });
      await updateReservationRoomPresence(reservation.roomId, {
        beaconConnected: false,
        beaconId: null,
      });
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
      presenceMonitorBeaconId: null,
      presenceMonitoringStartedAt: null,
      presenceStatus: "stopped",
      updatedAt: serverTimestamp(),
    });

    batch.update(db.collection("rooms").doc(reservation.roomId), {
      beaconConnected: false,
      beaconDeviceName: null,
      beaconLastConnectedAt: null,
      beaconLastDisconnectedAt: serverTimestamp(),
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

    await batch.commit();
    await updateRoomLifecycleStatus(reservation.roomId);
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
    const batch = db.batch();

    reservationsToDelete.forEach((reservationToDelete) => {
      batch.delete(db.collection("reservations").doc(reservationToDelete.id));
    });

    await batch.commit();
    if (reservation.status === "approved") {
      await updateRoomLifecycleStatus(reservation.roomId);
    }
  } catch (error) {
    logReservationServiceError("deleteReservationRecord", error, {
      reservationId,
      userId,
    });
    throw error;
  }
}

export function buildReservationSummary(reservation: ReservationRecord) {
  const equipmentSummary = formatEquipmentSummary(
    reservation.equipment,
    reservation.otherEquipment,
    reservation.otherEquipmentQuantity
  );
  const details = [reservation.purpose, equipmentSummary].filter(Boolean);

  return details.join(" | ");
}
