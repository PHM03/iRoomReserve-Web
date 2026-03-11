'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface NavBarProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
}

const NavBar: React.FC<NavBarProps> = ({ user }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const handleLogout = () => {
    router.push('/');
  };

  const getRoleColor = () => {
    switch (user.role.toLowerCase()) {
      case 'student':
        return 'bg-blue-100 text-blue-800';
      case 'faculty':
        return 'bg-green-100 text-green-800';
      case 'administrator':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left: Logo */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-red-800">iRoomReserve</h1>
            </div>
          </div>

          {/* Center: Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#" className="text-red-800 font-medium">Dashboard</a>
            <a href="#" className="text-gray-600 hover:text-red-800">My Reservations</a>
            <a href="#" className="text-gray-600 hover:text-red-800">Reserve a Room</a>
            <a href="#" className="text-gray-600 hover:text-red-800">Reports</a>
          </div>

          {/* Right: User Info & Logout */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-full bg-red-800 flex items-center justify-center text-white font-medium">
                {user.initials}
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor()}`}>
                {user.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
            >
              {isMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <a href="#" className="block px-3 py-2 rounded-md text-base font-medium text-red-800 bg-red-50">Dashboard</a>
            <a href="#" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-red-800 hover:bg-gray-50">My Reservations</a>
            <a href="#" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-red-800 hover:bg-gray-50">Reserve a Room</a>
            <a href="#" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-red-800 hover:bg-gray-50">Reports</a>
          </div>
        </div>
      )}
    </nav>
  );
};

export default NavBar;
