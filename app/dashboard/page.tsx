'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import type { AdminTab } from '@/components/NavBar';
import StudentDashboard from '@/components/dashboards/StudentDashboard';
import FacultyDashboard from '@/components/dashboards/FacultyDashboard';
import UtilityStaffDashboard from '@/components/dashboards/UtilityStaffDashboard';
import AdminDashboard from '@/components/dashboards/AdminDashboard';

export default function Dashboard() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const router = useRouter();

  // Admin tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Redirect to login if not authenticated, or to superadmin dashboard if Super Admin
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push('/');
    }
    if (!loading && profile?.role === 'Super Admin') {
      router.push('/superadmin/dashboard');
    }
  }, [loading, firebaseUser, profile, router]);

  // Show loading while auth resolves or redirecting
  if (loading || !firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-white/50">Loading...</p>
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
    role: profile?.role || 'Student',
  };

  const firstName = profile?.firstName || 'User';
  const isAdmin = profile?.role === 'Administrator';

  // Render the role-specific dashboard
  const renderDashboard = () => {
    switch (profile?.role) {
      case 'Faculty':
      case 'Faculty Professor':
        return <FacultyDashboard firstName={firstName} />;
      case 'Utility Staff':
      case 'Utility':
        return <UtilityStaffDashboard firstName={firstName} />;
      case 'Administrator':
        return <AdminDashboard firstName={firstName} activeTab={activeTab} />;
      case 'Student':
      default:
        return <StudentDashboard firstName={firstName} />;
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Decorative background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-20 -left-40 w-96 h-96 rounded-full bg-secondary/8 blur-3xl" />
      </div>

      <NavBar
        user={user}
        onLogout={logout}
        {...(isAdmin ? { activeTab, onTabChange: setActiveTab } : {})}
      />
      {renderDashboard()}
    </div>
  );
}
