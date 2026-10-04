import { NextRequest, NextResponse } from "next/server";

import { normalizeRole, USER_ROLES } from "@/lib/auth/roles";
import { ApiError } from "@/lib/server/api-error";
import { handleApiError } from "@/lib/server/api-error";
import { getManagedBuildingIdsForCampus } from "@/lib/buildings/campusAssignments";
import { db } from "@/lib/firebase/firebase-admin";
import { groupReservationsForDisplay } from "@/lib/reservations/reservation-groups";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertOwnsResource,
  assertRole,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import { createReservationSchema } from "@/lib/server/schemas";
import { writeAuditLog } from "@/lib/server/services/audit-logs";
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

function applyStatusFilters(
  reservationsQuery: FirebaseFirestore.Query,
  statuses: string[]
) {
  if (statuses.length === 1) {
    return reservationsQuery.where("status", "==", statuses[0]);
  }

  if (statuses.length > 1) {
    return reservationsQuery.where("status", "in", statuses);
  }

  return reservationsQuery;
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

    if (statuses.length > 10) {
      return NextResponse.json(
        {
          error: {
            code: "too_many_status_filters",
            message: "A maximum of 10 statuses can be requested at once.",
          },
        },
        { status: 400 }
      );
    }

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
        ? [...new Set(getManagedBuildingIdsForCampus(campus).map((value) => value.trim()))]
        : [];
    const snapshots =
      buildingIds.length > 0
        ? await Promise.all(
            buildingIds.map((buildingId) =>
              applyStatusFilters(
                reservationsQuery.where("buildingId", "==", buildingId),
                statuses
              ).get()
            )
          )
        : [await applyStatusFilters(reservationsQuery, statuses).get()];
    const reservations = snapshots.flatMap((snapshot) =>
      snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as ReservationQueryRecord
      )
    );

    const normalizedReservations =
      roomId || (!userId && !campus)
        ? reservations.sort(sortReservations)
        : groupReservationsForDisplay(reservations);

    return NextResponse.json(normalizedReservations);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  let failureAuditContext: Awaited<ReturnType<typeof getRequestAuthContext>> | null = null;
  let failedReservationDetails: { roomId: string; roomName: string; date?: string; startTime: string; endTime: string } | null = null;
  let reservationCreated = false;
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    failureAuditContext = authContext;
    assertVerifiedAuthentication(authContext);

    const payload = createReservationSchema.parse(await request.json());
    failedReservationDetails = {
      roomId: payload.reservation.roomId,
      roomName: payload.reservation.roomName,
      date: "date" in payload.reservation ? payload.reservation.date : undefined,
      startTime: payload.reservation.startTime,
      endTime: payload.reservation.endTime,
    };

    assertOwnsResource(authContext, payload.reservation.userId);

    const authenticatedRole = authContext.role;
    if (
      !authenticatedRole ||
      normalizeRole(payload.reservation.userRole) !== authenticatedRole
    ) {
      throw new ApiError(
        403,
        "forbidden",
        "Reservation role does not match the authenticated account."
      );
    }
    payload.reservation.userRole = authenticatedRole;

    if (payload.type === "single") {
      const id = await createReservationRecord(payload.reservation);
      reservationCreated = true;
      await writeAuditLog(authContext, {
        action: "reservation.created",
        entityType: "reservation",
        entityId: id,
        targetUserId: payload.reservation.userId,
        campus: payload.reservation.campus,
        buildingId: payload.reservation.buildingId,
        buildingName: payload.reservation.buildingName,
        summary: `Reserved ${payload.reservation.roomName}`,
        metadata: {
          roomId: payload.reservation.roomId,
          roomName: payload.reservation.roomName,
          date: payload.reservation.date,
          startTime: payload.reservation.startTime,
          endTime: payload.reservation.endTime,
          organization: payload.reservation.programDepartmentOrganization,
          purpose: payload.reservation.purpose,
          eventName: payload.reservation.isEvent === "Yes" ? payload.reservation.purpose : null,
          conceptPaperAttached: Boolean(payload.reservation.approvalDocumentPath),
        },
      });
      if (payload.reservation.approvalDocumentPath) {
        await writeAuditLog(authContext, {
          action: "reservation.document_uploaded",
          entityType: "reservation",
          entityId: id,
          targetUserId: payload.reservation.userId,
          campus: payload.reservation.campus,
          buildingId: payload.reservation.buildingId,
          buildingName: payload.reservation.buildingName,
          summary: "Linked the submitted concept paper to this reservation",
          metadata: { roomId: payload.reservation.roomId, roomName: payload.reservation.roomName },
        });
      }
      return NextResponse.json({ id });
    }

    const ids = await createRecurringReservationRecord(
      payload.reservation,
      payload.selectedDays,
      payload.startDate,
      payload.endDate
    );
    reservationCreated = true;
    await Promise.all(
      ids.map(async (id) => {
        const createdReservationSnapshot = await db.collection("reservations").doc(id).get();
        const createdReservationData = createdReservationSnapshot.data() as { date?: string } | undefined;
        await writeAuditLog(authContext, {
          action: "reservation.created",
          entityType: "reservation",
          entityId: id,
          targetUserId: payload.reservation.userId,
          campus: payload.reservation.campus,
          buildingId: payload.reservation.buildingId,
          buildingName: payload.reservation.buildingName,
          summary: `Reserved ${payload.reservation.roomName}`,
          metadata: {
            roomId: payload.reservation.roomId,
            roomName: payload.reservation.roomName,
            date: createdReservationData?.date ?? null,
            organization: payload.reservation.programDepartmentOrganization,
            purpose: payload.reservation.purpose,
            eventName: payload.reservation.isEvent === "Yes" ? payload.reservation.purpose : null,
            conceptPaperAttached: Boolean(payload.reservation.approvalDocumentPath),
            startTime: payload.reservation.startTime,
            endTime: payload.reservation.endTime,
          },
        });
        if (payload.reservation.approvalDocumentPath) {
          await writeAuditLog(authContext, {
            action: "reservation.document_uploaded",
            entityType: "reservation",
            entityId: id,
            targetUserId: payload.reservation.userId,
            campus: payload.reservation.campus,
            buildingId: payload.reservation.buildingId,
            buildingName: payload.reservation.buildingName,
            summary: "Linked the submitted concept paper to this reservation",
            metadata: { roomId: payload.reservation.roomId, roomName: payload.reservation.roomName },
          });
        }
      })
    );
    return NextResponse.json({ ids });
  } catch (error) {
    if (!reservationCreated && failureAuditContext?.uid && failureAuditContext.verified) {
      try {
        await writeAuditLog(failureAuditContext, {
          action: "reservation.action_failed",
          entityType: "account",
          entityId: failureAuditContext.uid,
          reservationId: null,
          targetUserId: failureAuditContext.uid,
          outcome: "failure",
          summary: "Reservation submission failed",
          remarks: error instanceof Error ? error.message.slice(0, 500) : "Request failed",
          metadata: {
            attemptedAction: "create",
            ...(failedReservationDetails ? {
              roomId: failedReservationDetails.roomId,
              roomName: failedReservationDetails.roomName,
              startTime: failedReservationDetails.startTime,
              endTime: failedReservationDetails.endTime,
              ...(failedReservationDetails.date ? { date: failedReservationDetails.date } : {}),
            } : {}),
          },
        });
      } catch {
        // Keep the original reservation API result if the failure record cannot be written.
      }
    }
    return handleApiError(error);
  }
}
