import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { ManagedUser } from "../lib/auth/auth";
import { normalizeAssignedRoomIds } from "../lib/auth/profile-types";
import { normalizeRole, USER_ROLES } from "../lib/auth/roles";

const repositoryRoot = resolve(process.cwd());

describe("role and room-assignment preparation", () => {
  it("normalizes Building Admin to the existing Administrator role", () => {
    expect(normalizeRole("Building Admin")).toBe(USER_ROLES.ADMIN);
    expect(normalizeRole("building_admin")).toBe(USER_ROLES.ADMIN);
    expect(normalizeRole(USER_ROLES.ADMIN)).toBe(USER_ROLES.ADMIN);
  });

  it("preserves Super Admin and Faculty Professor roles", () => {
    expect(normalizeRole(USER_ROLES.SUPER_ADMIN)).toBe(USER_ROLES.SUPER_ADMIN);
    expect(normalizeRole(USER_ROLES.FACULTY)).toBe(USER_ROLES.FACULTY);
  });

  it("normalizes optional room assignments to unique non-empty room IDs", () => {
    expect(normalizeAssignedRoomIds([" gd3-501 ", "gd3-502", "gd3-501", ""])).toEqual([
      "gd3-501",
      "gd3-502",
    ]);
    expect(normalizeAssignedRoomIds(undefined)).toBeUndefined();
    expect(normalizeAssignedRoomIds("gd3-501")).toBeUndefined();
  });

  it("represents optional room IDs for Faculty and Utility profiles", () => {
    const facultyProfile: Pick<ManagedUser, "role" | "assignedRoomIds"> = {
      role: USER_ROLES.FACULTY,
      assignedRoomIds: ["gd3-501"],
    };
    const utilityProfile: Pick<ManagedUser, "role" | "assignedRoomIds"> = {
      role: USER_ROLES.UTILITY,
    };

    expect(facultyProfile.assignedRoomIds).toEqual(["gd3-501"]);
    expect(utilityProfile.assignedRoomIds).toBeUndefined();
  });

  it("keeps room assignments out of self-service writes and schedule permissions unchanged", () => {
    const rules = readFileSync(resolve(repositoryRoot, "firestore.rules"), "utf8");
    const authSource = readFileSync(resolve(repositoryRoot, "lib", "auth", "auth.ts"), "utf8");
    const scheduleRoute = readFileSync(
      resolve(repositoryRoot, "app", "api", "schedules", "route.ts"),
      "utf8"
    );

    expect(rules).toContain('!request.resource.data.keys().hasAny(["assignedRoomIds"])');
    expect(rules).toContain(
      '!request.resource.data.diff(resource.data).affectedKeys().hasAny(["assignedRoomIds"])'
    );
    const selfServiceUpdate = authSource.slice(
      authSource.indexOf("export async function updateAccountSettings"),
      authSource.indexOf("export async function dismissAccountConfigurationReminder")
    );
    expect(selfServiceUpdate).not.toContain("assignedRoomIds");
    expect(scheduleRoute).toContain("assertScheduleAccess(authContext");
  });
});
