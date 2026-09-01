import "server-only";

import { ApiError } from "@/lib/server/api-error";
import { isFacultyRole } from "@/lib/auth/roles";
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
  professorEmail: string;
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
  professorEmail: string;
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

export interface ProfessorEmailEligibility {
  registeredEmails: string[];
  nonFacultyEmails: string[];
}

export async function getProfessorEmailEligibility(
  emails: string[]
): Promise<ProfessorEmailEligibility> {
  const uniqueEmails = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  const registeredEmails = new Set<string>();
  const nonFacultyEmails = new Set<string>();

  for (let index = 0; index < uniqueEmails.length; index += 10) {
    const snapshot = await db
      .collection("users")
      .where("email", "in", uniqueEmails.slice(index, index + 10))
      .get();
    snapshot.docs.forEach((user) => {
      const data = user.data() as { email?: unknown; role?: unknown };
      if (typeof data.email !== "string") return;

      const email = data.email.trim().toLowerCase();
      registeredEmails.add(email);
      if (!isFacultyRole(typeof data.role === "string" ? data.role : null)) {
        nonFacultyEmails.add(email);
      }
    });
  }

  return {
    registeredEmails: [...registeredEmails],
    nonFacultyEmails: [...nonFacultyEmails],
  };
}

export async function assertProfessorEmailsAreEligible(emails: string[]) {
  const { nonFacultyEmails } = await getProfessorEmailEligibility(emails);
  if (nonFacultyEmails.length > 0) {
    throw new ApiError(
      400,
      "invalid_professor_email_role",
      "Professor email is registered to an account that does not have the Faculty Professor role."
    );
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
