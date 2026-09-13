import { getManagedBuildingIdsForCampus } from "../buildings/campusAssignments";
import {
  inferCampusFromBuilding,
  type ReservationCampus,
} from "../buildings/campuses";

export const MAIN_CAMPUS_INBOX_BUILDING_IDS = [
  ...getManagedBuildingIdsForCampus("main"),
] as const;

export function getBuildingAdminInboxBuildingIds(
  campus: ReservationCampus | null | undefined,
  selectedBuildingId?: string | null,
): string[] {
  if (campus === "main") {
    return [...MAIN_CAMPUS_INBOX_BUILDING_IDS];
  }

  return selectedBuildingId ? [selectedBuildingId] : [];
}

interface BuildingScopedInboxRecord {
  id: string;
  buildingId?: string;
  buildingName?: string;
  campus?: string;
}

/**
 * Keeps the Firestore ordering intact while excluding explicitly tagged
 * records outside the requested campus scope. Untagged legacy messages are
 * retained because their originating building cannot be determined safely.
 */
export function filterInboxMessagesByBuildingScope<
  T extends BuildingScopedInboxRecord,
>(records: readonly T[], buildingIds: readonly string[]): T[] {
  if (buildingIds.length === 0) {
    return [...records];
  }

  const allowedBuildingIds = new Set(
    buildingIds.map((buildingId) => buildingId.trim().toLowerCase()),
  );
  const seenRecordIds = new Set<string>();

  return records.filter((record) => {
    if (seenRecordIds.has(record.id)) {
      return false;
    }
    seenRecordIds.add(record.id);

    const buildingId = record.buildingId?.trim().toLowerCase();
    if (buildingId && !allowedBuildingIds.has(buildingId)) {
      return false;
    }

    const recordCampus = inferCampusFromBuilding({
      id: record.buildingId,
      name: record.buildingName,
      campus: record.campus,
    });

    return recordCampus !== "digi";
  });
}
