'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Admin Tab Type ──────────────────────────────────────────────
export type AdminTab = 'add-rooms' | 'feedback' | 'pending' | 'status' | 'room-history';

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

const NavBar: React.FC<NavBarProps> = ({ user, onLogout, activeTab, onTabChange }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
    router.push('/');
  };

  const getRoleBadgeStyle = () => {
    switch (user.role.toLowerCase()) {
      case 'student':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'faculty':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'utility staff':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'administrator':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'super admin':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  // ─── Admin-specific nav links ─────────────────────────────────
  const adminLinks: { label: string; tab: AdminTab; icon: React.ReactNode }[] = [
    {
      label: 'Add Rooms',
      tab: 'add-rooms',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      ),
    },
    {
      label: 'Feedback',
      tab: 'feedback',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
    },
    {
      label: 'Pending Reservation',
      tab: 'pending',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Status',
      tab: 'status',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: 'Room History',
      tab: 'room-history',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
  ];

  // ─── Default nav links for other roles ────────────────────────
  const defaultLinks = [
    { label: 'Dashboard', href: '#', active: true },
    { label: 'My Reservations', href: '#', active: false },
    { label: 'Reserve a Room', href: '#', active: false },
    { label: 'Reports', href: '#', active: false },
  ];

  const isAdmin = user.role.toLowerCase() === 'administrator';

  return (
    <nav className="glass-nav sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left: Logo */}
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-white">iRoomReserve</h1>
          </div>

          {/* Center: Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {isAdmin ? (
              adminLinks.map((link) => (
                <button
                  key={link.tab}
                  onClick={() => onTabChange?.(link.tab)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === link.tab
                      ? 'text-primary bg-primary/10'
                      : 'text-white/50 hover:text-primary hover:bg-white/5'
                  }`}
                >
                  {link.icon}
                  {link.label}
                </button>
              ))
            ) : (
              defaultLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    link.active
                      ? 'text-primary bg-primary/10'
                      : 'text-white/50 hover:text-primary hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </a>
              ))
            )}
          </div>

          {/* Right: User Info & Logout */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                {user.initials}
              </div>
              <span className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getRoleBadgeStyle()}`}>
                {user.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-white/40 hover:text-primary hover:bg-white/5 transition-all"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg text-white/40 hover:text-primary hover:bg-white/5 transition-all"
            >
              {isMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-white/5">
          <div className="px-3 py-2 space-y-1">
            {isAdmin ? (
              adminLinks.map((link) => (
                <button
                  key={link.tab}
                  onClick={() => {
                    onTabChange?.(link.tab);
                    setIsMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === link.tab
                      ? 'text-primary bg-primary/10'
                      : 'text-white/50 hover:text-primary hover:bg-white/5'
                  }`}
                >
                  {link.icon}
                  {link.label}
                </button>
              ))
            ) : (
              defaultLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    link.active
                      ? 'text-primary bg-primary/10'
                      : 'text-white/50 hover:text-primary hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default NavBar;
