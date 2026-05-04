'use client';

import React from 'react';
import MemberDashboard from './MemberDashboard';

interface FacultyDashboardProps {
  firstName: string;
}

export default function FacultyDashboard({
  firstName,
}: Readonly<FacultyDashboardProps>) {
  return <MemberDashboard firstName={firstName} welcomeEmoji="📚" />;
}
