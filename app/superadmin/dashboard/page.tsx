'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  onAllUsers,
  approveUser,
  approveAdmin,
  rejectUser,
  deleteUserAccount,
  disableUserAccount,
  enableUserAccount,
  ManagedUser,
} from '@/lib/auth';
import { getCampusName } from '@/lib/campusAssignments';
import { type ReservationCampus } from '@/lib/campuses';
import { USER_ROLES } from '@/lib/domain/roles';
import { seedBuildings } from '@/lib/seedBuildings';

type Tab = 'all' | 'students' | 'faculty' | 'utility' | 'admins' | 'pending';

export default function SuperAdminDashboard() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAccountTooltip, setShowAccountTooltip] = useState(false);

  // ─── Approval Modal State ─────────────────────────────────────
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [selectedCampus, setSelectedCampus] = useState<ReservationCampus | ''>('');
  const [modalLoading, setModalLoading] = useState(false);

  // ─── Delete Confirmation State ─────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [seedingBuildings, setSeedingBuildings] = useState(false);
  const [seedResult, setSeedResult] = useState<{
    created: string[];
    skipped: string[];
  } | null>(null);

  // Redirect if not super admin
  useEffect(() => {
    if (!loading && (!firebaseUser || profile?.role !== 'Super Admin')) {
      router.push('/');
    }
  }, [loading, firebaseUser, profile, router]);

  const seeded = useRef(false);

  // Real-time listener for ALL users
  useEffect(() => {
    let cancelled = false;

    const unsub = onAllUsers((nextUsers) => {
      if (cancelled) return;
      setAllUsers(nextUsers);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // ─── Computed Data ────────────────────────────────────────────
  const pendingUsers = allUsers.filter((u) => u.status === 'pending');
  const disabledUsers = allUsers.filter((u) => u.status === 'disabled');

  const students = allUsers.filter((u) => u.role === 'Student');
  const facultyProfessors = allUsers.filter((u) => u.role === USER_ROLES.FACULTY);
  const utilityUsers = allUsers.filter((u) => u.role === USER_ROLES.UTILITY);
  const administrators = allUsers.filter((u) => u.role === USER_ROLES.ADMIN);

  const currentUsers = (() => {
    switch (activeTab) {
      case 'students': return students;
      case 'faculty': return facultyProfessors;
      case 'utility': return utilityUsers;
      case 'admins': return administrators;
      case 'pending': return pendingUsers;
      case 'all':
      default: return allUsers;
    }
  })();

  // ─── Handlers ─────────────────────────────────────────────────
  const openApprovalModal = async (user: ManagedUser) => {
    setSelectedUser(user);
    setSelectedCampus(user.campus ?? '');
    setShowApprovalModal(true);
  };

  const handleApproveWithCampus = async () => {
    if (!selectedUser || !selectedCampus) return;
    setModalLoading(true);
    try {
      await approveAdmin(selectedUser.uid, selectedCampus, selectedUser.role);
    } catch (err) {
      console.warn('Failed to approve admin:', err);
    }
    setModalLoading(false);
    setShowApprovalModal(false);
    setSelectedUser(null);
    setSelectedCampus('');
  };

  const handleApprove = async (uid: string) => {
    setActionLoading(uid);
    try { await approveUser(uid); } catch (err) { console.warn('Failed to approve:', err); }
    setActionLoading(null);
  };

  const handleReject = async (uid: string) => {
    setActionLoading(uid);
    try { await rejectUser(uid); } catch (err) { console.warn('Failed to reject:', err); }
    setActionLoading(null);
  };

  const handleDisable = async (uid: string) => {
    setActionLoading(uid);
    try { await disableUserAccount(uid); } catch (err) { console.warn('Failed to disable:', err); }
    setActionLoading(null);
  };

  const handleEnable = async (uid: string) => {
    setActionLoading(uid);
    try { await enableUserAccount(uid); } catch (err) { console.warn('Failed to enable:', err); }
    setActionLoading(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingUser) return;
    setActionLoading(deletingUser.uid);
    try {
      await deleteUserAccount(deletingUser.uid);
    } catch (err) {
      console.warn('Failed to delete:', err);
    }
    setActionLoading(null);
    setShowDeleteModal(false);
    setDeletingUser(null);
  };

  const handleRevokeAdmin = async (user: ManagedUser) => {
    setActionLoading(user.uid);
    try {
      await rejectUser(user.uid);
    } catch (err) {
      console.warn('Failed to revoke admin:', err);
    }
    setActionLoading(null);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleSeedBuildings = async () => {
    setSeedingBuildings(true);
    try {
      const result = await seedBuildings();
      setSeedResult(result);
      seeded.current = true;
    } catch (err) {
      console.warn('Failed to seed buildings:', err);
    }
    setSeedingBuildings(false);
  };

  if (loading || !firebaseUser || profile?.role !== 'Super Admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-black">Loading...</p>
        </div>
      </div>
    );
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Student': return 'ui-badge-blue';
      case 'Faculty Professor': return 'ui-badge-green';
      case 'Utility Staff': return 'ui-badge-teal';
      case 'Administrator': return 'ui-badge-red';
      default: return 'ui-badge-gray';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return 'ui-badge-green';
      case 'pending': return 'ui-badge-yellow';
      case 'rejected': return 'ui-badge-red';
      case 'disabled': return 'ui-badge-gray';
      default: return 'ui-badge-gray';
    }
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingUsers.length },
    { key: 'all', label: 'All Users', count: allUsers.length },
    { key: 'students', label: 'Students', count: students.length },
    { key: 'faculty', label: 'Faculty Professor', count: facultyProfessors.length },
    { key: 'utility', label: 'Utility Staff', count: utilityUsers.length },
    { key: 'admins', label: 'Admins', count: administrators.length },
  ];

  // Helper to check if a user needs campus assignment during approval
  const needsBuildingAssignment = (user: ManagedUser) =>
    user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.UTILITY;

  const campusOptions: ReservationCampus[] = ['main', 'digi'];
  const availableBuildings = campusOptions.map((campus) => ({
    id: campus,
    name: getCampusName(campus),
    code: campus === 'main' ? 'GD1-GD3' : 'DIGI',
    floors: campus === 'main' ? 3 : 1,
  }));
  const selectedBuildingIds = selectedCampus ? [selectedCampus] : [];
  const toggleSelectedBuilding = (buildingId: string) => {
    setSelectedCampus((current) =>
      current === buildingId ? '' : (buildingId as ReservationCampus)
    );
  };
  const handleApproveWithBuilding = handleApproveWithCampus;
  const accountEmail = profile?.email ?? firebaseUser.email ?? '';

  return (
    <div className="min-h-screen relative isolate">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 bg-center bg-no-repeat opacity-80"
          style={{
            backgroundImage: "url('/images/admin-superadmin-dashboard-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(161,33,36,0.2),transparent_30%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.2)_0%,rgba(248,249,250,0.38)_16%,rgba(248,249,250,0.64)_46%,rgba(248,249,250,0.86)_100%)]" />
      </div>

      <div className="relative z-10">
      {/* Top Nav */}
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-black">iRoomReserve</h1>
                <p className="text-[10px] text-black -mt-0.5 font-bold">Super Admin Dashboard</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div
                  className="relative"
                  onMouseEnter={() => setShowAccountTooltip(true)}
                  onMouseLeave={() => setShowAccountTooltip(false)}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                    SA
                  </div>
                  {showAccountTooltip ? (
                    <div className="absolute right-0 top-full mt-2 w-56 glass-card !rounded-xl p-3 shadow-xl z-50">
                      <p className="text-xs font-bold text-black">Super Admin</p>
                      {accountEmail ? (
                        <p className="mt-0.5 truncate text-[11px] text-black/70">
                          {accountEmail}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                title="Logout"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="glass-card p-4 sm:p-5 mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-black">System Tools</h2>
              <p className="text-sm text-black mt-1">
                Seed default buildings from the protected backend when you need an initial campus setup.
              </p>
              {seedResult && (
                <p className="text-xs text-black mt-2">
                  Created: {seedResult.created.length} | Skipped: {seedResult.skipped.length}
                </p>
              )}
            </div>
            <button
              onClick={handleSeedBuildings}
              disabled={seedingBuildings}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-bold bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-all disabled:opacity-50"
            >
              {seedingBuildings ? 'Seeding Buildings...' : 'Seed Default Buildings'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-black font-bold">Pending</p>
                <p className="text-2xl font-bold ui-text-yellow mt-1">{pendingUsers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 ui-text-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-black font-bold">Students</p>
                <p className="text-2xl font-bold ui-text-blue mt-1">{students.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 ui-text-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-black font-bold">Faculty Prof</p>
                <p className="text-2xl font-bold ui-text-green mt-1">{facultyProfessors.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 ui-text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-black font-bold">Utility Staff</p>
                <p className="text-2xl font-bold ui-text-teal mt-1">{utilityUsers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 ui-text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-black font-bold">Admins</p>
                <p className="text-2xl font-bold ui-text-red mt-1">{administrators.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 ui-text-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-black font-bold">Disabled</p>
                <p className="text-2xl font-bold ui-text-gray mt-1">{disabledUsers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gray-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 ui-text-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 glass-card !rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'text-black hover:text-primary hover:bg-primary/10'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.key ? 'bg-dark/20 text-black' : 'bg-dark/10 text-black'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* User List */}
        {currentUsers.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <svg className="w-16 h-16 text-black mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-lg font-bold text-black mb-1">No users found</h3>
            <p className="text-sm text-black">
              {activeTab === 'pending' ? 'All caught up! No registrations waiting for approval.'
                : `No ${activeTab === 'all' ? '' : activeTab + ' '}users found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentUsers.map((user) => (
              <div
                key={user.uid}
                className={`glass-card p-4 sm:p-5 ${user.status === 'disabled' ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* User Info */}
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-full bg-dark/5 border border-dark/10 flex items-center justify-center text-black font-bold text-lg">
                      {user.firstName[0]?.toUpperCase() || '?'}{user.lastName[0]?.toUpperCase() || ''}
                    </div>
                    <div>
                      <h3 className="text-black font-bold text-lg">{user.firstName} {user.lastName}</h3>
                      <p className="text-black text-sm">{user.email}</p>
                    </div>
                  </div>

                  {/* Badges & Actions */}
                  <div className="flex items-center flex-wrap gap-2 sm:ml-auto">
                    {/* Role badge */}
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getRoleBadge(user.role)}`}>
                      {user.role}
                    </span>

                    {/* Status badge */}
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getStatusBadge(user.status)}`}>
                      {user.status}
                    </span>

                    {user.campusName && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ui-badge-blue">
                        <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9-6 9 6-9 6-9-6zm2 3.5v4.5l7 4 7-4v-4.5" />
                        </svg>
                        {user.campusName}
                      </span>
                    )}

                    {/* ─── Action Buttons ────────────────────────── */}

                    {/* Pending: Approve & Reject */}
                    {user.status === 'pending' && (
                      <div className="flex gap-2">
                        {needsBuildingAssignment(user) ? (
                          <button
                            onClick={() => openApprovalModal(user)}
                            disabled={actionLoading === user.uid}
                            className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-green disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Approve & Assign
                          </button>
                        ) : (
                          <button
                            onClick={() => handleApprove(user.uid)}
                            disabled={actionLoading === user.uid}
                            className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-green disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => handleReject(user.uid)}
                          disabled={actionLoading === user.uid}
                          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-red disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Decline
                        </button>
                      </div>
                    )}

                    {/* Approved: Disable & Revoke (admin) */}
                    {user.status === 'approved' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDisable(user.uid)}
                          disabled={actionLoading === user.uid}
                          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-yellow disabled:opacity-50"
                          title="Disable account"
                        >
                          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                          Disable
                        </button>
                        {(user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.UTILITY) && (
                          <button
                            onClick={() => handleRevokeAdmin(user)}
                            disabled={actionLoading === user.uid}
                            className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-ghost ui-button-ghost-danger disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    )}

                    {/* Disabled: Enable */}
                    {user.status === 'disabled' && (
                      <button
                        onClick={() => handleEnable(user.uid)}
                        disabled={actionLoading === user.uid}
                        className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-green disabled:opacity-50"
                      >
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Enable
                      </button>
                    )}

                    {/* Rejected: Reinstate */}
                    {user.status === 'rejected' && (
                      <button
                        onClick={() => needsBuildingAssignment(user) ? openApprovalModal(user) : handleApprove(user.uid)}
                        disabled={actionLoading === user.uid}
                        className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-ghost ui-button-ghost-success disabled:opacity-50"
                      >
                        Reinstate
                      </button>
                    )}

                    {/* Delete button (always available) */}
                    <button
                      onClick={() => { setDeletingUser(user); setShowDeleteModal(true); }}
                      disabled={actionLoading === user.uid}
                      className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold ui-button-ghost ui-text-red ui-button-ghost-danger disabled:opacity-50"
                      title="Delete account"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      </div>

      {/* ─── Approval Modal ──────────────────────────────────────── */}
      {showApprovalModal && selectedUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !modalLoading && setShowApprovalModal(false)}
          />
          <div className="glass-card !bg-white/95 p-6 sm:p-8 w-full max-w-md relative z-10 !rounded-2xl border-primary/20">
            <h2 className="text-xl font-bold text-black mb-1">Approve & Assign Campus</h2>
            <p className="text-sm text-black mb-6">Choose which campus this person will manage.</p>

            <div className="flex items-center space-x-4 glass-card !bg-dark/5 p-4 !rounded-xl mb-6">
              <div className="w-11 h-11 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {selectedUser.firstName[0]?.toUpperCase() || '?'}{selectedUser.lastName[0]?.toUpperCase() || ''}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-black text-sm">{selectedUser.firstName} {selectedUser.lastName}</h4>
                <p className="text-xs text-black truncate">{selectedUser.email}</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-black mb-2">Assign Campus</label>
              <div className="space-y-2 rounded-xl border border-dark/10 bg-dark/5 p-3">
                {campusOptions.map((campus) => {
                  const checked = selectedCampus === campus;
                  const building = availableBuildings.find((option) => option.id === campus);

                  if (!building) {
                    return null;
                  }

                  return (
                    <label
                      key={campus}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-all ${
                        checked
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-dark/10 bg-transparent text-black hover:bg-primary/10'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold">{getCampusName(campus)}</p>
                        <p className="text-xs text-black">
                          {building.code ? `${building.code} · ` : ''}{building.floors} floors
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelectedBuilding(building.id)}
                        className="h-4 w-4 accent-teal-400"
                      />
                    </label>
                  );
                })}
              </div>
              {availableBuildings.length === 0 && (
                <p className="text-xs ui-text-yellow mt-2">
                  ⚠ No buildings found. Please add buildings in Firestore first.
                </p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowApprovalModal(false)}
                disabled={modalLoading}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold border border-dark/15 text-black hover:bg-primary/10 hover:text-primary transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveWithBuilding}
                disabled={selectedBuildingIds.length === 0 || modalLoading}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold ui-button-green disabled:opacity-30 flex items-center justify-center"
              >
                {modalLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Assigning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Approve & Assign
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─────────────────────────────── */}
      {showDeleteModal && deletingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !actionLoading && setShowDeleteModal(false)}
          />
          <div className="glass-card !bg-white/95 p-6 sm:p-8 w-full max-w-md relative z-10 !rounded-2xl border-red-500/20">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 ui-text-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-black mb-2 text-center">Delete Account</h2>
            <p className="text-sm text-black mb-6 text-center">
              Are you sure you want to permanently delete <span className="text-black font-bold">{deletingUser.firstName} {deletingUser.lastName}</span>&apos;s account? This action cannot be undone.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletingUser(null); }}
                disabled={actionLoading === deletingUser.uid}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold border border-dark/15 text-black hover:bg-primary/10 hover:text-primary transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={actionLoading === deletingUser.uid}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold ui-button-red disabled:opacity-50 flex items-center justify-center"
              >
                {actionLoading === deletingUser.uid ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
