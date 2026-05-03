'use client';

import React from 'react';
import MemberDashboard from './MemberDashboard';

interface StudentDashboardProps {
  firstName: string;
}

export default function StudentDashboard({
  firstName,
}: Readonly<StudentDashboardProps>) {
  return <MemberDashboard firstName={firstName} welcomeEmoji="🎓" />;
}
