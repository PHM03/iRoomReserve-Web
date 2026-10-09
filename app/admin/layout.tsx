'use client';

import React, { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import NavBar from '@/components/layout/NavBar';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import { normalizeRole, USER_ROLES } from '@/lib/auth/roles';

interface AdminLayoutProps {
  children: React.ReactNode;
}

type CampusOverride = 'main' | 'digi';

function getCampusOverride(value: string | null): CampusOverride | undefined {
  return value === 'main' || value === 'digi' ? value : undefined;
}

function LoadingState() {
  return <LoadingScreen />;
}

function AdminLayoutInner({ children }: Readonly<AdminLayoutProps>) {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const { activeTab, setActiveTab } = useAdminTab();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deniedPathsLogged = useRef(new Set<string>());
  const normalizedRole = normalizeRole(profile?.role);
  const isSuperAdminAllowedPage =
    normalizedRole === USER_ROLES.SUPER_ADMIN &&
    ['/admin/room-status', '/admin/ble-status', '/admin/class-schedules'].includes(pathname);
  const canRenderAdminLayout =
    normalizedRole === USER_ROLES.ADMIN || isSuperAdminAllowedPage;
  const navRole = isSuperAdminAllowedPage
    ? USER_ROLES.ADMIN
    : profile?.role || USER_ROLES.ADMIN;
  const superAdminCampus = isSuperAdminAllowedPage
    ? getCampusOverride(searchParams.get('campus'))
    : undefined;

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push('/');
      return;
    }

    if (
      !loading &&
      normalizedRole === USER_ROLES.SUPER_ADMIN &&
      !isSuperAdminAllowedPage
    ) {
      router.push('/superadmin/dashboard');
      return;
    }

    if (!loading && firebaseUser && !canRenderAdminLayout) {
      router.push('/dashboard');
    }
  }, [
    canRenderAdminLayout,
    firebaseUser,
    isSuperAdminAllowedPage,
    loading,
    normalizedRole,
    router,
  ]);

  useEffect(() => {
    if (loading || !firebaseUser || canRenderAdminLayout || deniedPathsLogged.current.has(pathname)) return;
    deniedPathsLogged.current.add(pathname);
    void firebaseUser.getIdToken().then((token) => fetch('/api/audit-logs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'security.access_denied', path: pathname }),
    })).catch(() => undefined);
  }, [canRenderAdminLayout, firebaseUser, loading, pathname]);

  useEffect(() => {
    const pathTitles: Record<string, string> = {
      '/admin/room-status': 'e-RoomReserve | Room Status Monitor',
      '/admin/ble-status': 'e-RoomReserve | BLE Beacon Status',
      '/admin/class-schedules': 'e-RoomReserve | Class Schedules',
    };

    document.title = pathTitles[pathname] ?? 'e-RoomReserve | Admin';
  }, [pathname]);

  if (loading || !firebaseUser || !canRenderAdminLayout) {
    return <LoadingState />;
  }

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : firebaseUser.displayName || 'User';
  const initials = displayName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen relative isolate">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
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
        <NavBar
          user={{
            name: displayName,
            email: profile?.email || firebaseUser?.email || undefined,
            initials,
            role: navRole,
          }}
          onLogout={logout}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isSuperAdminLimitedNav={isSuperAdminAllowedPage}
          superAdminCampus={superAdminCampus}
        />
        {children}
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: Readonly<AdminLayoutProps>) {
  return (
    <Suspense fallback={<LoadingState />}>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </Suspense>
  );
}
