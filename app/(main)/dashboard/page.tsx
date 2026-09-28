'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAdminTab } from '@/context/AdminTabContext';
import { normalizeRole, USER_ROLES } from '@/lib/auth/roles';
import StudentDashboard from '@/components/dashboards/StudentDashboard';
import FacultyDashboard from '@/components/dashboards/FacultyDashboard';
import UtilityStaffDashboard from '@/components/dashboards/UtilityStaffDashboard';
import AdminDashboard from '@/components/dashboards/AdminDashboard';

export default function Dashboard() {
  const { profile } = useAuth();
  const { activeTab } = useAdminTab();

  const firstName = profile?.firstName || 'User';

  // Render the role-specific dashboard
  switch (normalizeRole(profile?.role)) {
    case USER_ROLES.FACULTY:
      return <FacultyDashboard firstName={firstName} />;
    case USER_ROLES.UTILITY:
      return <UtilityStaffDashboard firstName={firstName} />;
    case USER_ROLES.ADMIN:
      return <AdminDashboard firstName={firstName} activeTab={activeTab} />;
    case USER_ROLES.STUDENT:
    default:
      return <StudentDashboard firstName={firstName} />;
  }
}
