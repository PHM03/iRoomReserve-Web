import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ──────────────────────────────────────────────────────
export interface Schedule {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  instructorName: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "08:00" (24h)
  endTime: string;   // "09:30" (24h)
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ScheduleInput = Omit<Schedule, "id" | "createdAt" | "updatedAt">;

// ─── Day-of-week helpers ────────────────────────────────────────
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// ─── Add Schedule ───────────────────────────────────────────────
export async function addSchedule(data: ScheduleInput): Promise<string> {
  const docRef = await addDoc(collection(db, "schedules"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

// ─── Update Schedule ────────────────────────────────────────────
export async function updateSchedule(
  scheduleId: string,
  data: Partial<Omit<Schedule, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  await updateDoc(doc(db, "schedules", scheduleId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── Delete Schedule ────────────────────────────────────────────
export async function deleteSchedule(scheduleId: string): Promise<void> {
  await deleteDoc(doc(db, "schedules", scheduleId));
}

// ─── Real-time Schedules by Building ────────────────────────────
export function onSchedulesByBuilding(
  buildingId: string,
  callback: (schedules: Schedule[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "schedules"),
    where("buildingId", "==", buildingId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const schedules: Schedule[] = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as Schedule))
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
      callback(schedules);
    },
    (error) => {
      console.warn("Firestore listener error (schedules):", error);
    }
  );
}

// ─── Check if a room is currently in a scheduled class ──────────
export function isRoomInClass(
  schedules: Schedule[],
  roomId: string,
  now: Date = new Date()
): Schedule | null {
  const currentDay = now.getDay();
  const currentTime =
    now.getHours().toString().padStart(2, "0") +
    ":" +
    now.getMinutes().toString().padStart(2, "0");

  return (
    schedules.find(
      (s) =>
        s.roomId === roomId &&
        s.dayOfWeek === currentDay &&
        s.startTime <= currentTime &&
        s.endTime > currentTime
    ) || null
  );
}
