import {
  collection,
  addDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ──────────────────────────────────────────────────────
export interface RoomHistoryEntry {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  userName: string;
  userRole: string;
  date: string;
  startTime: string;
  endTime: string;
  type: "reservation" | "scheduled_class";
  purpose: string;
  sourceId: string;
  status: string;
  createdAt?: Timestamp;
}

export type RoomHistoryInput = Omit<RoomHistoryEntry, "id" | "createdAt">;

// ─── Add Room History Entry ─────────────────────────────────────
export async function addRoomHistoryEntry(
  data: RoomHistoryInput
): Promise<string> {
  const docRef = await addDoc(collection(db, "roomHistory"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ─── Real-time Room History by Building ─────────────────────────
export function onRoomHistoryByBuilding(
  buildingId: string,
  callback: (entries: RoomHistoryEntry[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "roomHistory"),
    where("buildingId", "==", buildingId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const entries: RoomHistoryEntry[] = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as RoomHistoryEntry))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;
          return bTime - aTime;
        });
      callback(entries);
    },
    (error) => {
      console.warn("Firestore listener error (roomHistory):", error);
    }
  );
}
