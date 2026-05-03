'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

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
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

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

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }

    router.push('/');
  };

  const normalizedRole = normalizeRole(user.role);
  const isFacultyRole = normalizedRole === USER_ROLES.FACULTY;
  const isUtilityRole = normalizedRole === USER_ROLES.UTILITY;
  const isStudentRole = normalizedRole === USER_ROLES.STUDENT;
  const isAdmin = normalizedRole === USER_ROLES.ADMIN;
  const isAdminRoute = pathname.startsWith('/admin');
  const isStatusSchedulingActive =
    isAdminRoute || activeTab === 'status-scheduling';

  const getRoleBadgeStyle = () => {
    switch (normalizedRole) {
      case USER_ROLES.STUDENT:
        return 'bg-blue-100/90 text-blue-800 border-blue-300/80';
      case USER_ROLES.FACULTY:
        return 'bg-green-100/90 text-green-800 border-green-300/80';
      case USER_ROLES.UTILITY:
        return 'bg-teal-100/90 text-teal-800 border-teal-300/80';
      case USER_ROLES.ADMIN:
        return 'bg-red-100/90 text-red-800 border-red-300/80';
      case USER_ROLES.SUPER_ADMIN:
        return 'bg-purple-100/90 text-purple-800 border-purple-300/80';
      default:
        return 'bg-dark/10 text-black border-dark/20';
    }
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

  return (
    <nav className="glass-nav fixed top-0 left-0 right-0 z-50">
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
                className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm"
                style={navbarBoldStyle}
              >
                {user.initials}
              </div>
              <span
                className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${getRoleBadgeStyle()}`}
                style={navbarBoldStyle}
              >
                {user.role}
              </span>
            </div>
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
