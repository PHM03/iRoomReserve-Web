import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { USER_ROLES } from "../lib/auth/roles";
import {
  assertScheduleOperation,
  assertScheduleRoomAssignment,
} from "../lib/server/schedule-authorization-policy";

function assertAssignedScheduleRoom(
  context: Parameters<typeof assertScheduleRoomAssignment>[0],
  roomId: string,
  room: Parameters<typeof assertScheduleRoomAssignment>[2],
  requestedBuildingId?: string,
  options: { allowStudentRead?: boolean } = {}
) {
  assertScheduleOperation(context, options.allowStudentRead ? "read" : "write");
  return assertScheduleRoomAssignment(
    context,
    roomId,
    room,
    requestedBuildingId
  );
}

function context(
  role: (typeof USER_ROLES)[keyof typeof USER_ROLES],
  assignedRoomIds: string[] = [],
  status = "approved"
) {
  return {
    uid: "verified-user",
    role,
    status,
    assignedRoomIds,
    verified: true,
  };
}

function expectForbidden(action: () => void, code: string) {
  expect(action).toThrowError(expect.objectContaining({ status: 403, code }));
}

describe("Phase C1 schedule authorization", () => {
  it("routes every schedule operation through the centralized access helper", () => {
    const collectionRoute = readFileSync(
      resolve(process.cwd(), "app", "api", "schedules", "route.ts"),
      "utf8"
    );
    const scheduleRoute = readFileSync(
      resolve(process.cwd(), "app", "api", "schedules", "[scheduleId]", "route.ts"),
      "utf8"
    );

    expect(collectionRoute.match(/assertScheduleAccess\(/g)).toHaveLength(3);
    expect(scheduleRoute.match(/assertScheduleAccess\(/g)).toHaveLength(5);
    expect(collectionRoute).not.toContain("assertCanManageBuilding");
    expect(scheduleRoute).not.toContain("assertCanManageBuilding");
    expect(collectionRoute).not.toContain("assertScheduleRole");
    expect(scheduleRoute).not.toContain("assertScheduleRole");
  });

  it.each([USER_ROLES.FACULTY, USER_ROLES.UTILITY] as const)(
    "allows %s to access an assigned room",
    (role) => {
      expect(() =>
        assertAssignedScheduleRoom(
          context(role, ["room-A"]),
          "room-A",
          { buildingId: "main-campus" },
          "main-campus"
        )
      ).not.toThrow();
    }
  );

  it("protects GET room access while preserving Student schedule reads", () => {
    const faculty = context(USER_ROLES.FACULTY, ["room-A"]);
    expect(() =>
      assertAssignedScheduleRoom(
        faculty,
        "room-A",
        { buildingId: "building-A" },
        "building-A",
        { allowStudentRead: true }
      )
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          faculty,
          "room-B",
          { buildingId: "building-A" },
          "building-A",
          { allowStudentRead: true }
        ),
      "room_not_assigned"
    );

    expect(() =>
      assertAssignedScheduleRoom(
        context(USER_ROLES.STUDENT),
        "room-B",
        { buildingId: "building-A" },
        "building-A",
        { allowStudentRead: true }
      )
    ).not.toThrow();
  });

  it.each([USER_ROLES.FACULTY, USER_ROLES.UTILITY] as const)(
    "denies %s access to an unassigned room despite spoofed request claims",
    (role) => {
      expectForbidden(
        () =>
          assertAssignedScheduleRoom(
            Object.assign(context(role, ["room-A"]), {
              userId: "another-user",
              userRole: role,
              buildingId: "main-campus",
            }),
            "room-B",
            { buildingId: "main-campus" },
            "main-campus"
          ),
        "room_not_assigned"
      );
    }
  );

  it("supports assigned Faculty rooms across Main and Digi campuses", () => {
    const faculty = context(USER_ROLES.FACULTY, ["main-campus-room", "digi-campus-room"]);

    expect(() =>
      assertAssignedScheduleRoom(faculty, "main-campus-room", { buildingId: "gd3" }, "gd3")
    ).not.toThrow();
    expect(() =>
      assertAssignedScheduleRoom(
        faculty,
        "digi-campus-room",
        { buildingId: "sdca-digital-campus" },
        "sdca-digital-campus"
      )
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          faculty,
          "unassigned-main-campus-room",
          { buildingId: "gd3" },
          "gd3"
        ),
      "room_not_assigned"
    );
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          faculty,
          "unassigned-digi-campus-room",
          { buildingId: "sdca-digital-campus" },
          "sdca-digital-campus"
        ),
      "room_not_assigned"
    );
  });

  it("supports assigned Utility Staff rooms across Main and Digi campuses", () => {
    const utility = context(USER_ROLES.UTILITY, ["main-campus-room", "digi-campus-room"]);

    expect(() =>
      assertAssignedScheduleRoom(utility, "main-campus-room", { buildingId: "gd3" }, "gd3")
    ).not.toThrow();
    expect(() =>
      assertAssignedScheduleRoom(
        utility,
        "digi-campus-room",
        { buildingId: "sdca-digital-campus" },
        "sdca-digital-campus"
      )
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          utility,
          "unassigned-digi-campus-room",
          { buildingId: "sdca-digital-campus" },
          "sdca-digital-campus"
        ),
      "room_not_assigned"
    );
  });

  it.each([USER_ROLES.FACULTY, USER_ROLES.UTILITY] as const)(
    "denies an unapproved %s account",
    (role) => {
      expectForbidden(
        () =>
          assertAssignedScheduleRoom(
            context(role, ["room-A"], "pending"),
            "room-A",
            { buildingId: "main-campus" },
            "main-campus"
          ),
        "account_not_approved"
      );
    }
  );

  it("preserves Administrator and Super Admin room access while rejecting mismatched building context", () => {
    for (const role of [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]) {
      expect(() =>
        assertAssignedScheduleRoom(
          context(role),
          "room-A",
          { buildingId: "building-A" },
          "building-A"
        )
      ).not.toThrow();
      expectForbidden(
        () =>
          assertAssignedScheduleRoom(
            context(role),
            "room-A",
            { buildingId: "building-A" },
            "building-B"
          ),
        "room_building_mismatch"
      );
    }
  });

  it("requires a verified identity and never treats compatibility claims as authentication", () => {
    expect(() =>
      assertScheduleOperation({
        uid: "claimed-user",
        role: USER_ROLES.FACULTY,
        assignedRoomIds: ["room-A"],
        status: "approved",
        verified: false,
      }, "write")
    ).toThrowError(expect.objectContaining({ status: 401 }));
  });

  it("applies the same room check to create, update, delete, and clear-room targets", () => {
    const faculty = context(USER_ROLES.FACULTY, ["room-A"]);
    const existingSchedule = { roomId: "room-A", buildingId: "building-A" };

    // CREATE target.
    expect(() =>
      assertAssignedScheduleRoom(faculty, existingSchedule.roomId, existingSchedule, "building-A")
    ).not.toThrow();

    // UPDATE checks the stored room before considering a submitted room change.
    expect(() =>
      assertAssignedScheduleRoom(faculty, existingSchedule.roomId, existingSchedule, "building-A")
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          faculty,
          "room-B",
          { buildingId: "building-A" },
          "building-A"
        ),
      "room_not_assigned"
    );

    // DELETE by ID uses the stored room, and CLEAR ROOM uses its requested room.
    expect(() =>
      assertAssignedScheduleRoom(faculty, existingSchedule.roomId, existingSchedule, "building-A")
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          faculty,
          "room-B",
          { buildingId: "building-A" },
          "building-A"
        ),
      "room_not_assigned"
    );
  });
});
