'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import { useAdminTab } from '@/context/AdminTabContext';
import { USER_ROLES } from '@/lib/domain/roles';
import Link from 'next/link';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

function DashboardLayoutInner({ children }: Readonly<DashboardLayoutProps>) {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { activeTab, setActiveTab } = useAdminTab();

  // Redirect to login if not authenticated, or to superadmin dashboard if Super Admin
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push('/');
    }
    if (!loading && profile?.role === USER_ROLES.SUPER_ADMIN) {
      router.push('/superadmin/dashboard');
    }
  }, [loading, firebaseUser, profile, router]);

  useEffect(() => {
    const tabTitles: Record<string, string> = {
      dashboard: "IRoomReserve | Dashboard",
      pending: "IRoomReserve | Pending",
      "add-rooms": "IRoomReserve | Add Rooms",
      feedback: "IRoomReserve | Feedback",
      "room-history": "IRoomReserve | Room History",
      inbox: "IRoomReserve | Inbox",
      "status-scheduling": "IRoomReserve | Status & Scheduling",
      "room-status-monitor": "IRoomReserve | Room Status Monitor",
      "ble-beacon-status": "IRoomReserve | BLE Beacon Status",
      "class-schedules": "IRoomReserve | Class Schedules",
      reserve: "IRoomReserve | Reserve",
      "my-reservations": "IRoomReserve | My Reservations",
      contact: "IRoomReserve | Contact",
      "room-status": "IRoomReserve | Room Status",
    };
    const pathToTab: Record<string, string> = {
      "/dashboard/inbox": "inbox",
      "/dashboard/feedback": "feedback",
      "/dashboard/reserve": "reserve",
      "/dashboard/reservations": "my-reservations",
      "/dashboard/contact": "contact",
      "/dashboard/room-status": "room-status",
      "/dashboard/ble-beacon": "ble-beacon-status",
    };
    const currentTab =
      pathname === "/dashboard" ? activeTab : pathToTab[pathname];
    document.title =
      tabTitles[currentTab ?? ""] ?? "IRoomReserve | Dashboard";
  }, [activeTab, pathname]);

  // Show loading while auth resolves
  if (loading || !firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-black">Loading...</p>
        </div>
      </div>
    );
  }

  // Build user object from real data
  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : firebaseUser?.displayName || 'User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const user = {
    name: displayName,
    initials,
    role: profile?.role || USER_ROLES.STUDENT,
  };

  const isAdmin = profile?.role === USER_ROLES.ADMIN;
  const isFaculty = profile?.role === USER_ROLES.FACULTY;
  const isUtility = profile?.role === USER_ROLES.UTILITY;
  const isStudent = !isAdmin && !isFaculty && !isUtility;
  const shouldUseRoleBackground =
    isUtility || isFaculty || isStudent || isAdmin;
  const roleBackgroundImage = isUtility
    ? '/images/utility-dashboard-bg.png'
    : isAdmin
      ? '/images/admin-superadmin-dashboard-bg.png'
      : '/images/student-faculty-dashboard-bg.png';
  const roleBackgroundOverlayClassName = isUtility
    ? 'absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.12)_0%,rgba(248,249,250,0.42)_18%,rgba(248,249,250,0.68)_48%,rgba(248,249,250,0.86)_100%)]'
    : isAdmin
      ? 'absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.2)_0%,rgba(248,249,250,0.38)_16%,rgba(248,249,250,0.64)_46%,rgba(248,249,250,0.86)_100%)]'
      : 'absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.16)_0%,rgba(248,249,250,0.34)_18%,rgba(248,249,250,0.62)_48%,rgba(248,249,250,0.84)_100%)]';

  // Shared mobile bottom nav icons
  const navIcons = {
    home: <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />,
    reserve: <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />,
    history: <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />,
    status: <path fillRule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v2h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 2a1 1 0 000 2h6a1 1 0 100-2H7zm0 4a1 1 0 000 2h10a1 1 0 100-2H7zm0 4a1 1 0 100 2h10a1 1 0 100-2H7z" clipRule="evenodd" />,
    contact: <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />,
    inbox: <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
  };

  // Student mobile bottom nav items
  const studentMobileNav = [
    { label: 'Home', href: '/dashboard', active: pathname === '/dashboard', icon: navIcons.home },
    { label: 'Reserve', href: '/dashboard/reserve', active: pathname === '/dashboard/reserve', icon: navIcons.reserve },
    { label: 'History', href: '/dashboard/reservations', active: pathname === '/dashboard/reservations', icon: navIcons.history },
    { label: 'Inbox', href: '/dashboard/inbox', active: pathname === '/dashboard/inbox', icon: navIcons.inbox },
    { label: 'Contact', href: '/dashboard/contact', active: pathname === '/dashboard/contact', icon: navIcons.contact },
  ];

  // Faculty mobile bottom nav items (same as student, no feedback)
  const facultyMobileNav = [
    { label: 'Home', href: '/dashboard', active: pathname === '/dashboard', icon: navIcons.home },
    { label: 'Reserve', href: '/dashboard/reserve', active: pathname === '/dashboard/reserve', icon: navIcons.reserve },
    { label: 'History', href: '/dashboard/reservations', active: pathname === '/dashboard/reservations', icon: navIcons.history },
    { label: 'Inbox', href: '/dashboard/inbox', active: pathname === '/dashboard/inbox', icon: navIcons.inbox },
    { label: 'Contact', href: '/dashboard/contact', active: pathname === '/dashboard/contact', icon: navIcons.contact },
  ];

  const utilityMobileNav = [
    { label: 'Home', href: '/dashboard', active: pathname === '/dashboard', icon: navIcons.home },
    { label: 'Status', href: '/dashboard/room-status', active: pathname === '/dashboard/room-status', icon: navIcons.status },
    { label: 'Inbox', href: '/dashboard/inbox', active: pathname === '/dashboard/inbox', icon: navIcons.inbox },
    { label: 'Contact', href: '/dashboard/contact', active: pathname === '/dashboard/contact', icon: navIcons.contact },
  ];

  return (
    <div className={`min-h-screen relative ${shouldUseRoleBackground ? 'isolate' : ''}`}>
      {shouldUseRoleBackground ? (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute inset-0 bg-center bg-no-repeat opacity-80"
            style={{
              backgroundImage: `url('${roleBackgroundImage}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(161,33,36,0.2),transparent_30%)]" />
          <div className={roleBackgroundOverlayClassName} />
        </div>
      ) : (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute bottom-20 -left-40 w-96 h-96 rounded-full bg-secondary/8 blur-3xl" />
        </div>
      )}

      <div className="relative z-10">
        <NavBar
          user={user}
          onLogout={logout}
          {...(isAdmin ? { activeTab, onTabChange: setActiveTab } : {})}
        />

        {children}
      </div>

      {/* Mobile Bottom Nav (Student only) */}
      {isStudent && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-nav border-t border-dark/10 z-40">
          <div className="grid grid-cols-5 h-16">
            {studentMobileNav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center justify-center transition-colors ${
                  item.active ? 'text-primary' : 'text-black hover:text-primary'
                }`}
              >
                <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 20 20">{item.icon}</svg>
                <span className="text-[10px] font-bold">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav (Faculty only) */}
      {isFaculty && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-nav border-t border-dark/10 z-40">
          <div className="grid grid-cols-5 h-16">
            {facultyMobileNav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center justify-center transition-colors ${
                  item.active ? 'text-primary' : 'text-black hover:text-primary'
                }`}
              >
                <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 20 20">{item.icon}</svg>
                <span className="text-[10px] font-bold">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isUtility && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-nav border-t border-dark/10 z-40">
          <div className="grid grid-cols-4 h-16">
            {utilityMobileNav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center justify-center transition-colors ${
                  item.active ? 'text-primary' : 'text-black hover:text-primary'
                }`}
              >
                <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 20 20">{item.icon}</svg>
                <span className="text-[10px] font-bold">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: Readonly<DashboardLayoutProps>) {
  return <DashboardLayoutInner>{children}</DashboardLayoutInner>;
}
