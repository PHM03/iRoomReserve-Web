import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getCurrentApprovalStep } from "@/lib/reservations/reservation-approval";
import { groupReservationsForDisplay } from "@/lib/reservations/reservation-groups";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { createReservationDocumentSignedUrl } from "@/lib/server/supabase-storage";
import {
  assertAuthenticated,
  assertCanManageBuilding,
} from "@/lib/server/route-guards";

type DashboardAdminRequest = {
  createdAt?: unknown;
  id: string;
} & Record<string, unknown>;

type DashboardNotification = {
  createdAt?: unknown;
  id: string;
} & Record<string, unknown>;

type DashboardReservation = {
  approvalFlow?: unknown;
  createdAt?: unknown;
  currentStep?: number;
  date?: string;
  id: string;
  startTime?: string;
  status?: string;
} & Record<string, unknown>;

type DashboardRoom = {
  buildingName?: string;
  floor?: string;
  id: string;
  name?: string;
} & Record<string, unknown>;

type DashboardRoomHistoryEntry = {
  createdAt?: unknown;
  id: string;
} & Record<string, unknown>;

type DashboardSchedule = {
  dayOfWeek?: number;
  id: string;
  roomName?: string;
  startTime?: string;
} & Record<string, unknown>;

type DashboardSummary = {
  activeBeacons: number;
  availableRooms: number;
  occupiedRooms: number;
  pendingRequests: number;
  pendingPreviewLimit: number | null;
  reservedRooms: number;
  roomPreviewLimit: number | null;
  roomsHasMore: boolean;
  totalBeacons: number;
  totalRooms: number;
  unavailableRooms: number;
};

const ROOM_STATUS_FILTERS = new Set([
  "Available",
  "Reserved",
  "Occupied",
  "Unavailable",
]);

function getTimestampSeconds(value: unknown) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const candidate = value as {
    seconds?: unknown;
    _seconds?: unknown;
  };

  if (typeof candidate.seconds === "number") {
    return candidate.seconds;
  }

  if (typeof candidate._seconds === "number") {
    return candidate._seconds;
  }

  return 0;
}

function sortByCreatedAtDesc<T extends { id: string; createdAt?: unknown }>(
  left: T,
  right: T
) {
  const leftSeconds = getTimestampSeconds(left.createdAt);
  const rightSeconds = getTimestampSeconds(right.createdAt);

  return rightSeconds - leftSeconds || left.id.localeCompare(right.id);
}

function sortRooms<
  T extends {
    buildingName?: string;
    floor?: string;
    name?: string;
  },
>(left: T, right: T) {
  return (
    (left.buildingName ?? "").localeCompare(right.buildingName ?? "") ||
    (left.floor ?? "").localeCompare(right.floor ?? "") ||
    (left.name ?? "").localeCompare(right.name ?? "")
  );
}

function sortSchedules<
  T extends {
    dayOfWeek?: number;
    startTime?: string;
    roomName?: string;
  },
>(left: T, right: T) {
  return (
    (left.dayOfWeek ?? 0) - (right.dayOfWeek ?? 0) ||
    (left.startTime ?? "").localeCompare(right.startTime ?? "") ||
    (left.roomName ?? "").localeCompare(right.roomName ?? "")
  );
}

function sortReservations<
  T extends {
    id: string;
    date?: string;
    startTime?: string;
    createdAt?: unknown;
  },
>(left: T, right: T) {
  const createdAtOrder = sortByCreatedAtDesc(left, right);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return (
    (right.date ?? "").localeCompare(left.date ?? "") ||
    (right.startTime ?? "").localeCompare(left.startTime ?? "") ||
    right.id.localeCompare(left.id)
  );
}

function isVisiblePendingReservationForBuildingAdmin(
  reservation: DashboardReservation
) {
  if (reservation.status !== "pending") {
    return false;
  }

  const currentStep = getCurrentApprovalStep(
    Array.isArray(reservation.approvalFlow) ? reservation.approvalFlow : undefined,
    typeof reservation.currentStep === "number" ? reservation.currentStep : undefined
  );

  return currentStep?.role === "building_admin";
}

function parseBooleanFlag(value: string | null, defaultValue: boolean) {
  if (value === null) {
    return defaultValue;
  }

  return value !== "false";
}

function parsePositiveInteger(value: string | null) {
  if (!value) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function parseDayOfWeek(value: string | null) {
  if (!value) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 6) {
    return null;
  }

  return parsedValue;
}

function normalizeRoomStatusFilter(value: string | null) {
  const trimmedValue = value?.trim() ?? "";
  return ROOM_STATUS_FILTERS.has(trimmedValue) ? trimmedValue : null;
}

function matchesRoomSearch(room: DashboardRoom, searchValue: string) {
  if (!searchValue) {
    return true;
  }

  const searchableText = [
    room.name,
    room.floor,
    room.roomType,
    room.status,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return searchableText.includes(searchValue);
}

function normalizeBeaconId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function hasConfiguredBeacon(room: DashboardRoom) {
  return Boolean(
    normalizeBeaconId(room.bleBeaconId) ?? normalizeBeaconId(room.beaconId)
  );
}

async function getAggregateCount(query: FirebaseFirestore.Query) {
  const snapshot = await query.count().get();
  return snapshot.data().count ?? 0;
}

async function getApprovalDocumentUrl(reservation: DashboardReservation) {
  const storedUrl =
    typeof reservation.approvalDocumentUrl === "string"
      ? reservation.approvalDocumentUrl
      : null;

  try {
    return (
      (await createReservationDocumentSignedUrl({ path: typeof reservation.approvalDocumentPath === "string" ? reservation.approvalDocumentPath : null })) ?? storedUrl
    );
  } catch (error) {
    console.warn("Failed to resolve reservation approval document URL", {
      error,
      reservationId: reservation.id,
    });
    return storedUrl;
  }
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { searchParams } = new URL(request.url);
    const buildingId = searchParams.get("buildingId")?.trim() ?? "";
    const includeRooms = parseBooleanFlag(searchParams.get("includeRooms"), true);
    const includeApprovedReservations = parseBooleanFlag(
      searchParams.get("includeApprovedReservations"),
      true
    );
    const includePendingRequests = parseBooleanFlag(
      searchParams.get("includePendingRequests"),
      true
    );
    const includeSchedules = parseBooleanFlag(
      searchParams.get("includeSchedules"),
      true
    );
    const includeRoomHistory = parseBooleanFlag(
      searchParams.get("includeRoomHistory"),
      true
    );
    const includeSummary = parseBooleanFlag(
      searchParams.get("includeSummary"),
      false
    );
    const roomLimit = parsePositiveInteger(searchParams.get("roomLimit"));
    const pendingLimit = parsePositiveInteger(searchParams.get("pendingLimit"));
    const reservationDate = searchParams.get("reservationDate")?.trim() || null;
    const scheduleDayOfWeek = parseDayOfWeek(searchParams.get("scheduleDayOfWeek"));
    const roomStatusFilter = normalizeRoomStatusFilter(searchParams.get("roomStatus"));
    const roomSearch = searchParams.get("roomSearch")?.trim().toLowerCase() ?? "";

    if (!buildingId) {
      return NextResponse.json(
        {
          error: {
            code: "missing_building_id",
            message: "buildingId is required."
          }
        },
        { status: 400 }
      );
    }

    assertCanManageBuilding(authContext, buildingId);

    const adminDb = getOptionalAdminDb();
    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    const roomsBaseQuery = adminDb
      .collection("rooms")
      .where("buildingId", "==", buildingId);
    const roomPreviewQuery = roomStatusFilter
      ? roomsBaseQuery.where("status", "==", roomStatusFilter)
      : roomsBaseQuery;
    const roomFetchLimit = roomLimit
      ? roomSearch
        ? Math.max(roomLimit * 8, 40)
        : Math.max(roomLimit * 4, 20)
      : null;
    const approvedReservationsBaseQuery = adminDb
      .collection("reservations")
      .where("buildingId", "==", buildingId)
      .where("status", "==", "approved");
    const approvedReservationsQuery = reservationDate
      ? approvedReservationsBaseQuery.where("date", "==", reservationDate)
      : approvedReservationsBaseQuery;
    const pendingReservationsQuery = adminDb
      .collection("reservations")
      .where("buildingId", "==", buildingId)
      .where("status", "==", "pending");
    const schedulesBaseQuery = adminDb
      .collection("schedules")
      .where("buildingId", "==", buildingId);
    const schedulesQuery =
      scheduleDayOfWeek === null
        ? schedulesBaseQuery
        : schedulesBaseQuery.where("dayOfWeek", "==", scheduleDayOfWeek);

    const [
      roomSummarySnapshot,
      roomsSnapshot,
      approvedReservationsSnapshot,
      pendingReservationsSnapshot,
      schedulesSnapshot,
      roomHistorySnapshot,
      pendingRequestCount,
    ] = await Promise.all([
      includeSummary ? roomsBaseQuery.get() : Promise.resolve(null),
      includeRooms
        ? (roomFetchLimit ? roomPreviewQuery.limit(roomFetchLimit) : roomPreviewQuery)
            .get()
        : Promise.resolve(null),
      includeApprovedReservations
        ? approvedReservationsQuery.get()
        : Promise.resolve(null),
      includePendingRequests
        ? pendingReservationsQuery.get()
        : Promise.resolve(null),
      includeSchedules
        ? schedulesQuery.get()
        : Promise.resolve(null),
      includeRoomHistory
        ? adminDb.collection("roomHistory").where("buildingId", "==", buildingId).get()
        : Promise.resolve(null),
      includeSummary
        ? getAggregateCount(pendingReservationsQuery)
        : Promise.resolve(null),
    ]);

    const allSummaryRooms = (roomSummarySnapshot?.docs ?? [])
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }) as DashboardRoom)
      .sort(sortRooms);
    const summaryStatusCounts = allSummaryRooms.reduce(
      (counts, room) => {
        switch (room.status) {
          case "Available":
            counts.availableRooms += 1;
            break;
          case "Reserved":
            counts.reservedRooms += 1;
            break;
          case "Occupied":
            counts.occupiedRooms += 1;
            break;
          case "Unavailable":
            counts.unavailableRooms += 1;
            break;
          default:
            break;
        }

        if (hasConfiguredBeacon(room)) {
          counts.totalBeacons += 1;

          if (room.beaconConnected === true) {
            counts.activeBeacons += 1;
          }
        }

        return counts;
      },
      {
        activeBeacons: 0,
        availableRooms: 0,
        occupiedRooms: 0,
        reservedRooms: 0,
        totalBeacons: 0,
        unavailableRooms: 0,
      }
    );
    const roomPreviewTotal = roomSummarySnapshot
      ? allSummaryRooms.filter((room) => {
          if (roomStatusFilter && room.status !== roomStatusFilter) {
            return false;
          }

          return matchesRoomSearch(room, roomSearch);
        }).length
      : 0;
    const rooms = roomsSnapshot
      ? roomsSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data()
        }) as DashboardRoom)
          .filter((room) => matchesRoomSearch(room, roomSearch))
          .sort(sortRooms)
          .slice(0, roomLimit ?? undefined)
      : [];
    const allReservations = (approvedReservationsSnapshot?.docs ?? [])
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }) as DashboardReservation)
      .sort(sortReservations);
    const pendingRequests = (pendingReservationsSnapshot?.docs ?? [])
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }) as DashboardReservation)
      .filter(isVisiblePendingReservationForBuildingAdmin);
    const allRequests = groupReservationsForDisplay(
      pendingRequests.sort(sortReservations)
    );
    const requests = await Promise.all(
      (pendingLimit ? allRequests.slice(0, pendingLimit) : allRequests).map(
        async (reservation) => ({
          ...reservation,
          approvalDocumentUrl: await getApprovalDocumentUrl(reservation),
        })
      )
    );
    const schedules = (schedulesSnapshot?.docs ?? [])
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }) as DashboardSchedule)
      .sort(sortSchedules);
    const roomHistory = (roomHistorySnapshot?.docs ?? [])
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }) as DashboardRoomHistoryEntry)
      .sort(sortByCreatedAtDesc);
    const summary: DashboardSummary | null = roomSummarySnapshot
      ? {
          activeBeacons: summaryStatusCounts.activeBeacons,
          availableRooms: summaryStatusCounts.availableRooms,
          occupiedRooms: summaryStatusCounts.occupiedRooms,
          pendingRequests: includePendingRequests ? allRequests.length : (pendingRequestCount ?? 0),
          pendingPreviewLimit: pendingLimit,
          reservedRooms: summaryStatusCounts.reservedRooms,
          roomPreviewLimit: roomLimit,
          roomsHasMore:
            !roomSearch && roomLimit !== null
              ? roomPreviewTotal > rooms.length
              : roomsSnapshot !== null && roomsSnapshot.size > rooms.length,
          totalBeacons: summaryStatusCounts.totalBeacons,
          totalRooms: allSummaryRooms.length,
          unavailableRooms: summaryStatusCounts.unavailableRooms,
        }
      : null;

    return NextResponse.json({
      adminRequests: [] as DashboardAdminRequest[],
      allReservations,
      notifications: [] as DashboardNotification[],
      requests,
      roomHistory,
      rooms,
      schedules,
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
