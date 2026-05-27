'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import AdminDashboard from '@/components/dashboards/AdminDashboard';
import type { AdminTab } from '@/components/layout/NavBar';
import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import { USER_ROLES } from '@/lib/auth/roles';
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  onUnreadNotifications,
  shouldDeleteNotificationOnClick,
  type Notification,
} from '@/lib/notifications/notifications';

type CampusOverride = 'main' | 'digi';

const CAMPUS_NAMES: Record<CampusOverride, string> = {
  main: 'SDCA Main Campus',
  digi: 'SDCA Digital Campus',
};

const adminLinks: Array<{ label: string; tab: AdminTab }> = [
  { label: 'Dashboard', tab: 'dashboard' },
  { label: 'Pending', tab: 'pending' },
  { label: 'Manage Rooms', tab: 'manage-rooms' },
  { label: 'Feedback', tab: 'feedback' },
  { label: 'Reservation History', tab: 'reservation-history' },
  { label: 'Inbox', tab: 'inbox' },
];

const statusSchedulingLinks = [
  { label: 'Room Status Monitoring', pathname: '/admin/room-status' },
  { label: 'Class Schedules', pathname: '/admin/class-schedules' },
];

const navItemBaseClasses =
  'font-ui-bold rounded-lg bg-transparent text-[0.95rem] uppercase tracking-tight whitespace-nowrap leading-none transition-colors duration-200 ease-in-out';
const navItemActiveClasses = 'bg-transparent text-[#a12124] shadow-none';
const navItemInactiveClasses =
  'bg-transparent text-[#343434] hover:bg-transparent hover:text-[#a12124] hover:shadow-none';
const navIconButtonClasses =
  'rounded-lg bg-transparent p-2 text-[#343434] transition-colors duration-200 ease-in-out hover:bg-transparent hover:text-[#a12124]';
const navbarBoldStyle = {
  fontFamily: 'var(--font-century-gothic-bold)',
  fontWeight: 700 as const,
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

interface ChevronDownIconProps {
  open: boolean;
}

function ChevronDownIcon({ open }: Readonly<ChevronDownIconProps>) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

interface SuperAdminCampusNavBarProps {
  activeTab: AdminTab;
  campusOverride: CampusOverride;
  email?: string;
  initials: string;
  onBack: () => void;
  onLogout: () => void;
  onTabChange: (tab: AdminTab) => void;
  uid?: string;
}

function SuperAdminCampusNavBar({
  activeTab,
  campusOverride,
  email,
  initials,
  onBack,
  onLogout,
  onTabChange,
  uid,
}: Readonly<SuperAdminCampusNavBarProps>) {
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isMobileStatusMenuOpen, setIsMobileStatusMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserTooltip, setShowUserTooltip] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        navRef.current &&
        event.target instanceof Node &&
        !navRef.current.contains(event.target)
      ) {
        setIsMenuOpen(false);
        setIsStatusMenuOpen(false);
        setIsMobileStatusMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!uid) return;

    const unsubscribe = onUnreadNotifications(uid, (next) => setNotifications(next));

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        event.target instanceof Node &&
        !notificationRef.current.contains(event.target)
      ) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const getNavItemClasses = (isActive: boolean) =>
    `${navItemBaseClasses} ${isActive ? navItemActiveClasses : navItemInactiveClasses}`;

  const closeMenus = () => {
    setIsStatusMenuOpen(false);
    setIsMenuOpen(false);
    setIsMobileStatusMenuOpen(false);
  };

  const handleAdminTabClick = (tab: AdminTab) => {
    onTabChange(tab);
    closeMenus();
  };

  const handleStatusLinkClick = (pathname: string) => {
    closeMenus();
    router.push(`${pathname}?campus=${campusOverride}`);
  };

  const handleMarkAllRead = async () => {
    if (!uid) return;
    await markAllNotificationsRead(uid);
  };

  const handleNotificationClick = async (notification: Notification) => {
    const isPending = notification.type === 'new_reservation';

    try {
      if (isPending) {
        const shouldDelete = await shouldDeleteNotificationOnClick(
          notification,
          email
        );

        if (shouldDelete) {
          try {
            await deleteNotification(notification.id);
          } catch (deleteError) {
            console.warn('Failed to delete stale notification, marking as read instead:', deleteError);
            await markNotificationRead(notification.id);
          }
          setShowNotifications(false);
          return;
        }
      } else {
        await markNotificationRead(notification.id);
      }
    } catch (error) {
      console.warn('Failed to process notification click:', error);
      if (isPending) {
        try {
          await markNotificationRead(notification.id);
        } catch (readError) {
          console.warn('Failed to hide pending notification after click:', readError);
        }
      }
    }

    setShowNotifications(false);
    onTabChange('inbox');
  };

  const isStatusSchedulingActive =
    isStatusMenuOpen || isMobileStatusMenuOpen || activeTab === 'status-scheduling';

  const subtleBackButtonClasses =
    'hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-transparent px-2 py-1.5 text-[11px] font-medium leading-none text-[#343434]/70 transition-colors duration-200 ease-in-out hover:bg-transparent hover:text-[#a12124]';

  const renderStatusSchedulingLinks = (mobile = false) =>
    statusSchedulingLinks.map((link) => (
      <button
        key={link.pathname}
        type="button"
        onClick={() => handleStatusLinkClick(link.pathname)}
        className={
          mobile
            ? `block w-full rounded-xl px-3 py-2.5 text-left text-sm ${getNavItemClasses(false)}`
            : `flex w-full items-center rounded-xl px-3 py-2.5 text-sm ${getNavItemClasses(false)}`
        }
        style={navbarBoldStyle}
      >
        {link.label}
      </button>
    ));

  return (
    <nav ref={navRef} className="glass-nav fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between py-5">
          <div className="flex items-center">
            <h1 className="text-xl text-[#343434]" style={navbarBoldStyle}>
              iRoomReserve
            </h1>
          </div>

          <div className="hidden md:flex flex-1 items-center justify-center gap-2 px-3">
            {adminLinks.map((link) => (
              <button
                key={link.tab}
                onClick={() => handleAdminTabClick(link.tab)}
                className={`flex shrink-0 items-center px-2.5 py-2 ${getNavItemClasses(
                  activeTab === link.tab
                )}`}
                style={navbarBoldStyle}
              >
                <span className="whitespace-nowrap" style={navbarBoldStyle}>
                  {link.label}
                </span>
              </button>
            ))}

            <div className="relative flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => setIsStatusMenuOpen((current) => !current)}
                className={`flex items-center gap-2 px-2.5 py-2 ${getNavItemClasses(
                  isStatusSchedulingActive
                )}`}
                style={navbarBoldStyle}
                aria-haspopup="menu"
                aria-expanded={isStatusMenuOpen}
              >
                <span className="whitespace-nowrap" style={navbarBoldStyle}>
                  Status & Scheduling
                </span>
                <ChevronDownIcon open={isStatusMenuOpen} />
              </button>

              {isStatusMenuOpen ? (
                <div className="absolute left-0 top-full mt-2 w-56 glass-card !rounded-2xl p-2 shadow-xl">
                  {renderStatusSchedulingLinks()}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className={subtleBackButtonClasses}
              title="Super Admin Dashboard"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span>Super Admin Dashboard</span>
            </button>

            <div ref={notificationRef} className="relative">
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className={`${navIconButtonClasses} relative`}
                title="Notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div
                  className="absolute right-0 top-full mt-2 w-80 sm:w-96 !rounded-xl overflow-hidden z-50 border border-dark/12 shadow-2xl shadow-black/20"
                  style={{
                    background: 'rgba(248, 246, 242, 0.98)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div className="flex items-center justify-between p-4 border-b border-dark/10">
                    <h4 className="font-bold text-black text-sm">Notifications</h4>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => void handleMarkAllRead()}
                        className="text-xs text-primary font-bold hover:text-primary-hover transition-colors"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-sm text-black/80">No new notifications</p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className="p-3 border-b border-dark/5 hover:bg-primary/8 transition-colors flex items-start gap-3 cursor-pointer"
                          onClick={() => void handleNotificationClick(notification)}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              notification.type === 'reservation_approved'
                                ? 'bg-green-500/20'
                                : notification.type === 'reservation_rejected'
                                  ? 'bg-red-500/20'
                                  : 'bg-primary/20'
                            }`}
                          >
                            <svg
                              className={`w-4 h-4 ${
                                notification.type === 'reservation_approved'
                                  ? 'ui-text-green'
                                  : notification.type === 'reservation_rejected'
                                    ? 'ui-text-red'
                                    : 'text-primary'
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              {notification.type === 'reservation_approved' ? (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              ) : notification.type === 'reservation_rejected' ? (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              ) : (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                />
                              )}
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-black">{notification.title}</p>
                            <p className="text-[11px] text-black/80 mt-0.5 leading-relaxed">
                              {notification.message}
                            </p>
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void markNotificationRead(notification.id);
                            }}
                            className="text-black/70 hover:text-primary transition-colors shrink-0"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div
                className="relative"
                onMouseEnter={() => setShowUserTooltip(true)}
                onMouseLeave={() => setShowUserTooltip(false)}
              >
                <div
                  className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm cursor-default"
                  style={navbarBoldStyle}
                >
                  {initials}
                </div>
                {showUserTooltip && (
                  <div className="absolute right-0 top-full mt-2 w-52 glass-card !rounded-xl p-3 shadow-xl z-50">
                    <p className="text-xs font-bold text-black capitalize">Super Admin</p>
                    {email && (
                      <p className="text-[11px] text-black/70 mt-0.5 truncate">{email}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button onClick={onLogout} className={navIconButtonClasses} title="Logout">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>

            <button
              onClick={() => setIsMenuOpen((current) => !current)}
              className={`md:hidden ${navIconButtonClasses}`}
            >
              {isMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen ? (
        <div className="md:hidden border-t border-[#343434]/8 bg-[#f5f5f5]/80 backdrop-blur-xl">
          <div className="px-3 py-2 space-y-1">
            {adminLinks.map((link) => (
              <button
                key={link.tab}
                onClick={() => handleAdminTabClick(link.tab)}
                className={`flex w-full items-center px-3 py-2.5 text-left ${getNavItemClasses(
                  activeTab === link.tab
                )}`}
                style={navbarBoldStyle}
              >
                {link.label}
              </button>
            ))}

            <div className="rounded-xl border border-dark/5 bg-white/50">
              <button
                type="button"
                onClick={() =>
                  setIsMobileStatusMenuOpen((current) => !current)
                }
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left ${getNavItemClasses(
                  isStatusSchedulingActive
                )}`}
                style={navbarBoldStyle}
              >
                <span>Status & Scheduling</span>
                <ChevronDownIcon open={isMobileStatusMenuOpen} />
              </button>

              {isMobileStatusMenuOpen ? (
                <div className="px-2 pb-2">
                  {renderStatusSchedulingLinks(true)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </nav>
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
        <SuperAdminCampusNavBar
          activeTab={activeTab}
          campusOverride={campusOverride}
          email={profile?.email || firebaseUser.email || undefined}
          initials={initials}
          onBack={() => router.push('/superadmin/dashboard')}
          onLogout={handleLogout}
          onTabChange={setActiveTab}
          uid={firebaseUser.uid}
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
