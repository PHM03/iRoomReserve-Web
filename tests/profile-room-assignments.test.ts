import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("keeps profile updates free of schedule authorization and preserves centralized schedule access", () => {
    const authSource = readFileSync(resolve(repositoryRoot, "lib", "auth", "auth.ts"), "utf8");
    const scheduleRoute = readFileSync(
      resolve(repositoryRoot, "app", "api", "schedules", "route.ts"),
      "utf8"
    );

    const selfServiceUpdate = authSource.slice(
      authSource.indexOf("export async function updateAccountSettings"),
      authSource.indexOf("export async function dismissAccountConfigurationReminder")
    );
    expect(selfServiceUpdate).not.toContain("assignedRoom");
    expect(scheduleRoute).toContain("assertScheduleAccess(authContext");
  });
});
