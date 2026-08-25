import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { inferCampusFromBuilding, type ReservationCampus } from "@/lib/buildings/campuses";
import { USER_ROLES, normalizeRole } from "@/lib/auth/roles";
import { db } from "@/lib/firebase/firebase-admin";
import { ApiError, handleApiError } from "@/lib/server/api-error";
import { createReservationRecord } from "@/lib/server/services/reservations";

export const runtime = "nodejs";

const payloadSchema = z.object({
  dcSpaceEventId: z.string().trim().min(1),
  endAt: z.string().datetime({ offset: true }),
  eventTitle: z.string().trim().min(1),
  locationLabel: z.string().trim().min(1),
  requestedByEmail: z.string().trim().toLowerCase().email(),
  startAt: z.string().datetime({ offset: true }),
  // Required only when the requester is a Main Campus student.
  advisorEmail: z.string().trim().toLowerCase().email().optional(),
});

function formatReservationTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  return {
    date: `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`,
    time: `${valueFor("hour")}:${valueFor("minute")}`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.DC_SPACE_RESERVATION_CREATE_SECRET?.trim();
    const authorization = request.headers.get("authorization");

    if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Unauthorized." } },
        { status: 401 }
      );
    }

    const payload = payloadSchema.parse(await request.json());
    const [existingReservationSnapshot, requesterSnapshot, roomSnapshot] =
      await Promise.all([
        db
          .collection("reservations")
          .where("dcSpaceEventId", "==", payload.dcSpaceEventId)
          .limit(1)
          .get(),
        db
          .collection("users")
          .where("email", "==", payload.requestedByEmail)
          .where("status", "==", "approved")
          .limit(1)
          .get(),
        db.collection("rooms").where("name", "==", payload.locationLabel).limit(2).get(),
      ]);

    if (!existingReservationSnapshot.empty) {
      const existingReservation = existingReservationSnapshot.docs[0];
      return NextResponse.json({
        ok: true,
        reservationId: existingReservation.id,
        dcSpaceEventId: payload.dcSpaceEventId,
      });
    }

    if (requesterSnapshot.empty) {
      throw new ApiError(
        404,
        "requester_not_found",
        "No approved e-RoomReserve user matches requestedByEmail."
      );
    }

    if (roomSnapshot.empty) {
      throw new ApiError(
        404,
        "room_not_found",
        "No e-RoomReserve room matches locationLabel."
      );
    }
    if (roomSnapshot.size > 1) {
      throw new ApiError(
        409,
        "ambiguous_room",
        "locationLabel matches more than one e-RoomReserve room."
      );
    }

    const requesterDoc = requesterSnapshot.docs[0];
    const requester = requesterDoc.data() as {
      firstName?: string;
      lastName?: string;
      organizationName?: string | null;
      role?: string | null;
    };
    const roomDoc = roomSnapshot.docs[0];
    const room = roomDoc.data() as {
      buildingId?: string;
      buildingName?: string;
      campus?: string | null;
      name?: string;
    };

    if (!room.buildingId || !room.buildingName || !room.name) {
      throw new ApiError(400, "invalid_room", "The matched room is incomplete.");
    }

    const userRole = normalizeRole(requester.role) ?? USER_ROLES.STUDENT;
    const campus = inferCampusFromBuilding({
      id: room.buildingId,
      campus: room.campus,
      name: room.buildingName,
    }) as ReservationCampus | null;
    if (!campus) {
      throw new ApiError(400, "invalid_room", "The matched room has no campus.");
    }

    if (campus === "main" && userRole === USER_ROLES.STUDENT && !payload.advisorEmail) {
      throw new ApiError(
        400,
        "missing_advisor_email",
        "Main Campus student events require advisorEmail."
      );
    }

    const start = formatReservationTime(new Date(payload.startAt));
    const end = formatReservationTime(new Date(payload.endAt));
    if (start.date !== end.date || start.time >= end.time) {
      throw new ApiError(
        400,
        "invalid_event_window",
        "Events must start and end on the same date in the Asia/Manila time zone."
      );
    }

    const userName = [requester.firstName, requester.lastName]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ") || payload.requestedByEmail;
    const reservationId = await createReservationRecord({
      dcSpaceEventId: payload.dcSpaceEventId,
      userId: requesterDoc.id,
      userName,
      userRole,
      roomId: roomDoc.id,
      roomName: room.name,
      buildingId: room.buildingId,
      buildingName: room.buildingName,
      campus,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      programDepartmentOrganization:
        requester.organizationName?.trim() || "DC Space event",
      purpose: payload.eventTitle,
      isEvent: "Yes",
      ...(campus === "main" && payload.advisorEmail
        ? { advisorEmail: payload.advisorEmail }
        : {}),
    });

    return NextResponse.json(
      { ok: true, reservationId, dcSpaceEventId: payload.dcSpaceEventId },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
