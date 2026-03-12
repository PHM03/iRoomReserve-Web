'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface NavBarProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  onLogout?: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ user, onLogout }) => {
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
      case 'administrator':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'super admin':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default:
        return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const navLinks = [
    { label: 'Dashboard', href: '#', active: true },
    { label: 'My Reservations', href: '#', active: false },
    { label: 'Reserve a Room', href: '#', active: false },
    { label: 'Reports', href: '#', active: false },
  ];

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
            {navLinks.map((link) => (
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
            ))}
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
            {navLinks.map((link) => (
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
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default NavBar;
