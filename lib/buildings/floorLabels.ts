import { inferCampusFromBuilding } from "@/lib/buildings/campuses";

export interface FloorOption {
  label: string;
  value: string;
}

interface BuildingLike {
  floors?: number | null;
  id?: string | null;
  name?: string | null;
}

export const DIGITAL_CAMPUS_FLOOR_OPTIONS: readonly FloorOption[] = [
  {
    label: "Ground Floor",
    value: "Ground Floor"
  },
  {
    label: "2nd Floor",
    value: "2nd Floor"
  },
  {
    label: "3rd Floor",
    value: "3rd Floor"
  },
  {
    label: "4th Floor",
    value: "4th Floor"
  },
];

function formatOrdinalFloor(level: number) {
  switch (level) {
    case 2:
      return "2nd Floor";
    case 3:
      return "3rd Floor";
    case 4:
      return "4th Floor";
    case 5:
      return "5th Floor";
    case 6:
      return "6th Floor";
    case 7:
      return "7th Floor";
    case 8:
      return "8th Floor";
    case 9:
      return "9th Floor";
    case 10:
      return "10th Floor";
    case 11:
      return "11th Floor";
    default:
      return `${level}th Floor`;
  }
}

function createMatchingFloorOption(label: string): FloorOption {
  return {
    label,
    value: label,
  };
}

function createStandardFloorOptions(totalFloors: number) {
  return Array.from({ length: totalFloors || 5 }, (_, index) => {
    const label = index === 0 ? "Ground Floor" : formatOrdinalFloor(index + 1);
    return createMatchingFloorOption(label);
  });
}

function getFloorSortOrder(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "basement") return -1;
  if (normalized === "ground" || normalized === "ground floor") return 0;

  const match = normalized.match(/-?\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

export function isDigitalCampusBuilding(building?: BuildingLike | null) {
  if (!building) {
    return false;
  }

  return (
    inferCampusFromBuilding({
      id: building.id ?? "",
      name: building.name ?? "",
    }) === "digi"
  );
}

export function getFloorDisplayLabel(
  floor: string,
  _building?: BuildingLike | null
) {
  // Floor values now match display labels directly across all buildings.
  return floor;
}

export function getBuildingFloorOptions(building?: BuildingLike | null): FloorOption[] {
  if (isDigitalCampusBuilding(building)) {
    return [...DIGITAL_CAMPUS_FLOOR_OPTIONS];
  }

  switch (building?.id) {
    case "gd1":
      return [
        "Basement",
        "Ground Floor",
        ...Array.from({ length: 7 }, (_, index) => formatOrdinalFloor(index + 2)),
      ].map(createMatchingFloorOption);
    case "gd2":
      return [
        "Ground Floor",
        ...Array.from({ length: 9 }, (_, index) => formatOrdinalFloor(index + 2)),
      ].map(createMatchingFloorOption);
    case "gd3":
      return [
        "Ground Floor",
        ...Array.from({ length: 10 }, (_, index) => formatOrdinalFloor(index + 2)),
      ].map(createMatchingFloorOption);
    default:
      return createStandardFloorOptions(building?.floors ?? 0);
  }
}

export function sortFloorOptions(options: FloorOption[]) {
  return [...options].sort(
    (left, right) =>
      getFloorSortOrder(left.value) - getFloorSortOrder(right.value) ||
      left.label.localeCompare(right.label, undefined, { numeric: true })
  );
}

export function getPreferredDefaultFloorValue(
  options: FloorOption[],
  fallback = ""
) {
  return (
    options.find((option) => option.value === "Ground Floor")?.value ??
    options[0]?.value ??
    fallback
  );
}
