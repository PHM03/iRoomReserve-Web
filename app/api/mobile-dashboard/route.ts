import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { getManagedBuildingIdsForCampus } from "@/lib/buildings/campusAssignments";
import { db } from "@/lib/firebase/firebase-admin";
import { groupReservationsForDisplay } from "@/lib/reservations/reservation-groups";
import {
  DEFAULT_RESERVATION_TIME_ZONE,
  getCurrentDateTimeStringInTimeZone,
} from "@/lib/rooms/roomStatus";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertRole,
} from "@/lib/server/route-guards";
import { confirmFinishedReservationRecord } from "@/lib/server/services/reservations";

export const runtime = "nodejs";

type ReservationStatus = "pending" | "approved" | "completed";

type DashboardReservationRecord = {
  id: string;
  date?: string;
  endTime?: string;
  startTime?: string;
  status?: string;
  checkedInAt?: unknown;
  occupancyReleasedAt?: unknown;
  buildingId?: string;
  roomId?: string;
  createdAt?: unknown;
} & Record<string, unknown>;

type DashboardRoomRecord = {
  id: string;
  beaconId?: string | null;
  name: string;
  floor: string;
  roomType: string;
  acStatus: string;
  tvProjectorStatus: string;
  capacity: number;
  status: string;
  buildingId: string;
  buildingName: string;
  reservedBy: string | null;
  activeReservationId?: string | null;
};

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

function sortReservations(
  left: DashboardReservationRecord,
  right: DashboardReservationRecord
) {
  const createdAtOrder =
    getTimestampSeconds(right.createdAt) - getTimestampSeconds(left.createdAt);

  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return (
    (right.date ?? "").localeCompare(left.date ?? "") ||
    (right.startTime ?? "").localeCompare(left.startTime ?? "") ||
    right.id.localeCompare(left.id)
  );
}

function isAwaitingStaffReleaseReservation(
  reservation: DashboardReservationRecord
) {
  return (
    reservation.status === "completed" &&
    Boolean(reservation.checkedInAt) &&
    !reservation.occupancyReleasedAt
  );
}

function isCurrentAwaitingStaffReleaseReservation(
  reservation: DashboardReservationRecord,
  todayDateKey: string
) {
  return (
    isAwaitingStaffReleaseReservation(reservation) &&
    reservation.date === todayDateKey
  );
}

function isExpiredAwaitingStaffReleaseReservation(
  reservation: DashboardReservationRecord,
  todayDateKey: string
) {
  return (
    isAwaitingStaffReleaseReservation(reservation) &&
    typeof reservation.date === "string" &&
    reservation.date < todayDateKey
  );
}

function isCurrentOrFutureReservation(
  reservation: DashboardReservationRecord,
  todayDateKey: string,
  currentTimeKey: string
) {
  return (
    typeof reservation.date === "string" &&
    typeof reservation.endTime === "string" &&
    (reservation.date > todayDateKey ||
      (reservation.date === todayDateKey &&
        reservation.endTime > currentTimeKey))
  );
}

async function getReservationsForBuildingIds(
  buildingIds: string[],
  statuses: ReservationStatus[]
) {
  const snapshots = await Promise.all(
    buildingIds.map((buildingId) =>
      db
        .collection("reservations")
        .where("buildingId", "==", buildingId)
        .where("status", "in", statuses)
        .get()
    )
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as DashboardReservationRecord
    )
  );
}

async function getRoomsByIds(roomIds: string[]) {
  if (roomIds.length === 0) {
    return [];
  }

  const roomSnapshots = await Promise.all(
    roomIds.map((roomId) => db.collection("rooms").doc(roomId).get())
  );

  return roomSnapshots
    .filter((roomSnapshot) => roomSnapshot.exists)
    .map((roomSnapshot) => {
      const data = roomSnapshot.data() as {
        beaconId?: string | null;
        bleBeaconId?: string | null;
        name?: string;
        floor?: string;
        roomType?: string;
        acStatus?: string;
        tvProjectorStatus?: string;
        capacity?: number;
        status?: string;
        buildingId?: string;
        buildingName?: string;
        reservedBy?: string | null;
        activeReservationId?: string | null;
      };

      return {
        id: roomSnapshot.id,
        beaconId:
          typeof data.bleBeaconId === "string" &&
          data.bleBeaconId.trim().length > 0
            ? data.bleBeaconId.trim()
            : typeof data.beaconId === "string" &&
                data.beaconId.trim().length > 0
              ? data.beaconId.trim()
              : null,
        name: data.name ?? "",
        floor: data.floor ?? "",
        roomType: data.roomType ?? "",
        acStatus: data.acStatus ?? "",
        tvProjectorStatus: data.tvProjectorStatus ?? "",
        capacity: data.capacity ?? 0,
        status: data.status ?? "Available",
        buildingId: data.buildingId ?? "",
        buildingName: data.buildingName ?? "",
        reservedBy: data.reservedBy ?? null,
        activeReservationId: data.activeReservationId ?? null,
      } satisfies DashboardRoomRecord;
    })
    .sort(
      (left, right) =>
        left.buildingName.localeCompare(right.buildingName) ||
        left.floor.localeCompare(right.floor) ||
        left.name.localeCompare(right.name)
    );
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const profileSnapshot = await db.collection("users").doc(authContext.uid!).get();
    const profile = profileSnapshot.exists
      ? (profileSnapshot.data() as {
          campus?: "digi" | "main" | null;
          firstName?: string | null;
          role?: string | null;
        })
      : null;
    const firstName = profile?.firstName?.trim() || null;
    const userRole = profile?.role?.trim() || authContext.role || null;
    const assignedCampus =
      profile?.campus === "main" || profile?.campus === "digi"
        ? profile.campus
        : authContext.campus;
    const { date: todayDateKey, time: currentTimeKey } =
      getCurrentDateTimeStringInTimeZone(
        new Date(),
        DEFAULT_RESERVATION_TIME_ZONE
      );

    let reservations: DashboardReservationRecord[] = [];

    if (userRole === USER_ROLES.UTILITY) {
      assertRole(authContext, [
        USER_ROLES.UTILITY,
        USER_ROLES.ADMIN,
        USER_ROLES.SUPER_ADMIN,
      ]);

      if (assignedCampus === "main" || assignedCampus === "digi") {
        const buildingIds = [
          ...new Set(
            getManagedBuildingIdsForCampus(assignedCampus).map((value) =>
              value.trim()
            )
          ),
        ];
        reservations = await getReservationsForBuildingIds(buildingIds, [
          "approved",
          "completed",
        ]);
      }

      const stalePendingFinishReservations = reservations.filter((reservation) =>
        isExpiredAwaitingStaffReleaseReservation(reservation, todayDateKey)
      );

      if (stalePendingFinishReservations.length > 0) {
        await Promise.all(
          stalePendingFinishReservations.map((reservation) =>
            confirmFinishedReservationRecord(reservation.id, authContext.uid!)
          )
        );

        if (assignedCampus === "main" || assignedCampus === "digi") {
          const buildingIds = [
            ...new Set(
              getManagedBuildingIdsForCampus(assignedCampus).map((value) =>
                value.trim()
              )
            ),
          ];
          reservations = await getReservationsForBuildingIds(buildingIds, [
            "approved",
            "completed",
          ]);
        }
      }

      reservations = reservations
        .filter(
          (reservation) =>
            (reservation.status === "approved" &&
              Boolean(reservation.checkedInAt) &&
              reservation.date === todayDateKey &&
              reservation.startTime <= currentTimeKey &&
              reservation.endTime > currentTimeKey) ||
            isCurrentAwaitingStaffReleaseReservation(
              reservation,
              todayDateKey
            )
        )
        .sort(sortReservations);
    } else {
      reservations = (
        await db
          .collection("reservations")
          .where("userId", "==", authContext.uid)
          .where("status", "in", ["pending", "approved", "completed"])
          .get()
      ).docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as DashboardReservationRecord
      );

      reservations = groupReservationsForDisplay(
        reservations.filter(
          (reservation) =>
            (reservation.status === "pending" &&
              isCurrentOrFutureReservation(
                reservation,
                todayDateKey,
                currentTimeKey
              )) ||
            (reservation.status === "approved" &&
              isCurrentOrFutureReservation(
                reservation,
                todayDateKey,
                currentTimeKey
              )) ||
            isAwaitingStaffReleaseReservation(reservation)
        )
      ) as DashboardReservationRecord[];
    }

    const roomIds = [
      ...new Set(
        reservations
          .map((reservation) => reservation.roomId)
          .filter((roomId): roomId is string => typeof roomId === "string")
      ),
    ];
    const rooms = await getRoomsByIds(roomIds);

    return NextResponse.json({
      assignedCampus: assignedCampus ?? null,
      firstName,
      reservations,
      rooms,
      userRole,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
