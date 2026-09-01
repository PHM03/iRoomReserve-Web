import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  type DocumentData,
  type Query,
  Unsubscribe,
  where,
  Timestamp,
} from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import { auth, db } from "@/lib/firebase/firebase";
import { formatTime } from "@/lib/utils/dateTime";
import { createGuardedSnapshotCallback } from "@/lib/firebase/firestoreListener";
import { normalizeRole, USER_ROLES } from "@/lib/auth/roles";
import { getManagedBuildingIdsForCampus, resolveCampusAssignment } from "@/lib/buildings/campusAssignments";
import {
  doesScheduleMatchContext,
  type ScheduleAcademicYear,
  type ScheduleContext,
  type ScheduleSemester,
} from "@/lib/schedules/scheduleContext";

export interface Schedule {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  courseName?: string;
  courseCode?: string;
  section?: string;
  instructorName: string;
  /** Kept for future faculty schedule matching; intentionally not displayed. */
  professorEmail?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: ScheduleSemester;
  academicYear: ScheduleAcademicYear;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ScheduleInput = Omit<Schedule, "id" | "createdAt" | "updatedAt">;

type ScheduleRoomAccessScope =
  | { kind: "all" }
  | { kind: "buildings"; buildingIds: string[] }
  | { kind: "rooms"; roomIds: string[] };

async function getScheduleRoomAccessScope(): Promise<ScheduleRoomAccessScope> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return { kind: "rooms", roomIds: [] };
  }

  const profileSnapshot = await getDoc(doc(db, "users", uid));
  if (!profileSnapshot.exists()) {
    return { kind: "rooms", roomIds: [] };
  }

  const profile = profileSnapshot.data() as {
    role?: string;
    status?: string;
    assignedBuilding?: unknown;
    assignedBuildingId?: unknown;
    assignedBuildingIds?: unknown;
    assignedBuildings?: unknown;
  };
  const role = normalizeRole(profile.role);
  if (role === USER_ROLES.UTILITY) {
    if (
      typeof profile.status !== "string" ||
      profile.status.trim().toLowerCase() !== "approved"
    ) {
      return { kind: "buildings", buildingIds: [] };
    }

    const { campus } = resolveCampusAssignment(profile);
    return {
      kind: "buildings",
      buildingIds: getManagedBuildingIdsForCampus(campus),
    };
  }

  return { kind: "all" };
}

function buildBuildingQueriesForScope(
  scope: ScheduleRoomAccessScope,
  requestedBuildingIds: string[]
) {
  const uniqueRequestedBuildingIds = [...new Set(requestedBuildingIds.filter(Boolean))];

  if (scope.kind === "all") {
    return chunkValues(uniqueRequestedBuildingIds, 10).map((buildingChunk) =>
      query(collection(db, "schedules"), where("buildingId", "in", buildingChunk))
    );
  }

  if (scope.kind === "buildings") {
    const authorizedBuildingIds = uniqueRequestedBuildingIds.filter((buildingId) =>
      scope.buildingIds.includes(buildingId)
    );

    return chunkValues(authorizedBuildingIds, 10).map((buildingChunk) =>
      query(collection(db, "schedules"), where("buildingId", "in", buildingChunk))
    );
  }

  return buildBuildingRoomQueries(uniqueRequestedBuildingIds, scope.roomIds);
}

function mapScheduleDocument(scheduleDoc: { id: string; data: () => DocumentData }): Schedule {
  return {
    id: scheduleDoc.id,
    ...scheduleDoc.data(),
  } as Schedule;
}

function subscribeToScheduleQueries(
  queries: Query<DocumentData>[],
  activeContext: ScheduleContext | null,
  callback: (schedules: Schedule[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  if (queries.length === 0) {
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  const schedulesByQuery = new Map<number, Schedule[]>();
  const emit = () => {
    const schedules = [...schedulesByQuery.values()].flat();
    listener.emit(
      (activeContext ? filterSchedulesByContext(schedules, activeContext) : schedules).sort(
        sortSchedules
      )
    );
  };

  const unsubscribers = queries.map((scheduleQuery, queryIndex) =>
    onSnapshot(
      scheduleQuery,
      (snapshot) => {
        if (listener.isCancelled()) {
          return;
        }
        schedulesByQuery.set(queryIndex, snapshot.docs.map(mapScheduleDocument));
        emit();
      },
      (error) => {
        if (!listener.isCancelled()) {
          console.warn("Firestore listener error (schedule authorization query):", error);
          onError?.(error);
        }
      }
    )
  );

  return listener.wrap(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));
}

function buildBuildingRoomQueries(buildingIds: string[], roomIds: string[]) {
  const queries: Query<DocumentData>[] = [];
  const uniqueBuildingIds = [...new Set(buildingIds.filter(Boolean))];
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean))];

  for (const buildingId of uniqueBuildingIds) {
    for (const roomId of uniqueRoomIds) {
      queries.push(
        query(
          collection(db, "schedules"),
          where("buildingId", "==", buildingId),
          where("roomId", "==", roomId)
        )
      );
    }
  }

  return queries;
}

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

export function getScheduleDisplayTitle(schedule: Pick<Schedule, "courseCode" | "section" | "subjectName">): string {
  const courseCode = schedule.courseCode?.trim() ?? "";
  const section = schedule.section?.trim() ?? "";

  if (courseCode && section) {
    return `${courseCode} - ${section}`;
  }

  return courseCode || section || schedule.subjectName;
}

export async function addSchedule(
  data: ScheduleInput,
  overrideScheduleIds: string[] = []
): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/schedules", {
    body:
      overrideScheduleIds.length > 0
        ? { ...data, overrideScheduleIds }
        : data,
    method: "POST",
  });

  return payload.id;
}

export interface ProfessorEmailEligibility {
  registeredEmails: string[];
  nonFacultyEmails: string[];
}

export async function getProfessorEmailEligibility(
  emails: string[]
): Promise<ProfessorEmailEligibility> {
  const normalizedEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (normalizedEmails.length === 0) return { registeredEmails: [], nonFacultyEmails: [] };

  return apiRequest<ProfessorEmailEligibility>(
    "/api/schedules/professor-registration",
    { body: { emails: normalizedEmails }, method: "POST" }
  );
}

export async function updateSchedule(
  scheduleId: string,
  data: Partial<Omit<Schedule, "id" | "createdAt" | "updatedAt">>,
  overrideScheduleIds: string[] = []
): Promise<void> {
  await apiRequest(`/api/schedules/${scheduleId}`, {
    body:
      overrideScheduleIds.length > 0
        ? { ...data, overrideScheduleIds }
        : data,
    method: "PATCH",
  });
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  await apiRequest(`/api/schedules/${scheduleId}`, { method: "DELETE" });
}

export async function clearRoomSchedules(input: {
  roomId: string;
  buildingId: string;
  semester: ScheduleSemester;
  academicYear: ScheduleAcademicYear;
}): Promise<number> {
  const payload = await apiRequest<{ deletedCount: number }>("/api/schedules", {
    method: "DELETE",
    params: input,
  });

  return payload.deletedCount;
}

function filterSchedulesByContext(
  schedules: Schedule[],
  context: ScheduleContext
) {
  return schedules.filter((schedule) => doesScheduleMatchContext(schedule, context));
}

export function onSchedulesByBuilding(
  buildingId: string,
  activeContextOrCallback: ScheduleContext | ((schedules: Schedule[]) => void),
  maybeCallback?: (schedules: Schedule[]) => void
): Unsubscribe {
  const activeContext =
    typeof activeContextOrCallback === "function"
      ? null
      : activeContextOrCallback;
  const callback =
    typeof activeContextOrCallback === "function"
      ? activeContextOrCallback
      : maybeCallback;

  if (!callback) {
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  let cancelled = false;
  let unsubscribe: Unsubscribe = () => {};

  void getScheduleRoomAccessScope()
    .then((scope) => {
      if (cancelled) {
        return;
      }

      const queries =
        scope.kind === "all"
          ? [query(collection(db, "schedules"), where("buildingId", "==", buildingId))]
          : scope.kind === "buildings"
            ? scope.buildingIds.includes(buildingId)
              ? [query(collection(db, "schedules"), where("buildingId", "==", buildingId))]
              : []
            : buildBuildingRoomQueries([buildingId], scope.roomIds);

      unsubscribe = subscribeToScheduleQueries(queries, activeContext, (schedules) => {
        listener.emit(schedules);
      });
    })
    .catch((error) => {
      if (!cancelled) {
        console.warn("Unable to load schedule authorization context:", error);
      }
    });

  return listener.wrap(() => {
    cancelled = true;
    unsubscribe();
  });
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
  callback: (schedules: Schedule[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const uniqueBuildingIds = [...new Set(buildingIds.filter(Boolean))];
  if (uniqueBuildingIds.length === 0) {
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  let cancelled = false;
  let unsubscribe: Unsubscribe = () => {};

  void getScheduleRoomAccessScope()
    .then((scope) => {
      if (cancelled) {
        return;
      }

      const queries = buildBuildingQueriesForScope(scope, uniqueBuildingIds);

      if (queries.length === 0) {
        listener.emit([]);
        return;
      }

      unsubscribe = subscribeToScheduleQueries(
        queries,
        null,
        (schedules) => {
          listener.emit(schedules);
        },
        onError
      );
    })
    .catch((error) => {
      if (!cancelled) {
        console.warn("Unable to load schedule authorization context:", error);
        onError?.(error);
      }
    });

  return listener.wrap(() => {
    cancelled = true;
    unsubscribe();
  });
}

/**
 * Subscribe to schedules for a specific building, filtered to a set of room IDs.
 *
 * Including `buildingId` in the query is critical: Firestore security rules
 * cannot evaluate `resource.data.buildingId` when it is absent from the query
 * constraints, causing the entire `roomId IN [...]` query to be rejected with a
 * permission error. Adding the equality filter makes every returned document
 * provably accessible under the building-admin rule.
 */
export function onSchedulesByBuildingRoomIds(
  buildingId: string,
  roomIds: string[],
  activeContext: ScheduleContext,
  callback: (schedules: Schedule[]) => void
): Unsubscribe {
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean))];

  console.log('[schedules] onSchedulesByBuildingRoomIds', {
    buildingId,
    uniqueRoomIds,
  });

  if (!buildingId || uniqueRoomIds.length === 0) {
    console.warn('[schedules] onSchedulesByBuildingRoomIds: empty buildingId or roomIds — skipping query.');
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  let cancelled = false;
  let unsubscribe: Unsubscribe = () => {};

  void getScheduleRoomAccessScope()
    .then((scope) => {
      if (cancelled) {
        return;
      }

      const queryRoomIds =
        scope.kind === "all"
          ? uniqueRoomIds
          : scope.kind === "buildings"
            ? scope.buildingIds.includes(buildingId)
              ? uniqueRoomIds
              : []
            : uniqueRoomIds.filter((roomId) => scope.roomIds.includes(roomId));
      unsubscribe = subscribeToScheduleQueries(
        buildBuildingRoomQueries([buildingId], queryRoomIds),
        activeContext,
        (schedules) => listener.emit(schedules)
      );
    })
    .catch((error) => {
      if (!cancelled) {
        console.warn("Unable to load schedule authorization context:", error);
      }
    });

  return listener.wrap(() => {
    cancelled = true;
    unsubscribe();
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
  const listener = createGuardedSnapshotCallback(callback);
  let cancelled = false;
  let unsubscribe: Unsubscribe = () => {};

  void getScheduleRoomAccessScope()
    .then((scope) => {
      if (cancelled) {
        return;
      }

      const queries =
        scope.kind === "all"
          ? [query(collection(db, "schedules"))]
          : scope.kind === "buildings"
            ? buildBuildingQueriesForScope(scope, scope.buildingIds)
            : scope.roomIds.map((roomId) =>
                query(collection(db, "schedules"), where("roomId", "==", roomId))
              );
      unsubscribe = subscribeToScheduleQueries(queries, null, (schedules) => {
        listener.emit(schedules);
      });
    })
    .catch((error) => {
      if (!cancelled) {
        console.warn("Unable to load schedule authorization context:", error);
      }
    });

  return listener.wrap(() => {
    cancelled = true;
    unsubscribe();
  });
}
