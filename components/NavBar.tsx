'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import {
  markAllNotificationsRead,
  markNotificationRead,
  Notification,
  onUnreadNotifications,
} from '@/lib/notifications';
import { normalizeRole, USER_ROLES } from '@/lib/domain/roles';

export type AdminTab =
  | 'dashboard'
  | 'add-rooms'
  | 'feedback'
  | 'status-scheduling'
  | 'room-history'
  | 'inbox'
  | 'pending';

interface NavBarProps {
  user: {
    name: string;
    email?: string;
    initials: string;
    role: string;
  };
  onLogout?: () => void;
  activeTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
}

const adminLinks: Array<{ label: string; tab: AdminTab }> = [
  { label: 'Dashboard', tab: 'dashboard' },
  { label: 'Pending', tab: 'pending' },
  { label: 'Add Rooms', tab: 'add-rooms' },
  { label: 'Feedback', tab: 'feedback' },
  { label: 'Room History', tab: 'room-history' },
  { label: 'Inbox', tab: 'inbox' },
];

const statusSchedulingLinks = [
  { label: 'Room Status Monitor', href: '/admin/room-status' },
  { label: 'BLE Beacon Status', href: '/admin/ble-status' },
  { label: 'Class Schedules', href: '/admin/class-schedules' },
];

const navItemBaseClasses =
  'font-ui-bold rounded-lg bg-transparent text-[0.95rem] uppercase tracking-tight whitespace-nowrap leading-none transition-colors duration-200 ease-in-out';
const navItemActiveClasses = 'bg-transparent text-[#a12124] shadow-none';
const navItemInactiveClasses =
  'bg-transparent text-[#343434] hover:bg-transparent hover:text-[#a12124] hover:shadow-none';

function ChevronDownIcon({ open }: { open: boolean }) {
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

const NavBar: React.FC<NavBarProps> = ({
  user,
  onLogout,
  activeTab,
  onTabChange,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isMobileStatusMenuOpen, setIsMobileStatusMenuOpen] = useState(false);
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserTooltip, setShowUserTooltip] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const normalizedRole = normalizeRole(user.role);
  const isFacultyRole = normalizedRole === USER_ROLES.FACULTY;
  const isUtilityRole = normalizedRole === USER_ROLES.UTILITY;
  const isStudentRole = normalizedRole === USER_ROLES.STUDENT;
  const isAdmin = normalizedRole === USER_ROLES.ADMIN;
  const isAdminRoute = pathname.startsWith('/admin');
  const isStatusSchedulingActive =
    isAdminRoute || activeTab === 'status-scheduling';

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        event.target instanceof Node &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsStatusMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!uid || isAdmin) return;

    const unsubscribe = onUnreadNotifications(uid, (next) => setNotifications(next));

    return () => unsubscribe();
  }, [uid, isAdmin]);

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

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }

    router.push('/');
  };

  const defaultLinks = isUtilityRole
    ? [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Room Status', href: '/dashboard/room-status' },
        { label: 'BLE Beacon', href: '/dashboard/ble-beacon' },
        { label: 'Inbox', href: '/dashboard/inbox' },
      ]
    : [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reserve', href: '/dashboard/reserve' },
        { label: 'My Reservations', href: '/dashboard/reservations' },
        { label: 'Inbox', href: '/dashboard/inbox' },
        { label: 'Contact', href: '/dashboard/contact' },
        ...(!isFacultyRole ? [{ label: 'Feedback', href: '/dashboard/feedback' }] : []),
      ];

  const getNavItemClasses = (isActive: boolean) =>
    `${navItemBaseClasses} ${isActive ? navItemActiveClasses : navItemInactiveClasses}`;
  const navIconButtonClasses =
    'rounded-lg bg-transparent p-2 text-[#343434] transition-colors duration-200 ease-in-out hover:bg-transparent hover:text-[#a12124]';
  const defaultLinkPaddingClasses = isStudentRole ? 'px-5' : 'px-3';
  const navCenterPaddingClasses = isAdmin ? 'px-3' : 'px-10';
  const adminLinkPaddingClasses = 'px-2.5';
  const navbarBoldStyle = {
    fontFamily: 'var(--font-century-gothic-bold)',
    fontWeight: 700 as const,
  };

  const closeMenus = () => {
    setIsStatusMenuOpen(false);
    setIsMenuOpen(false);
    setIsMobileStatusMenuOpen(false);
  };

  const handleAdminTabClick = (tab: AdminTab) => {
    onTabChange?.(tab);
    closeMenus();

    if (pathname !== '/dashboard') {
      router.push('/dashboard');
    }
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser) return;
    await markAllNotificationsRead(firebaseUser.uid);
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markNotificationRead(notification.id);
    setShowNotifications(false);

    if (notification.reservationId) {
      router.push(`/dashboard/inbox?reservationId=${encodeURIComponent(notification.reservationId)}`);
      return;
    }

    router.push('/dashboard/inbox');
  };

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between py-5">
          <div className="flex items-center">
            <h1 className="text-xl text-[#343434]" style={navbarBoldStyle}>
              iRoomReserve
            </h1>
          </div>

          <div
            className={`hidden md:flex flex-1 items-center justify-center gap-2 ${navCenterPaddingClasses}`}
          >
            {isAdmin ? (
              <>
                {adminLinks.map((link) => (
                  <button
                    key={link.tab}
                    onClick={() => handleAdminTabClick(link.tab)}
                    className={`flex shrink-0 items-center ${adminLinkPaddingClasses} py-2 ${getNavItemClasses(
                      !isAdminRoute && activeTab === link.tab
                    )}`}
                    style={navbarBoldStyle}
                  >
                    <span className="whitespace-nowrap" style={navbarBoldStyle}>
                      {link.label}
                    </span>
                  </button>
                ))}

                <div ref={dropdownRef} className="relative flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => setIsStatusMenuOpen((current) => !current)}
                    className={`flex items-center gap-2 ${adminLinkPaddingClasses} py-2 ${getNavItemClasses(
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
                    <div className="absolute left-0 top-full mt-2 w-64 glass-card !rounded-2xl p-2 shadow-xl">
                      {statusSchedulingLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={closeMenus}
                          className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm ${getNavItemClasses(
                            pathname === link.href
                          )}`}
                          style={navbarBoldStyle}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              defaultLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`shrink-0 ${defaultLinkPaddingClasses} py-2 whitespace-nowrap ${getNavItemClasses(
                    pathname === link.href
                  )}`}
                  style={navbarBoldStyle}
                >
                  <span style={navbarBoldStyle}>{link.label}</span>
                </Link>
              ))
            )}
          </div>

          <div className="flex items-center space-x-3">
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
                  {user.initials}
                </div>
                {showUserTooltip && (
                  <div className="absolute right-0 top-full mt-2 w-52 glass-card !rounded-xl p-3 shadow-xl z-50">
                    <p className="text-xs font-bold text-black capitalize">{user.role}</p>
                    {user.email && (
                      <p className="text-[11px] text-black/70 mt-0.5 truncate">{user.email}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!isAdmin && (
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
                          onClick={handleMarkAllRead}
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
                              onClick={(e) => {
                                e.stopPropagation();
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
            )}
            <button onClick={handleLogout} className={navIconButtonClasses} title="Logout">
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
            {isAdmin ? (
              <>
                {adminLinks.map((link) => (
                  <button
                    key={link.tab}
                    onClick={() => handleAdminTabClick(link.tab)}
                    className={`flex w-full items-center px-3 py-2.5 text-left ${getNavItemClasses(
                      !isAdminRoute && activeTab === link.tab
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
                      {statusSchedulingLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={closeMenus}
                          className={`block rounded-xl px-3 py-2.5 text-sm ${getNavItemClasses(
                            pathname === link.href
                          )}`}
                          style={navbarBoldStyle}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              defaultLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block px-3 py-2.5 ${getNavItemClasses(pathname === link.href)}`}
                  style={navbarBoldStyle}
                >
                  {link.label}
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </nav>
  );
};

export default NavBar;
