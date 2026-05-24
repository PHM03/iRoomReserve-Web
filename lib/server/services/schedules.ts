import "server-only";

import { db, serverTimestamp } from "@/lib/firebase/firebase-admin";

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

export async function createScheduleRecord(data: ScheduleCreateInput) {
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
  data: Partial<ScheduleCreateInput>
) {
  await db.collection("schedules").doc(scheduleId).update({
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteScheduleRecord(scheduleId: string) {
  await db.collection("schedules").doc(scheduleId).delete();
}
