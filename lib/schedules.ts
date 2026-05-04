import {
  collection,
  onSnapshot,
  query,
  Unsubscribe,
  where,
  Timestamp,
} from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import { auth, db } from "@/lib/configs/firebase";
import { formatTime } from "./dateTime";
import { createGuardedSnapshotCallback } from "@/lib/firestoreListener";

export interface Schedule {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  instructorName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ScheduleInput = Omit<Schedule, "id" | "createdAt" | "updatedAt">;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function sortSchedules(left: Schedule, right: Schedule) {
  return (
    left.dayOfWeek - right.dayOfWeek ||
    left.startTime.localeCompare(right.startTime) ||
    left.roomName.localeCompare(right.roomName)
  );
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function formatTime12h(time24: string): string {
  return formatTime(time24);
}

export async function addSchedule(data: ScheduleInput): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/schedules", {
    body: data,
    method: "POST",
  });

  return payload.id;
}

export async function updateSchedule(
  scheduleId: string,
  data: Partial<Omit<Schedule, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  await apiRequest(`/api/schedules/${scheduleId}`, {
    body: data,
    method: "PATCH",
  });
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  await apiRequest(`/api/schedules/${scheduleId}`, {
    method: "DELETE",
  });
}

export function onSchedulesByBuilding(
  buildingId: string,
  callback: (schedules: Schedule[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "schedules"),
    where("buildingId", "==", buildingId)
  );
  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const schedules: Schedule[] = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Schedule)
        .sort(sortSchedules);
      console.log("[schedules] onSchedulesByBuilding snapshot", {
        buildingId,
        count: schedules.length,
        empty: schedules.length === 0,
      });
      listener.emit(schedules);
    },
    (error) => {
      if (listener.isCancelled()) {
        return;
      }
      console.log("[schedules] onSchedulesByBuilding error", {
        buildingId,
        error,
      });
      console.warn("Firestore listener error (schedules):", error);
    }
  );
  return listener.wrap(unsubscribe);
}

export async function getSchedulesByRoomId(roomId: string): Promise<Schedule[]> {
  const payload = await apiRequest<Schedule[]>("/api/schedules", {
    method: "GET",
    params: { roomId },
    userId: auth.currentUser?.uid,
  });

  console.log("[schedules] Schedule API response:", payload);

  const schedules = payload
    .map((schedule) => ({
      ...schedule,
      dayOfWeek:
        typeof schedule.dayOfWeek === "number"
          ? schedule.dayOfWeek
          : Number(schedule.dayOfWeek) || 0,
    }))
    .sort(sortSchedules);

  console.log("[schedules] getSchedulesByRoomId result", {
    roomId,
    count: schedules.length,
    empty: schedules.length === 0,
  });

  return schedules;
}

export function onSchedulesByBuildingIds(
  buildingIds: string[],
  callback: (schedules: Schedule[]) => void
): Unsubscribe {
  const uniqueBuildingIds = [...new Set(buildingIds.filter(Boolean))];
  if (uniqueBuildingIds.length === 0) {
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  const schedulesByChunk = new Map<number, Schedule[]>();
  const buildingChunks = chunkValues(uniqueBuildingIds, 10);

  const emit = () => {
    listener.emit([...schedulesByChunk.values()].flat().sort(sortSchedules));
  };

  const unsubscribers = buildingChunks.map((buildingChunk, chunkIndex) =>
    onSnapshot(
      query(collection(db, "schedules"), where("buildingId", "in", buildingChunk)),
      (snapshot) => {
        if (listener.isCancelled()) {
          return;
        }
        schedulesByChunk.set(
          chunkIndex,
          snapshot.docs.map((scheduleDoc) => ({
            id: scheduleDoc.id,
            ...scheduleDoc.data(),
          })) as Schedule[]
        );
        emit();
      },
      (error) => {
        if (listener.isCancelled()) {
          return;
        }
        console.warn("Firestore listener error (schedules by building ids):", error);
      }
    )
  );

  return listener.wrap(() => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });
}

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
      (schedule) =>
        schedule.roomId === roomId &&
        schedule.dayOfWeek === currentDay &&
        schedule.startTime <= currentTime &&
        schedule.endTime > currentTime
    ) ?? null
  );
}

export function onAllSchedules(
  callback: (schedules: Schedule[]) => void
): Unsubscribe {
  const q = query(collection(db, "schedules"));
  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const schedules: Schedule[] = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Schedule)
        .sort(sortSchedules);
      listener.emit(schedules);
    },
    (error) => {
      if (listener.isCancelled()) {
        return;
      }
      console.warn("Firestore listener error (all schedules):", error);
    }
  );
  return listener.wrap(unsubscribe);
}
