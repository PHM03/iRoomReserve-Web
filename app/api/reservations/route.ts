import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/domain/roles";
import { handleApiError } from "@/lib/server/api-error";
import { getManagedBuildingIdsForCampus } from "@/lib/campusAssignments";
import { db } from "@/lib/configs/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertOwnsResource,
  assertRole,
} from "@/lib/server/route-guards";
import { createReservationSchema } from "@/lib/server/schemas";
import {
  createRecurringReservationRecord,
  createReservationRecord,
} from "@/lib/server/services/reservations";

export const runtime = "nodejs";

type ReservationQueryRecord = {
  buildingId?: string;
  createdAt?: unknown;
  date?: string;
  id: string;
  startTime?: string;
  status?: string;
} & Record<string, unknown>;

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
  left: ReservationQueryRecord,
  right: ReservationQueryRecord
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

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId")?.trim() ?? "";
    const userId = searchParams.get("userId")?.trim() ?? "";
    const campus = searchParams.get("campus")?.trim().toLowerCase() ?? "";
    const statuses = searchParams
      .get("statuses")
      ?.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean) ?? [];

    if (!roomId && !userId && !campus) {
      return NextResponse.json(
        {
          error: {
            code: "missing_filters",
            message: "roomId, userId, or campus is required.",
          },
        },
        { status: 400 }
      );
    }

    if (userId) {
      assertOwnsResource(authContext, userId);
    }

    if (campus) {
      assertRole(authContext, [USER_ROLES.UTILITY, USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

      if (authContext.role !== USER_ROLES.SUPER_ADMIN && authContext.campus !== campus) {
        return NextResponse.json(
          {
            error: {
              code: "forbidden_campus",
              message: "You can only access reservations for your assigned campus.",
            },
          },
          { status: 403 }
        );
      }
    }

    let reservationsQuery: FirebaseFirestore.Query = db.collection("reservations");

    if (roomId) {
      reservationsQuery = reservationsQuery.where("roomId", "==", roomId);
    }

    if (userId) {
      reservationsQuery = reservationsQuery.where("userId", "==", userId);
    }

    const buildingIds =
      campus === "main" || campus === "digi"
        ? getManagedBuildingIdsForCampus(campus)
        : [];
    const snapshot = await reservationsQuery.get();
    const reservations = snapshot.docs
      .map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as ReservationQueryRecord
      )
      .filter((reservation) =>
        buildingIds.length === 0
          ? true
          : buildingIds.includes(String(reservation.buildingId ?? "").trim().toLowerCase())
      )
      .filter((reservation) =>
        statuses.length === 0
          ? true
          : statuses.includes((reservation.status ?? "").toLowerCase())
      )
      .sort(sortReservations);

    return NextResponse.json(reservations);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const payload = createReservationSchema.parse(await request.json());

    assertOwnsResource(authContext, payload.reservation.userId);

    if (payload.type === "single") {
      const id = await createReservationRecord(payload.reservation);
      return NextResponse.json({ id });
    }

    const ids = await createRecurringReservationRecord(
      payload.reservation,
      payload.selectedDays,
      payload.startDate,
      payload.endDate
    );
    return NextResponse.json({ ids });
  } catch (error) {
    return handleApiError(error);
  }
}
