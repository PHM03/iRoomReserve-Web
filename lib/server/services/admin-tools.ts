import "server-only";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import { normalizeRole } from "@/lib/domain/roles";
import { serverClientDb } from "@/lib/server/firebase-client";

const DEFAULT_BUILDINGS = [
  {
    id: "sdca-main-campus",
    name: "SDCA Main Campus",
    code: "MAIN",
    campus: "main",
    address: "Emilio Aguinaldo Highway, Bacoor, Cavite",
    floors: 5,
  },
  {
    id: "sdca-digital-campus",
    name: "SDCA Digital Campus",
    code: "DIGITAL",
    campus: "digi",
    address: "Emilio Aguinaldo Highway, Bacoor, Cavite",
    floors: 3,
  },
] as const;

export async function seedDefaultBuildings() {
  const existingSnapshot = await getDocs(query(collection(serverClientDb, "buildings")));
  const existingIds = new Set(existingSnapshot.docs.map((buildingDoc) => buildingDoc.id));
  const created: string[] = [];
  const skipped: string[] = [];

  for (const building of DEFAULT_BUILDINGS) {
    if (existingIds.has(building.id)) {
      skipped.push(building.name);
      continue;
    }

    await setDoc(doc(serverClientDb, "buildings", building.id), {
      ...building,
      assignedAdminUid: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    created.push(building.name);
  }

  return { created, skipped };
}

export async function migrateUserRoles() {
  const usersSnapshot = await getDocs(query(collection(serverClientDb, "users")));
  const batch = writeBatch(serverClientDb);
  let updated = 0;

  usersSnapshot.docs.forEach((userDoc) => {
    const nextRole = normalizeRole((userDoc.data() as { role?: string }).role);
    if (!nextRole || userDoc.data().role === nextRole) {
      return;
    }

    batch.update(userDoc.ref, {
      role: nextRole,
      updatedAt: serverTimestamp(),
    });
    updated += 1;
  });

  if (updated > 0) {
    await batch.commit();
  }

  return { updated };
}
