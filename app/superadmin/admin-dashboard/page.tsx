'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import AdminDashboard from '@/components/dashboards/AdminDashboard';
import NavBar from '@/components/layout/NavBar';
import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import { USER_ROLES } from '@/lib/auth/roles';

type CampusOverride = 'main' | 'digi';

const CAMPUS_NAMES: Record<CampusOverride, string> = {
  main: 'SDCA Main Campus',
  digi: 'SDCA Digital Campus',
};

function getCampusOverride(value: string | null): CampusOverride | null {
  return value === 'main' || value === 'digi' ? value : null;
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-black">Loading...</p>
      </div>
    </div>
  );
}

function SuperAdminAdminDashboardContent() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const { activeTab, setActiveTab } = useAdminTab();
  const router = useRouter();
  const searchParams = useSearchParams();
  const campusOverride = getCampusOverride(searchParams.get('campus'));

  useEffect(() => {
    if (!campusOverride) {
      router.replace('/superadmin/dashboard');
      return;
    }

    if (loading) {
      return;
    }

    if (!firebaseUser) {
      router.replace('/');
      return;
    }

    if (profile?.role !== USER_ROLES.SUPER_ADMIN) {
      router.replace('/dashboard');
    }
  }, [campusOverride, firebaseUser, loading, profile?.role, router]);

  if (
    loading ||
    !campusOverride ||
    !firebaseUser ||
    profile?.role !== USER_ROLES.SUPER_ADMIN
  ) {
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
  const campusName = CAMPUS_NAMES[campusOverride];

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

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
            email: profile?.email || firebaseUser.email || undefined,
            initials,
            role: 'Administrator',
          }}
          onLogout={handleLogout}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isSuperAdminLimitedNav
          superAdminCampus={campusOverride}
        />

        <div className="superadmin-campus-dashboard">
          <style>{`
            .superadmin-campus-dashboard main > div:first-child p.text-xs.font-bold.text-gray-600 span {
              font-size: 0;
            }

            .superadmin-campus-dashboard main > div:first-child p.text-xs.font-bold.text-gray-600 span::after {
              content: "${campusName}";
              font-size: 0.75rem;
              line-height: 1rem;
            }
          `}</style>
          <AdminDashboard
            firstName={profile?.firstName || 'User'}
            activeTab={activeTab}
            campusOverride={campusOverride}
          />
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminAdminDashboardPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SuperAdminAdminDashboardContent />
    </Suspense>
  );
}
