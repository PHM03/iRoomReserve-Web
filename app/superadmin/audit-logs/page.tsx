'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import AdminAuditLogsTab from '@/components/admin/dashboard/AdminAuditLogsTab';
import { useAuth } from '@/context/AuthContext';
import { USER_ROLES } from '@/lib/auth/roles';

export default function SuperAdminAuditLogsPage() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const router = useRouter();
  const [showAccountTooltip, setShowAccountTooltip] = useState(false);
  const accessAttemptLogged = useRef(false);

  useEffect(() => {
    if (!loading && (!firebaseUser || profile?.role !== USER_ROLES.SUPER_ADMIN)) {
      router.replace('/');
    }
  }, [firebaseUser, loading, profile?.role, router]);

  useEffect(() => {
    if (loading || !firebaseUser || profile?.role === USER_ROLES.SUPER_ADMIN || accessAttemptLogged.current) return;
    accessAttemptLogged.current = true;
    void firebaseUser.getIdToken().then((token) => fetch('/api/audit-logs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'security.access_denied', path: '/superadmin/audit-logs' }),
    })).catch(() => undefined);
  }, [firebaseUser, loading, profile?.role]);

  if (loading || !firebaseUser || profile?.role !== USER_ROLES.SUPER_ADMIN) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-700">
        Loading…
      </div>
    );
  }

  const accountEmail = profile?.email ?? firebaseUser.email ?? '';

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <div className="relative isolate min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 bg-center bg-no-repeat opacity-80"
          style={{
            backgroundImage: "url('/images/admin-superadmin-dashboard-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.08)_0%,rgba(161,33,36,0.1)_48%,rgba(15,23,42,0.12)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(4,8,18,0.5)_0%,rgba(15,23,42,0.3)_52%,rgba(161,33,36,0.16)_100%),linear-gradient(180deg,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0.24)_44%,rgba(0,0,0,0.12)_100%)]" />
      </div>

      <div className="relative z-10">
        <nav className="glass-nav sticky top-0 z-50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/20">
                  <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 00-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-bold text-black">e-RoomReserve</h1>
                  <p className="-mt-0.5 text-[10px] font-bold text-black">Super Admin Dashboard</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div
                  className="relative"
                  onMouseEnter={() => setShowAccountTooltip(true)}
                  onMouseLeave={() => setShowAccountTooltip(false)}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-sm text-primary">
                    SA
                  </div>
                  {showAccountTooltip ? (
                    <div className="glass-card absolute right-0 top-full z-50 mt-2 w-56 !rounded-xl p-3 shadow-xl">
                      <p className="text-xs font-bold text-black">Super Admin</p>
                      {accountEmail ? (
                        <p className="mt-0.5 truncate text-[11px] text-black/70">{accountEmail}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-black transition-all hover:bg-primary/10 hover:text-primary"
                  title="Logout"
                  aria-label="Logout"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-5 flex justify-end">
            <button
              type="button"
              onClick={() => router.push('/superadmin/dashboard')}
              className="rounded-xl border border-[#a12124] bg-[#a12124] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-[#861b1e] hover:bg-[#861b1e]"
            >
              Back to dashboard
            </button>
          </div>
          <AdminAuditLogsTab />
        </main>
      </div>
    </div>
  );
}
