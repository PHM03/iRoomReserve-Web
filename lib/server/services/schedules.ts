import "server-only";

import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { serverClientDb } from "@/lib/server/firebase-client";

export interface ScheduleCreateInput {
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  instructorName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdBy: string;
}

export async function createScheduleRecord(data: ScheduleCreateInput) {
  const scheduleRef = doc(collection(serverClientDb, "schedules"));
  const batch = writeBatch(serverClientDb);
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
  await updateDoc(doc(serverClientDb, "schedules", scheduleId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteScheduleRecord(scheduleId: string) {
  await deleteDoc(doc(serverClientDb, "schedules", scheduleId));
}
