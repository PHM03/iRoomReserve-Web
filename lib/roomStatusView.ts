import type { Building } from "@/lib/buildings";
import { getCampusName } from "./campusAssignments";
import type { ReservationCampus } from "@/lib/campuses";
import type { Room } from "@/lib/rooms";
import type { ResolvedRoomStatus, RoomStatusValue } from "@/lib/roomStatus";

export type RoomStatusFilter = "all" | RoomStatusValue;

export interface RoomStatusViewItem {
  room: Room;
  resolved: ResolvedRoomStatus;
}

export interface BuildingOption {
  id: string;
  buildingId: string;
  campus: ReservationCampus;
  label: string;
  description: string;
}

export interface FloorGroup {
  id: string;
  label: string;
  rooms: RoomStatusViewItem[];
}

export interface CampusOption {
  id: ReservationCampus;
  label: string;
  description: string;
  buildings: BuildingOption[];
}

export const ROOM_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "Available", label: "Available" },
  { value: "Reserved", label: "Reserved" },
  { value: "Occupied", label: "Occupied" },
  { value: "Unavailable", label: "Unavailable" },
] as const satisfies ReadonlyArray<{
  value: RoomStatusFilter;
  label: string;
}>;

const CAMPUS_ORDER: ReservationCampus[] = ["main", "digi"];

const MAIN_CAMPUS_BUILDING_METADATA = {
  gd1: {
    description: "Basement to 8th floor",
    label: "GD1",
    sortOrder: 0,
  },
  gd2: {
    description: "1st to 10th floor",
    label: "GD2",
    sortOrder: 1,
  },
  gd3: {
    description: "1st to 10th floor",
    label: "GD3",
    sortOrder: 2,
  },
} as const;

type MainCampusBuildingKey = keyof typeof MAIN_CAMPUS_BUILDING_METADATA;

function resolveMainCampusBuildingKey(
  building: Pick<Building, "id" | "name" | "code">
): MainCampusBuildingKey | null {
  const searchValue = `${building.id} ${building.code} ${building.name}`.toLowerCase();

  if (/\bgd[\s-]?1\b/.test(searchValue)) {
    return "gd1";
  }

  if (/\bgd[\s-]?2\b/.test(searchValue)) {
    return "gd2";
  }

  if (/\bgd[\s-]?3\b/.test(searchValue)) {
    return "gd3";
  }

  return null;
}

function formatBuildingDescription(building: Building): string {
  const mainCampusKey = resolveMainCampusBuildingKey(building);
  if (mainCampusKey) {
    return MAIN_CAMPUS_BUILDING_METADATA[mainCampusKey].description;
  }

  const details = [
    building.code && building.code !== building.name ? building.code : null,
    building.floors > 0 ? `${building.floors} floors` : null,
  ].filter((value): value is string => Boolean(value));

  return details.join(" | ") || building.address || "Assigned building";
}

function compareCampusOptions(left: CampusOption, right: CampusOption) {
  const leftRank = CAMPUS_ORDER.indexOf(left.id);
  const rightRank = CAMPUS_ORDER.indexOf(right.id);

  return (
    (leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank) -
      (rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank) ||
    left.label.localeCompare(right.label)
  );
}

function compareBuildingOptions(left: BuildingOption, right: BuildingOption) {
  const leftKey = resolveMainCampusBuildingKey({
    code: left.label,
    id: left.id,
    name: left.label,
  });
  const rightKey = resolveMainCampusBuildingKey({
    code: right.label,
    id: right.id,
    name: right.label,
  });
  const leftRank =
    leftKey === null
      ? Number.MAX_SAFE_INTEGER
      : MAIN_CAMPUS_BUILDING_METADATA[leftKey].sortOrder;
  const rightRank =
    rightKey === null
      ? Number.MAX_SAFE_INTEGER
      : MAIN_CAMPUS_BUILDING_METADATA[rightKey].sortOrder;

  return leftRank - rightRank || left.label.localeCompare(right.label);
}

function getFloorRank(floor: string) {
  const normalized = floor.trim().toLowerCase();

  if (normalized.includes("basement")) {
    return -1;
  }

  if (normalized.includes("ground")) {
    return 0;
  }

  const match = normalized.match(/(\d+)/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }

  return Number.MAX_SAFE_INTEGER;
}

export function compareFloors(left: string, right: string) {
  return (
    getFloorRank(left) - getFloorRank(right) || left.localeCompare(right)
  );
}

export function groupRoomStatusesByFloor(
  items: RoomStatusViewItem[]
): FloorGroup[] {
  const groupedRooms = new Map<string, RoomStatusViewItem[]>();

  for (const item of items) {
    const floorRooms = groupedRooms.get(item.room.floor) ?? [];
    floorRooms.push(item);
    groupedRooms.set(item.room.floor, floorRooms);
  }

  return [...groupedRooms.entries()]
    .sort(([leftFloor], [rightFloor]) => compareFloors(leftFloor, rightFloor))
    .map(([floor, floorRooms]) => ({
      id: floor,
      label: floor,
      rooms: floorRooms,
    }));
}

export function getCampusLabel(campus: ReservationCampus) {
  return getCampusName(campus);
}

export function buildCampusOptions(buildings: Building[]): CampusOption[] {
  const groupedBuildings = new Map<ReservationCampus, Building[]>();

  for (const building of buildings) {
    const campusBuildings = groupedBuildings.get(building.campus) ?? [];
    campusBuildings.push(building);
    groupedBuildings.set(building.campus, campusBuildings);
  }

  return [...groupedBuildings.entries()]
    .map(([campus, campusBuildings]) => ({
      id: campus,
      label: getCampusLabel(campus),
      description:
        campus === "main"
          ? "Navigate by building before drilling into floors and room schedules."
          : "Monitor assigned buildings and live room availability for Digital Campus.",
      buildings: campusBuildings
        .map((building) => {
          const mainCampusKey = resolveMainCampusBuildingKey(building);

          return {
            id: building.id,
            buildingId: building.id,
            campus,
            label:
              mainCampusKey === null
                ? building.name
                : MAIN_CAMPUS_BUILDING_METADATA[mainCampusKey].label,
            description: formatBuildingDescription(building),
          };
        })
        .sort(compareBuildingOptions),
    }))
    .sort(compareCampusOptions);
}
