export const USER_ROLES = {
  STUDENT: "Student",
  FACULTY: "Faculty Professor",
  UTILITY: "Utility Staff",
  ADMIN: "Administrator",
  SUPER_ADMIN: "Super Admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

const ROLE_ALIASES: Record<string, UserRole> = {
  student: USER_ROLES.STUDENT,
  faculty: USER_ROLES.FACULTY,
  "faculty professor": USER_ROLES.FACULTY,
  utility: USER_ROLES.UTILITY,
  "utility staff": USER_ROLES.UTILITY,
  admin: USER_ROLES.ADMIN,
  administrator: USER_ROLES.ADMIN,
  "building admin": USER_ROLES.ADMIN,
  building_admin: USER_ROLES.ADMIN,
  "super admin": USER_ROLES.SUPER_ADMIN,
};

export const ALL_USER_ROLES = Object.values(USER_ROLES);

export function normalizeRole(role?: string | null): UserRole | null {
  if (!role) {
    return null;
  }

  return ROLE_ALIASES[role.trim().toLowerCase()] ?? null;
}

export function isAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === USER_ROLES.ADMIN;
}

export function isSuperAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === USER_ROLES.SUPER_ADMIN;
}

export function isUtilityRole(role?: string | null): boolean {
  return normalizeRole(role) === USER_ROLES.UTILITY;
}

export function isFacultyRole(role?: string | null): boolean {
  return normalizeRole(role) === USER_ROLES.FACULTY;
}
