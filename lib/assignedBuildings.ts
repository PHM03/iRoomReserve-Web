export interface AssignedBuildingReference {
  id: string;
  name: string;
}

interface AssignedBuildingInput {
  assignedBuilding?: string | null;
  assignedBuildingId?: string | null;
  assignedBuildings?: unknown;
  assignedBuildingIds?: unknown;
}

function normalizeAssignedBuildingReference(
  value: unknown
): AssignedBuildingReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

export function normalizeAssignedBuildings(
  input?: AssignedBuildingInput | null
): AssignedBuildingReference[] {
  if (!input) {
    return [];
  }

  const assignedBuildings = Array.isArray(input.assignedBuildings)
    ? input.assignedBuildings
        .map(normalizeAssignedBuildingReference)
        .filter(
          (
            building
          ): building is AssignedBuildingReference => building !== null
        )
    : [];

  if (assignedBuildings.length > 0) {
    return assignedBuildings;
  }

  const assignedBuildingIds = Array.isArray(input.assignedBuildingIds)
    ? input.assignedBuildingIds.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    : [];

  if (
    assignedBuildingIds.length > 0 &&
    typeof input.assignedBuilding === "string" &&
    input.assignedBuilding.trim()
  ) {
    return assignedBuildingIds.map((id, index) => ({
      id: id.trim(),
      name: index === 0 ? input.assignedBuilding!.trim() : id.trim(),
    }));
  }

  if (
    typeof input.assignedBuildingId === "string" &&
    input.assignedBuildingId.trim() &&
    typeof input.assignedBuilding === "string" &&
    input.assignedBuilding.trim()
  ) {
    return [
      {
        id: input.assignedBuildingId.trim(),
        name: input.assignedBuilding.trim(),
      },
    ];
  }

  return [];
}

export function hasAssignedBuildingAccess(
  input: AssignedBuildingInput | null | undefined,
  buildingId: string
): boolean {
  const normalizedBuildingId = buildingId.trim();
  if (!normalizedBuildingId) {
    return false;
  }

  return normalizeAssignedBuildings(input).some(
    (building) => building.id === normalizedBuildingId
  );
}
