import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { reservationChatExtractionRequestSchema } from '@/lib/ai/reservationChat';
import { inferCampusFromBuilding } from '@/lib/buildings/campuses';
import { isCampusManagedBuilding } from '@/lib/buildings/campusAssignments';
import { RESERVATION_CAMPUS_OPERATING_HOURS } from '@/lib/reservations/timeSlots';
import { ApiError, handleApiError } from '@/lib/server/api-error';
import { assertReservationDatesAvailable, getRoomDaySchedule } from '@/lib/server/services/reservations';
import { extractReservationDetails } from '@/lib/server/services/room-reservation-ai';
import { db } from '@/lib/firebase/firebase-admin';
import { getRequestAuthContext } from '@/lib/server/request-auth';
import { assertVerifiedAuthentication } from '@/lib/server/route-guards';

export const runtime = "nodejs";

const availabilityRequestSchema = z.object({
  action: z.literal('check-availability'),
  roomIds: z.array(z.string().trim().min(1).max(160)).min(1).max(4),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
}).strict();

const roomDayScheduleRequestSchema = z.object({
  action: z.literal('room-day-schedule'),
  roomId: z.string().trim().min(1).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

const requestSchema = z.discriminatedUnion('action', [
  reservationChatExtractionRequestSchema,
  availabilityRequestSchema,
  roomDayScheduleRequestSchema,
]);

function assertValidDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'invalid_date', 'Choose a valid reservation date.');
  }
}

function assertValidTimeRange(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59 ||
    end <= start
  ) {
    throw new ApiError(400, 'invalid_time_range', 'The end time must be after the start time.');
  }
}

async function checkRoomAvailability(input: {
  date: string;
  endTime: string;
  roomId: string;
  startTime: string;
  userId: string;
}) {
  const roomSnapshot = await db.collection('rooms').doc(input.roomId).get();
  if (!roomSnapshot.exists) {
    return { available: false, message: 'This room is no longer in the room list.', roomId: input.roomId, status: 'unavailable' as const };
  }

  const room = roomSnapshot.data() as {
    buildingId?: string;
    buildingName?: string;
    name?: string;
    status?: string;
  };
  if (!room.buildingId) {
    return { available: false, message: 'This room has no building assignment.', roomId: input.roomId, status: 'unavailable' as const };
  }

  const buildingSnapshot = await db.collection('buildings').doc(room.buildingId).get();
  const buildingName = typeof buildingSnapshot.data()?.name === 'string'
    ? buildingSnapshot.data()?.name as string
    : room.buildingName ?? '';
  const campus = inferCampusFromBuilding({
    id: room.buildingId,
    name: buildingName,
    campus: typeof buildingSnapshot.data()?.campus === 'string'
      ? buildingSnapshot.data()?.campus as string
      : undefined,
  });
  if (!buildingSnapshot.exists || !campus || !isCampusManagedBuilding(campus, room.buildingId)) {
    return {
      available: false,
      message: 'This room’s campus, building, or operating hours could not be verified.',
      roomId: input.roomId,
      status: 'unavailable' as const,
    };
  }
  const operatingHours = RESERVATION_CAMPUS_OPERATING_HOURS[campus];
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  const requestedDate = new Date(`${input.date}T00:00:00.000Z`);
  if (
    requestedDate.getUTCDay() === 0 ||
    toMinutes(input.startTime) < operatingHours.startMinutes ||
    toMinutes(input.endTime) > operatingHours.endMinutes ||
    toMinutes(input.startTime) % 60 !== 0 ||
    toMinutes(input.endTime) % 60 !== 0 ||
    toMinutes(input.endTime) - toMinutes(input.startTime) < 60
  ) {
    return {
      available: false,
      buildingId: room.buildingId,
      campus,
      conflictingIntervals: [{
        startTime: `${String(Math.floor(operatingHours.startMinutes / 60)).padStart(2, '0')}:00`,
        endTime: `${String(Math.floor(operatingHours.endMinutes / 60)).padStart(2, '0')}:00`,
        kind: 'outside operating hours',
      }],
      message: `Choose a schedule within ${campus === 'main' ? 'Main Campus' : 'Digital Campus'} hours, in full-hour increments of at least one hour; reservations are not allowed on Sundays.`,
      roomId: input.roomId,
      roomName: room.name ?? input.roomId,
      status: 'unavailable' as const,
    };
  }
  try {
    await assertReservationDatesAvailable(
      {
        userId: input.userId,
        roomId: input.roomId,
        buildingId: room.buildingId,
        startTime: input.startTime,
        endTime: input.endTime,
      },
      [input.date],
      { requireScheduleContext: true }
    );
    return {
      available: true,
      buildingId: room.buildingId,
      buildingName: room.buildingName ?? '',
      campus,
      message: 'No current reservation, room schedule, manual unavailability, or user timeslot conflict was found.',
      roomId: input.roomId,
      roomName: room.name ?? input.roomId,
      status: 'available' as const,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const details = error.details && typeof error.details === 'object'
        ? error.details as { conflictingIntervals?: unknown; reason?: unknown }
        : null;
      let conflictingIntervals = Array.isArray(details?.conflictingIntervals)
        ? details.conflictingIntervals
        : details?.reason === 'administrative_unavailable'
          ? [{
              startTime: `${String(Math.floor(operatingHours.startMinutes / 60)).padStart(2, '0')}:00`,
              endTime: `${String(Math.floor(operatingHours.endMinutes / 60)).padStart(2, '0')}:00`,
              kind: 'administrative room restriction',
            }]
          : [];
      try {
        const daySchedule = await getRoomDaySchedule(input.roomId, input.date);
        const requestedStart = toMinutes(input.startTime);
        const requestedEnd = toMinutes(input.endTime);
        const overlappingIntervals = daySchedule.intervals
          .filter((interval) =>
            toMinutes(interval.startTime) < requestedEnd &&
            toMinutes(interval.endTime) > requestedStart
          )
          .map((interval) => ({
            startTime: interval.startTime,
            endTime: interval.endTime,
            kind: interval.kind,
          }));
        if (overlappingIntervals.length) conflictingIntervals = overlappingIntervals;
      } catch {
        // Keep the validated conflict response if the informational lookup fails.
      }
      return {
        available: false,
        buildingId: room.buildingId,
        buildingName: room.buildingName ?? '',
        campus,
        message: error.message,
        conflictingIntervals,
        roomId: input.roomId,
        roomName: room.name ?? input.roomId,
        status: 'unavailable' as const,
      };
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    const payload = requestSchema.parse(await request.json());

    if (payload.action === 'extract') {
      try {
        new Intl.DateTimeFormat('en', { timeZone: payload.timeZone });
      } catch {
        throw new ApiError(400, 'invalid_time_zone', 'The local time zone is invalid.');
      }

      return NextResponse.json({
        extraction: await extractReservationDetails(payload),
      });
    }

    if (payload.action === 'room-day-schedule') {
      assertValidDate(payload.date);
      return NextResponse.json({ schedule: await getRoomDaySchedule(payload.roomId, payload.date) });
    }

    assertValidDate(payload.date);
    assertValidTimeRange(payload.startTime, payload.endTime);
    const userId = authContext.uid;
    if (!userId) {
      throw new ApiError(401, 'unauthenticated', 'A verified authentication token is required.');
    }

    const checks = await Promise.all(
      [...new Set(payload.roomIds)].map((roomId) =>
        checkRoomAvailability({ ...payload, roomId, userId })
      )
    );
    return NextResponse.json({ checks });
  } catch (error) {
    return handleApiError(error);
  }
}
