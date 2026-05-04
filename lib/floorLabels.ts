import { inferCampusFromBuilding } from "./campuses";

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
  { label: "Ground Floor", value: "Ground Floor" },
  { label: "2nd Floor", value: "1st Floor" },
  { label: "3rd Floor", value: "2nd Floor" },
  { label: "4th Floor", value: "3rd Floor" },
];

const DIGITAL_CAMPUS_FLOOR_LABELS = new Map(
  DIGITAL_CAMPUS_FLOOR_OPTIONS.map((option) => [option.value, option.label])
);

function formatOrdinalFloor(level: number) {
  switch (level) {
    case 1:
      return "1st Floor";
    case 2:
      return "2nd Floor";
    case 3:
      return "3rd Floor";
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
    const label = index === 0 ? "Ground Floor" : formatOrdinalFloor(index);
    return createMatchingFloorOption(label);
  });
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
  building?: BuildingLike | null
) {
  if (!isDigitalCampusBuilding(building)) {
    return floor;
  }

  return DIGITAL_CAMPUS_FLOOR_LABELS.get(floor) ?? floor;
}

export function getBuildingFloorOptions(building?: BuildingLike | null) {
  if (isDigitalCampusBuilding(building)) {
    return [...DIGITAL_CAMPUS_FLOOR_OPTIONS];
  }

  switch (building?.id) {
    case "gd1":
      return [
        "Basement Floor",
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
