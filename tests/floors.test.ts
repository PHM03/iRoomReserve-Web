import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareFloorsBySortOrder,
  getFloorDocumentId,
  getNextFloorSortOrder,
  normalizeFloorName,
} from "../lib/buildings/floorNames";
import { floorCreateSchema } from "../lib/server/schemas";
import { assertCanManageFloors } from "../lib/server/route-guards";

const repositoryRoot = resolve(process.cwd());

describe("floor helpers", () => {
  it("normalizes case, whitespace, and punctuation consistently", () => {
    expect(normalizeFloorName("Ground Floor")).toBe("ground floor");
    expect(normalizeFloorName(" ground   floor ")).toBe("ground floor");
    expect(normalizeFloorName("GROUND-FLOOR")).toBe("ground floor");
    expect(normalizeFloorName("2ND FLOOR")).toBe("2nd floor");
  });

  it("creates deterministic document IDs", () => {
    expect(getFloorDocumentId("Ground Floor")).toBe("ground-floor");
    expect(getFloorDocumentId(" ground   floor ")).toBe("ground-floor");
    expect(getFloorDocumentId("2nd Floor")).toBe("2nd-floor");
  });

  it("orders persisted floors by sortOrder with deterministic tie-breakers", () => {
    const floors = [
      { id: "10th-floor", normalizedName: "10th floor", sortOrder: 10 },
      { id: "ground-floor", normalizedName: "ground floor", sortOrder: 0 },
      { id: "basement", normalizedName: "basement", sortOrder: -1 },
      { id: "2nd-floor", normalizedName: "2nd floor", sortOrder: 2 },
    ];

    expect([...floors].sort(compareFloorsBySortOrder).map((floor) => floor.id)).toEqual([
      "basement",
      "ground-floor",
      "2nd-floor",
      "10th-floor",
    ]);
  });

  it("appends new floors after the highest existing sortOrder", () => {
    expect(getNextFloorSortOrder([-1, 0, 2, 10])).toBe(11);
    expect(getNextFloorSortOrder([])).toBe(0);
  });

  it("validates a non-empty floor name with the server schema", () => {
    expect(floorCreateSchema.parse({ name: "  Ground Floor  " })).toEqual({
      name: "Ground Floor",
    });
    expect(() => floorCreateSchema.parse({ name: "   " })).toThrow();
  });
});

describe("floor V1 integration contracts", () => {
  it("keeps rooms on the legacy string floor field", () => {
    const roomService = readFileSync(
      resolve(repositoryRoot, "lib", "server", "services", "rooms.ts"),
      "utf8"
    );
    const roomRoute = readFileSync(
      resolve(repositoryRoot, "app", "api", "rooms", "route.ts"),
      "utf8"
    );

    expect(roomService).not.toContain("floorId");
    expect(roomRoute).not.toContain("floorId");
  });

  it("exposes only the V1 floor methods", () => {
    const collectionRoute = readFileSync(
      resolve(repositoryRoot, "app", "api", "buildings", "[buildingId]", "floors", "route.ts"),
      "utf8"
    );
    const itemRoute = readFileSync(
      resolve(repositoryRoot, "app", "api", "buildings", "[buildingId]", "floors", "[floorId]", "route.ts"),
      "utf8"
    );

    expect(collectionRoute).toContain("export async function GET");
    expect(collectionRoute).toContain("export async function POST");
    expect(itemRoute).toContain("export async function DELETE");
    expect(itemRoute).not.toContain("export async function PATCH");
  });

  it("keeps floor creation and deletion building-scoped and non-cascading", () => {
    const floorService = readFileSync(
      resolve(repositoryRoot, "lib", "server", "services", "floors.ts"),
      "utf8"
    );

    expect(floorService).toContain('collection("floors")');
    expect(floorService).toContain("runTransaction");
    expect(floorService).toContain('new ApiError(409, "duplicate_floor"');
    expect(floorService).toContain('.where("buildingId", "==", buildingId.trim())');
    expect(floorService).toContain('.where("floor", "==", floor.name)');
    expect(floorService).toContain('"floor_in_use"');
    expect(floorService).not.toContain('collection("rooms").doc');
  });

  it("requires verified, approved administrator access within building scope", () => {
    expect(() =>
      assertCanManageFloors(
        {
          uid: "admin-1",
          role: "Administrator",
          status: "approved",
          email: "admin@sdca.edu.ph",
          campus: "main",
          assignedBuildingId: null,
          assignedBuildingIds: [],
          verified: true,
        },
        "gd1"
      )
    ).not.toThrow();

    expect(() =>
      assertCanManageFloors(
        {
          uid: "super-admin-1",
          role: "Super Admin",
          status: "approved",
          email: "super-admin@sdca.edu.ph",
          campus: null,
          assignedBuildingId: null,
          assignedBuildingIds: [],
          verified: true,
        },
        "sdca-digital-campus"
      )
    ).not.toThrow();

    expect(() =>
      assertCanManageFloors(
        {
          uid: "utility-1",
          role: "Utility Staff",
          status: "approved",
          email: "utility@sdca.edu.ph",
          campus: "main",
          assignedBuildingId: "gd1",
          assignedBuildingIds: ["gd1"],
          verified: true,
        },
        "gd1"
      )
    ).toThrow();

    expect(() =>
      assertCanManageFloors(
        {
          uid: "admin-1",
          role: "Administrator",
          status: "approved",
          email: "admin@sdca.edu.ph",
          campus: "main",
          assignedBuildingId: null,
          assignedBuildingIds: [],
          verified: true,
        },
        "sdca-digital-campus"
      )
    ).toThrow();

    expect(() =>
      assertCanManageFloors(
        {
          uid: "admin-1",
          role: "Administrator",
          status: "pending",
          email: "admin@sdca.edu.ph",
          campus: "main",
          assignedBuildingId: null,
          assignedBuildingIds: [],
          verified: true,
        },
        "gd1"
      )
    ).toThrow();
  });
});
