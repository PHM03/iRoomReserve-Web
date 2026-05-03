import { normalizeAssignedBuildings, type AssignedBuildingReference } from "./assignedBuildings";
import {
  inferCampusFromBuilding,
  normalizeCampus,
  type ReservationCampus,
} from "./campuses";

export type CampusName = "SDCA Main Campus" | "SDCA Digi Campus";

interface CampusAssignmentInput {
  assignedBuilding?: unknown;
  assignedBuildingId?: unknown;
  assignedBuildingIds?: unknown;
  assignedBuildings?: unknown;
  campus?: unknown;
  campusName?: unknown;
}

export const CAMPUS_NAMES: Record<ReservationCampus, CampusName> = {
  digi: "SDCA Digi Campus",
  main: "SDCA Main Campus",
};

export const MANAGED_BUILDINGS_BY_CAMPUS: Record<
  ReservationCampus,
  AssignedBuildingReference[]
> = {
  digi: [
    {
      id: "sdca-digital-campus",
      name: "SDCA Digital Campus",
    },
  ],
  main: [
    {
      id: "gd1",
      name: "GD1",
    },
    {
      id: "gd2",
      name: "GD2",
    },
    {
      id: "gd3",
      name: "GD3",
    },
  ],
};

function getTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getLegacyCampus(input: CampusAssignmentInput): ReservationCampus | null {
  const assignedBuildings = normalizeAssignedBuildings({
    assignedBuilding: getTrimmedString(input.assignedBuilding),
    assignedBuildingId: getTrimmedString(input.assignedBuildingId),
    assignedBuildingIds: input.assignedBuildingIds,
    assignedBuildings: input.assignedBuildings,
  });

  const candidates = [
    ...assignedBuildings.flatMap((building) => [building.id, building.name]),
    ...(Array.isArray(input.assignedBuildingIds)
      ? input.assignedBuildingIds.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
      : []),
    getTrimmedString(input.assignedBuildingId),
    getTrimmedString(input.assignedBuilding),
  ].filter((value): value is string => value !== null);

  if (
    candidates.some(
      (candidate) => inferCampusFromBuilding({
        id: candidate,
        name: candidate
      }) === "main"
    )
  ) {
    return "main";
  }

  if (
    candidates.some(
      (candidate) => inferCampusFromBuilding({
        id: candidate,
        name: candidate
      }) === "digi"
    )
  ) {
    return "digi";
  }

  return null;
}

export function getCampusName(campus: ReservationCampus): CampusName {
  return CAMPUS_NAMES[campus];
}

export function resolveCampusAssignment(
  input?: CampusAssignmentInput | null
): {
  campus: ReservationCampus | null;
  campusName: CampusName | null;
} {
  if (!input) {
    return {
      campus: null,
      campusName: null
    };
  }

  const explicitCampus =
    normalizeCampus(getTrimmedString(input.campus) ?? undefined) ??
    normalizeCampus(getTrimmedString(input.campusName) ?? undefined);
  const campus = explicitCampus ?? getLegacyCampus(input);

  return {
    campus,
    campusName: campus ? getCampusName(campus) : null,
  };
}

export function getManagedBuildingsForCampus(
  campus?: ReservationCampus | null
): AssignedBuildingReference[] {
  if (!campus) {
    return [];
  }

  return MANAGED_BUILDINGS_BY_CAMPUS[campus];
}

export function getManagedBuildingIdsForCampus(
  campus?: ReservationCampus | null
): string[] {
  return getManagedBuildingsForCampus(campus).map((building) => building.id);
}

export function isCampusManagedBuilding(
  campus: ReservationCampus | null | undefined,
  buildingId: string
): boolean {
  if (!campus || !buildingId.trim()) {
    return false;
  }

  const normalizedBuildingId = buildingId.trim().toLowerCase();

  return (
    getManagedBuildingIdsForCampus(campus).includes(normalizedBuildingId) ||
    inferCampusFromBuilding({
      id: normalizedBuildingId
    }) === campus
  );
}
