'use client';

import AssignedRoomScheduleSection from '@/components/schedules/AssignedRoomScheduleSection';
import { useAuth } from '@/context/AuthContext';
import { normalizeRole, USER_ROLES } from '@/lib/auth/roles';

export default function ClassSchedulesPage() {
  const { profile } = useAuth();
  const role = normalizeRole(profile?.role);
  const roleLabel =
    role === USER_ROLES.FACULTY
      ? 'Faculty Professor'
      : role === USER_ROLES.UTILITY
        ? 'Utility Staff'
        : null;

  if (!roleLabel) {
    return (
      <main className="relative z-10 min-h-screen pb-24 pt-[100px] md:pb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="dashboard-empty-state rounded-2xl p-10 text-center backdrop-blur-xl">
            <h2 className="text-xl font-bold text-gray-900">Class Schedules</h2>
            <p className="mt-2 text-sm text-gray-500">
              This page is available to Faculty and Utility Staff.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const isUtilityStaff = role === USER_ROLES.UTILITY;

  return (
    <main className="relative z-10 min-h-screen pb-24 pt-[100px] md:pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="mb-8 rounded-2xl border border-white/35 bg-white/75 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            {roleLabel} class schedules
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            Class Schedules
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {isUtilityStaff
              ? 'View class schedules for rooms in your authorized campus buildings.'
              : 'Create and manage class schedules for campus rooms.'}
          </p>
        </section>

        <AssignedRoomScheduleSection
          roleLabel={roleLabel}
          showLocationFilters
        />
      </div>
    </main>
  );
}
