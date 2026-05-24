import {
  collection,
  doc,
  documentId,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { inferCampusFromBuilding, type ReservationCampus } from "@/lib/buildings/campuses";
import { apiRequest } from "@/lib/api/client";
import { db } from "@/lib/firebase/firebase";
import { createGuardedSnapshotCallback } from "@/lib/firebase/firestoreListener";
import {
  normalizeScheduleContext,
  type ScheduleAcademicYear,
  type ScheduleSemester,
} from "@/lib/schedules/scheduleContext";

// ─── Types ──────────────────────────────────────────────────────
export interface Building {
  id: string;
  name: string;
  code: string;
  address: string;
  floors: number;
  campus: ReservationCampus;
  assignedAdminUid: string | null;
  activeScheduleSemester: ScheduleSemester;
  activeScheduleAcademicYear: ScheduleAcademicYear;
  createdAt?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
}

function mapBuilding(
  buildingId: string,
  data: Omit<Building, "id" | "campus" | "activeScheduleSemester" | "activeScheduleAcademicYear"> & {
    campus?: string | null;
    activeScheduleSemester?: string | null;
    activeScheduleAcademicYear?: string | null;
  }
): Building {
  const activeScheduleContext = normalizeScheduleContext({
    academicYear: data.activeScheduleAcademicYear,
    semester: data.activeScheduleSemester,
  });

  return {
    id: buildingId,
    ...data,
    campus:
      inferCampusFromBuilding({
        id: buildingId,
        code: data.code,
        name: data.name,
        campus: data.campus,
      }) ?? "main",
    activeScheduleSemester: activeScheduleContext.semester,
    activeScheduleAcademicYear: activeScheduleContext.academicYear,
  };
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

// ─── Get All Buildings ──────────────────────────────────────────
export async function getBuildings(): Promise<Building[]> {
  const snap = await getDocs(
    query(collection(db, "buildings"), orderBy("name"))
  );
  return snap.docs.map((d) =>
    mapBuilding(
      d.id,
      d.data() as Omit<Building, "id" | "campus"> & { campus?: string | null }
    )
  );
}

// ─── Get Available Buildings (no admin assigned) ────────────────
export async function getAvailableBuildings(): Promise<Building[]> {
  const all = await getBuildings();
  return all.filter((b) => !b.assignedAdminUid);
}

// ─── Get Building by ID ─────────────────────────────────────────
export async function getBuildingById(buildingId: string): Promise<Building | null> {
  const snap = await getDoc(doc(db, "buildings", buildingId));
  if (snap.exists()) {
    return mapBuilding(
      snap.id,
      snap.data() as Omit<Building, "id" | "campus"> & { campus?: string | null }
    );
  }
  return null;
}

export async function updateBuildingScheduleContext(
  buildingId: string,
  input: {
    academicYear: ScheduleAcademicYear;
    semester: ScheduleSemester;
  }
): Promise<void> {
  await apiRequest(`/api/buildings/${buildingId}/schedule-context`, {
    method: "PATCH",
    body: input,
  });
}

// ─── Get Building Assigned to a Specific Admin ──────────────────
export async function getBuildingByAdmin(adminUid: string): Promise<Building | null> {
  const q = query(
    collection(db, "buildings"),
    where("assignedAdminUid", "==", adminUid)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return mapBuilding(
    d.id,
    d.data() as Omit<Building, "id" | "campus"> & { campus?: string | null }
  );
}

// ─── Assign Admin to Building ───────────────────────────────────
export async function assignAdminToBuilding(
  buildingId: string,
  adminUid: string
): Promise<void> {
  await updateDoc(doc(db, "buildings", buildingId), {
    assignedAdminUid: adminUid,
    updatedAt: serverTimestamp(),
  });
}

// ─── Unassign Admin from Building ───────────────────────────────
export async function unassignAdminFromBuilding(
  buildingId: string
): Promise<void> {
  await updateDoc(doc(db, "buildings", buildingId), {
    assignedAdminUid: null,
    updatedAt: serverTimestamp(),
  });
}

// ─── Real-time Listener for All Buildings ───────────────────────
export function onBuildings(
  callback: (buildings: Building[]) => void
): Unsubscribe {
  const q = query(collection(db, "buildings"), orderBy("name"));
  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const buildings: Building[] = snapshot.docs.map((d) =>
        mapBuilding(
          d.id,
          d.data() as Omit<Building, "id" | "campus"> & { campus?: string | null }
        )
      );
      listener.emit(buildings);
    },
    (error) => {
      if (listener.isCancelled()) {
        return;
      }

      console.warn("Firestore listener error (buildings):", error);
    }
  );

  return listener.wrap(unsubscribe);
}

export function onBuildingById(
  buildingId: string,
  callback: (building: Building | null) => void
): Unsubscribe {
  if (!buildingId) {
    callback(null);
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  const unsubscribe = onSnapshot(
    doc(db, "buildings", buildingId),
    (snapshot) => {
      if (listener.isCancelled()) {
        return;
      }

      if (!snapshot.exists()) {
        listener.emit(null);
        return;
      }

      listener.emit(
        mapBuilding(
          snapshot.id,
          snapshot.data() as Omit<Building, "id" | "campus"> & { campus?: string | null }
        )
      );
    },
    (error) => {
      if (listener.isCancelled()) {
        return;
      }

      console.warn("Firestore listener error (building by id):", error);
    }
  );

  return listener.wrap(unsubscribe);
}

export function onBuildingsByIds(
  buildingIds: string[],
  callback: (buildings: Building[]) => void
): Unsubscribe {
  const uniqueBuildingIds = [...new Set(buildingIds.filter(Boolean))];
  if (uniqueBuildingIds.length === 0) {
    return () => {};
  }

  const listener = createGuardedSnapshotCallback(callback);
  const buildingsByChunk = new Map<number, Building[]>();
  const buildingIdChunks = chunkValues(uniqueBuildingIds, 10);

  const emit = () => {
    listener.emit(
      [...buildingsByChunk.values()]
        .flat()
        .sort((left, right) => left.name.localeCompare(right.name))
    );
  };

  const unsubscribers = buildingIdChunks.map((buildingIdChunk, chunkIndex) =>
    onSnapshot(
      query(collection(db, "buildings"), where(documentId(), "in", buildingIdChunk)),
      (snapshot) => {
        if (listener.isCancelled()) {
          return;
        }

        buildingsByChunk.set(
          chunkIndex,
          snapshot.docs.map((buildingDoc) =>
            mapBuilding(
              buildingDoc.id,
              buildingDoc.data() as Omit<Building, "id" | "campus"> & {
                campus?: string | null;
              }
            )
          )
        );
        emit();
      },
      (error) => {
        if (listener.isCancelled()) {
          return;
        }

        console.warn("Firestore listener error (buildings by ids):", error);
      }
    )
  );

  return listener.wrap(() => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });
}
