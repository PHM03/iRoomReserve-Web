import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getRequestAuthContext: vi.fn(),
  assertAuthenticated: vi.fn(),
  assertRole: vi.fn(),
  writeAuditLog: vi.fn(),
  writeSystemAuditLog: vi.fn(),
}));

vi.mock('@/lib/server/request-auth', () => ({
  getRequestAuthContext: mocks.getRequestAuthContext,
}));
vi.mock('@/lib/server/route-guards', () => ({
  assertAuthenticated: mocks.assertAuthenticated,
  assertRole: mocks.assertRole,
}));
vi.mock('@/lib/server/services/audit-logs', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeSystemAuditLog: mocks.writeSystemAuditLog,
}));
vi.mock('@/lib/firebase/firebase-admin', () => ({ db: {} }));
vi.mock('@/lib/server/api-error', () => ({
  ApiError: class ApiError extends Error {},
  handleApiError: () => Response.json({ error: 'failed' }, { status: 500 }),
}));
vi.mock('@/lib/auth/roles', () => ({
  USER_ROLES: { SUPER_ADMIN: 'Super Admin' },
}));

import { POST } from '../app/api/audit-logs/route';

describe('audit log authentication events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a successful student sign-in under the authenticated student identity', async () => {
    const student = {
      uid: 'student-123',
      email: 'student@sdca.edu.ph',
      role: 'Student',
      campus: 'main',
      verified: true,
    };
    mocks.getRequestAuthContext.mockResolvedValue(student);
    mocks.writeAuditLog.mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'account.login_succeeded' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(student, expect.objectContaining({
      action: 'account.login_succeeded',
      entityType: 'account',
      entityId: student.uid,
      targetUserId: student.uid,
      summary: 'Signed in successfully',
    }));
  });
});
