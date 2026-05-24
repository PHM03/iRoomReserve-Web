'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import NavBar from '@/components/layout/NavBar';
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
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <svg
          className="animate-spin h-8 w-8 text-primary mx-auto mb-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="text-black">Loading...</p>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: Readonly<AdminLayoutProps>) {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const { activeTab, setActiveTab } = useAdminTab();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const normalizedRole = normalizeRole(profile?.role);
  const isSuperAdminAllowedPage =
    normalizedRole === USER_ROLES.SUPER_ADMIN &&
    ['/admin/room-status', '/admin/class-schedules'].includes(pathname);
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
    const pathTitles: Record<string, string> = {
      '/admin/room-status': 'iRoomReserve | Room Status Monitor',
      '/admin/ble-status': 'iRoomReserve | BLE Beacon Status',
      '/admin/class-schedules': 'iRoomReserve | Class Schedules',
    };

    document.title = pathTitles[pathname] ?? 'iRoomReserve | Admin';
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
