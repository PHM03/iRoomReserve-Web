import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { inferCampusFromBuilding } from '@/lib/buildings/campuses';
import { ApiError, handleApiError } from '@/lib/server/api-error';
import { assertReservationDatesAvailable } from '@/lib/server/services/reservations';
import { extractReservationDetails } from '@/lib/server/services/room-reservation-ai';
import { db } from '@/lib/firebase/firebase-admin';
import { getRequestAuthContext } from '@/lib/server/request-auth';
import { assertVerifiedAuthentication } from '@/lib/server/route-guards';

export const runtime = "nodejs";

const chatTurnSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('assistant'),
    content: z.string().trim().min(1).max(700),
  }),
  z.object({
    role: z.literal('user'),
    content: z.string().trim().min(1).max(300),
  }),
]);

const extractRequestSchema = z.object({
  action: z.literal('extract'),
  messages: z.array(chatTurnSchema).min(1).max(12),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().trim().min(1).max(80),
});

const availabilityRequestSchema = z.object({
  action: z.literal('check-availability'),
  roomIds: z.array(z.string().trim().min(1).max(160)).min(1).max(4),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const requestSchema = z.discriminatedUnion('action', [
  extractRequestSchema,
  availabilityRequestSchema,
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
  };
  if (!room.buildingId) {
    return { available: false, message: 'This room has no building assignment.', roomId: input.roomId, status: 'unavailable' as const };
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
      [input.date]
    );
    return {
      available: true,
      buildingId: room.buildingId,
      buildingName: room.buildingName ?? '',
      campus: inferCampusFromBuilding({ id: room.buildingId, name: room.buildingName }),
      message: 'No current reservation, room schedule, manual unavailability, or user timeslot conflict was found.',
      roomId: input.roomId,
      roomName: room.name ?? input.roomId,
      status: 'available' as const,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return {
        available: false,
        buildingId: room.buildingId,
        buildingName: room.buildingName ?? '',
        campus: inferCampusFromBuilding({ id: room.buildingId, name: room.buildingName }),
        message: error.message,
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
