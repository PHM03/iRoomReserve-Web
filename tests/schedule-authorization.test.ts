import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { USER_ROLES } from "../lib/auth/roles";
import {
  assertScheduleOperation,
  assertScheduleRoomAssignment,
  assertUtilityScheduleBuildingAccess,
  type ScheduleOperation,
} from "../lib/server/schedule-authorization-policy";
import type { RequestAuthContext } from "../lib/server/request-auth";

function assertAssignedScheduleRoom(
  context: RequestAuthContext,
  roomId: string,
  room: Parameters<typeof assertScheduleRoomAssignment>[2],
  requestedBuildingId?: string,
  options: { operation?: ScheduleOperation } = {}
) {
  assertScheduleOperation(context, options.operation ?? "write");
  const result = assertScheduleRoomAssignment(
    context,
    roomId,
    room,
    requestedBuildingId
  );
  assertUtilityScheduleBuildingAccess(context, room.buildingId ?? "");
  return result;
}

function context(
  role: (typeof USER_ROLES)[keyof typeof USER_ROLES],
  status = "approved",
  campus: "main" | "digi" | null = null
): RequestAuthContext {
  return {
    uid: "verified-user",
    role,
    status,
    email: "verified-user@sdca.edu.ph",
    campus,
    assignedBuildingId: null,
    assignedBuildingIds: [],
    verified: true,
  };
}

function expectForbidden(action: () => void, code: string) {
  expect(action).toThrowError(expect.objectContaining({ status: 403, code }));
}

describe("schedule authorization", () => {
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

  it("allows approved Faculty to read a selected room without room assignments", () => {
    expect(() =>
      assertAssignedScheduleRoom(
        context(USER_ROLES.FACULTY),
        "room-A",
        { buildingId: "main-campus" },
        "main-campus",
        { operation: "read" }
      )
    ).not.toThrow();
  });

  it("allows Utility Staff to access a room in the assigned campus", () => {
    expect(() =>
      assertAssignedScheduleRoom(
        context(USER_ROLES.UTILITY, "approved", "main"),
        "room-A",
        { buildingId: "gd2" },
        "gd2",
        { operation: "read" }
      )
    ).not.toThrow();
  });

  it("protects GET room access while preserving Student schedule reads", () => {
    const faculty = context(USER_ROLES.FACULTY);
    expect(() =>
      assertAssignedScheduleRoom(
        faculty,
        "room-A",
        { buildingId: "building-A" },
        "building-A",
        { operation: "read" }
      )
    ).not.toThrow();
    expect(() =>
      assertAssignedScheduleRoom(
        faculty,
        "room-B",
        { buildingId: "building-A" },
        "building-A",
        { operation: "read" }
      )
    ).not.toThrow();

    expect(() =>
      assertAssignedScheduleRoom(
        context(USER_ROLES.STUDENT),
        "room-B",
        { buildingId: "building-A" },
        "building-A",
        { operation: "read" }
      )
    ).not.toThrow();
  });

  it("allows Faculty schedule writes without room assignments", () => {
    for (const operation of ["create", "edit", "delete", "clear"] as const) {
      expect(() =>
        assertAssignedScheduleRoom(
          context(USER_ROLES.FACULTY),
          `faculty-${operation}-room`,
          { buildingId: "building-A" },
          "building-A"
        )
      ).not.toThrow();
    }
  });

  it.each(["CREATE", "UPDATE", "DELETE", "CLEAR-ROOM"])(
    "denies Utility Staff %s schedule writes",
    () => {
      const utility = context(USER_ROLES.UTILITY, "approved", "main");

      expectForbidden(() => assertScheduleOperation(utility, "write"), "forbidden");
    }
  );

  it("does not use instructorName as a Faculty schedule ownership key", () => {
    const policySource = readFileSync(
      resolve(process.cwd(), "lib", "server", "schedule-authorization-policy.ts"),
      "utf8"
    );
    const authorizationSource = readFileSync(
      resolve(process.cwd(), "lib", "server", "schedule-authorization.ts"),
      "utf8"
    );

    expect(policySource).not.toContain("instructorName");
    expect(authorizationSource).not.toContain("instructorName");
  });

  it("allows approved Faculty to read schedules without an instructor identity field", () => {
    expect(() =>
      assertAssignedScheduleRoom(
        context(USER_ROLES.FACULTY),
        "room-A",
        { buildingId: "building-A" },
        "building-A",
        { operation: "read" }
      )
    ).not.toThrow();
  });

  it("supports Utility Staff across all Main Campus buildings without room assignments", () => {
    const utility = context(USER_ROLES.UTILITY, "approved", "main");

    expect(() =>
      assertAssignedScheduleRoom(
        utility,
        "main-campus-room",
        { buildingId: "gd1" },
        "gd1",
        { operation: "read" }
      )
    ).not.toThrow();
    expect(() =>
      assertAssignedScheduleRoom(
        utility,
        "main-campus-room-2",
        { buildingId: "gd2" },
        "gd2",
        { operation: "read" }
      )
    ).not.toThrow();
    expect(() =>
      assertAssignedScheduleRoom(
        utility,
        "main-campus-room-3",
        { buildingId: "gd3" },
        "gd3",
        { operation: "read" }
      )
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          utility,
          "digi-campus-room",
          { buildingId: "sdca-digital-campus" },
          "sdca-digital-campus",
          { operation: "read" }
        ),
      "forbidden"
    );
  });

  it("allows Digi Campus Utility Staff only in the Digi Campus building", () => {
    const utility = context(USER_ROLES.UTILITY, "approved", "digi");

    expect(() =>
      assertAssignedScheduleRoom(
        utility,
        "digi-campus-room",
        { buildingId: "sdca-digital-campus" },
        "sdca-digital-campus",
        { operation: "read" }
      )
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          utility,
          "main-campus-room",
          { buildingId: "gd3" },
          "gd3",
          { operation: "read" }
        ),
      "forbidden"
    );
  });

  it.each([USER_ROLES.FACULTY, USER_ROLES.UTILITY] as const)(
    "denies an unapproved %s account from schedule reads",
    (role) => {
      expectForbidden(
        () =>
          assertAssignedScheduleRoom(
            context(role, "pending", role === USER_ROLES.UTILITY ? "main" : null),
            "room-A",
            { buildingId: role === USER_ROLES.UTILITY ? "gd2" : "main-campus" },
            role === USER_ROLES.UTILITY ? "gd2" : "main-campus",
            { operation: "read" }
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
        status: "approved",
        verified: false,
      }, "write")
    ).toThrowError(expect.objectContaining({ status: 401 }));
  });

  it("applies the same room check to create, update, delete, and clear-room targets", () => {
    const superAdmin = context(USER_ROLES.SUPER_ADMIN);
    const existingSchedule = { roomId: "room-A", buildingId: "building-A" };

    // CREATE target.
    expect(() =>
      assertAssignedScheduleRoom(superAdmin, existingSchedule.roomId, existingSchedule, "building-A")
    ).not.toThrow();

    // UPDATE checks the stored room before considering a submitted room change.
    expect(() =>
      assertAssignedScheduleRoom(superAdmin, existingSchedule.roomId, existingSchedule, "building-A")
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          superAdmin,
          "room-B",
          { buildingId: "building-A" },
          "building-B"
        ),
      "room_building_mismatch"
    );

    // DELETE by ID uses the stored room, and CLEAR ROOM uses its requested room.
    expect(() =>
      assertAssignedScheduleRoom(superAdmin, existingSchedule.roomId, existingSchedule, "building-A")
    ).not.toThrow();
    expectForbidden(
      () =>
        assertAssignedScheduleRoom(
          superAdmin,
          "room-B",
          { buildingId: "building-A" },
          "building-B"
        ),
      "room_building_mismatch"
    );
  });
});
