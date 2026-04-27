import { describe, expect, it } from 'vitest';

import { normalizeRole, USER_ROLES } from '../lib/domain/roles';

describe('normalizeRole', () => {
  it('normalizes legacy aliases to canonical roles', () => {
    expect(normalizeRole('Faculty')).toBe(USER_ROLES.FACULTY);
    expect(normalizeRole('faculty professor')).toBe(USER_ROLES.FACULTY);
    expect(normalizeRole('Utility')).toBe(USER_ROLES.UTILITY);
    expect(normalizeRole('utility staff')).toBe(USER_ROLES.UTILITY);
    expect(normalizeRole('Admin')).toBe(USER_ROLES.ADMIN);
    expect(normalizeRole('Building Admin')).toBe(USER_ROLES.ADMIN);
    expect(normalizeRole('building_admin')).toBe(USER_ROLES.ADMIN);
  });

  it('returns null for unsupported roles', () => {
    expect(normalizeRole('Guest')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });
});
