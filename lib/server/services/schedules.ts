import "server-only";

import { ApiError } from "@/lib/server/api-error";
import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";
import {
  findScheduleConflicts,
  SCHEDULE_CONFLICT_MESSAGE,
  type ScheduleConflictComparable,
} from "@/lib/schedules/scheduleConflicts";

export interface ScheduleCreateInput {
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  courseName: string;
  courseCode: string;
  section: string;
  instructorName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: string;
  academicYear: string;
  createdBy: string;
}

interface StoredScheduleRecord extends ScheduleConflictComparable {
  id: string;
  academicYear: string;
  buildingId: string;
  courseCode: string;
  courseName: string;
  createdBy: string;
  dayOfWeek: number;
  endTime: string;
  instructorName: string;
  roomId: string;
  roomName: string;
  section: string;
  semester: string;
  startTime: string;
  subjectName: string;
}

export async function assertNoScheduleConflict(
  schedule: ScheduleConflictComparable,
  options: { excludeScheduleId?: string | null } = {}
) {
  const snapshot = await db
    .collection("schedules")
    .where("roomId", "==", schedule.roomId)
    .get();

  const conflictingSchedules = findScheduleConflicts(
    snapshot.docs.map((scheduleDoc) => ({
      id: scheduleDoc.id,
      ...(scheduleDoc.data() as Omit<StoredScheduleRecord, "id">),
    })),
    schedule,
    options
  );

  if (conflictingSchedules.length > 0) {
    throw new ApiError(409, "schedule_conflict", SCHEDULE_CONFLICT_MESSAGE, {
      conflictingScheduleIds: conflictingSchedules.map(
        (conflictingSchedule) => conflictingSchedule.id
      ),
    });
  }
}

function assertOverrideMatchesConflicts(
  conflictingSchedules: Array<{ id: string }>,
  overrideScheduleIds: string[]
) {
  const expectedIds = new Set(conflictingSchedules.map((schedule) => schedule.id));
  const requestedIds = new Set(overrideScheduleIds);

  if (
    expectedIds.size !== requestedIds.size ||
    [...expectedIds].some((scheduleId) => !requestedIds.has(scheduleId))
  ) {
    throw new ApiError(409, "schedule_conflict", SCHEDULE_CONFLICT_MESSAGE, {
      conflictingScheduleIds: [...expectedIds],
    });
  }
}

async function getConflictingSchedules(
  schedule: ScheduleConflictComparable,
  options: { excludeScheduleId?: string | null } = {}
) {
  const snapshot = await db
    .collection("schedules")
    .where("roomId", "==", schedule.roomId)
    .get();

  return findScheduleConflicts(
    snapshot.docs.map((scheduleDoc) => ({
      id: scheduleDoc.id,
      ...(scheduleDoc.data() as Omit<StoredScheduleRecord, "id">),
    })),
    schedule,
    options
  );
}

export async function createScheduleRecord(
  data: ScheduleCreateInput,
  overrideScheduleIds: string[] = []
) {
  if (overrideScheduleIds.length > 0) {
    const conflictingSchedules = await getConflictingSchedules(data);
    assertOverrideMatchesConflicts(conflictingSchedules, overrideScheduleIds);

    const scheduleRef = db.collection("schedules").doc();
    const batch = db.batch();
    conflictingSchedules.forEach((schedule) => {
      batch.delete(db.collection("schedules").doc(schedule.id));
    });
    batch.set(scheduleRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return scheduleRef.id;
  }

  const scheduleRef = db.collection("schedules").doc();
  const batch = db.batch();
  batch.set(scheduleRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return scheduleRef.id;
}

export async function updateScheduleRecord(
  scheduleId: string,
  data: Partial<ScheduleCreateInput>,
  options: {
    conflictSchedule?: ScheduleConflictComparable;
    overrideScheduleIds?: string[];
  } = {}
) {
  const overrideScheduleIds = options.overrideScheduleIds ?? [];

  if (overrideScheduleIds.length > 0 && options.conflictSchedule) {
    const conflictingSchedules = await getConflictingSchedules(
      options.conflictSchedule,
      { excludeScheduleId: scheduleId }
    );
    assertOverrideMatchesConflicts(conflictingSchedules, overrideScheduleIds);

    const batch = db.batch();
    conflictingSchedules.forEach((schedule) => {
      batch.delete(db.collection("schedules").doc(schedule.id));
    });
    batch.update(db.collection("schedules").doc(scheduleId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return;
  }

  await db.collection("schedules").doc(scheduleId).update({
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteScheduleRecord(scheduleId: string) {
  await db.collection("schedules").doc(scheduleId).delete();
}
