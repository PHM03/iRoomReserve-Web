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
import {
  getBuildingByAdmin,
  unassignAdminFromBuilding,
  Building,
} from '@/lib/buildings';
import { seedBuildings } from '@/lib/seedBuildings';

type Tab = 'all' | 'students' | 'faculty' | 'utility' | 'admins' | 'pending';

export default function SuperAdminDashboard() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ─── Approval Modal State ─────────────────────────────────────
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [availableBuildings, setAvailableBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // ─── Delete Confirmation State ─────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);

  // Redirect if not super admin
  useEffect(() => {
    if (!loading && (!firebaseUser || profile?.role !== 'Super Admin')) {
      router.push('/');
    }
  }, [loading, firebaseUser, profile, router]);

  // Auto-seed buildings on first load
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      seedBuildings().catch(console.warn);
    }
  }, []);

  // Real-time listener for ALL users
  useEffect(() => {
    const unsub = onAllUsers(setAllUsers);
    return () => unsub();
  }, []);

  // ─── Computed Data ────────────────────────────────────────────
  const pendingUsers = allUsers.filter((u) => u.status === 'pending');
  const approvedUsers = allUsers.filter((u) => u.status === 'approved');
  const disabledUsers = allUsers.filter((u) => u.status === 'disabled');
  const rejectedUsers = allUsers.filter((u) => u.status === 'rejected');

  const students = allUsers.filter((u) => u.role === 'Student');
  const facultyProfessors = allUsers.filter((u) => u.role === 'Faculty Professor');
  const utilityUsers = allUsers.filter((u) => u.role === 'Utility');
  const administrators = allUsers.filter((u) => u.role === 'Administrator');

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
    setSelectedBuildingId('');
    setShowApprovalModal(true);
    try {
      const { getBuildings } = await import('@/lib/buildings');
      const buildings = await getBuildings();
      setAvailableBuildings(buildings);
    } catch (err) {
      console.warn('Failed to fetch buildings:', err);
      setAvailableBuildings([]);
    }
  };

  const handleApproveWithBuilding = async () => {
    if (!selectedUser || !selectedBuildingId) return;
    setModalLoading(true);
    try {
      const building = availableBuildings.find((b) => b.id === selectedBuildingId);
      if (!building) return;
      await approveAdmin(selectedUser.uid, building.id, building.name);
    } catch (err) {
      console.warn('Failed to approve admin:', err);
    }
    setModalLoading(false);
    setShowApprovalModal(false);
    setSelectedUser(null);
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
      // If admin, unassign building first
      if (deletingUser.role === 'Administrator' || deletingUser.role === 'Utility') {
        const building = await getBuildingByAdmin(deletingUser.uid);
        if (building) await unassignAdminFromBuilding(building.id);
      }
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
      const building = await getBuildingByAdmin(user.uid);
      if (building) {
        await unassignAdminFromBuilding(building.id);
      }
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

  if (loading || !firebaseUser || profile?.role !== 'Super Admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-white/50">Loading...</p>
        </div>
      </div>
    );
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Student': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'Faculty Professor': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'Utility': return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'Administrator': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-white/10 text-white/50 border-white/20';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'disabled': return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      default: return 'bg-white/10 text-white/50 border-white/20';
    }
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingUsers.length },
    { key: 'all', label: 'All Users', count: allUsers.length },
    { key: 'students', label: 'Students', count: students.length },
    { key: 'faculty', label: 'Faculty Professor', count: facultyProfessors.length },
    { key: 'utility', label: 'Utility', count: utilityUsers.length },
    { key: 'admins', label: 'Admins', count: administrators.length },
  ];

  // Helper to check if a user needs building assignment during approval
  const needsBuildingAssignment = (user: ManagedUser) =>
    user.role === 'Administrator' || user.role === 'Utility';

  return (
    <div className="min-h-screen relative">
      {/* Decorative background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-20 -left-40 w-96 h-96 rounded-full bg-secondary/8 blur-3xl" />
      </div>

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
                <h1 className="text-lg font-bold text-white">iRoomReserve</h1>
                <p className="text-[10px] text-white/40 -mt-0.5 font-bold">Super Admin Dashboard</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                  SA
                </div>
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Super Admin
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
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-bold">Pending</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingUsers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-bold">Students</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{students.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-bold">Faculty Prof</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{facultyProfessors.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-bold">Utility</p>
                <p className="text-2xl font-bold text-teal-400 mt-1">{utilityUsers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-bold">Admins</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{administrators.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 font-bold">Disabled</p>
                <p className="text-2xl font-bold text-gray-400 mt-1">{disabledUsers.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gray-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'
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
            <svg className="w-16 h-16 text-white/10 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-lg font-bold text-white/60 mb-1">No users found</h3>
            <p className="text-sm text-white/30">
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
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-lg">
                      {user.firstName[0]?.toUpperCase() || '?'}{user.lastName[0]?.toUpperCase() || ''}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg">{user.firstName} {user.lastName}</h3>
                      <p className="text-white/40 text-sm">{user.email}</p>
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

                    {/* Building badge for assigned admins */}
                    {user.assignedBuilding && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-blue-500/20 text-blue-300 border-blue-500/30">
                        <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {user.assignedBuilding}
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
                            className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all disabled:opacity-50"
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
                            className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all disabled:opacity-50"
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
                          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-50"
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
                          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all disabled:opacity-50"
                          title="Disable account"
                        >
                          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                          Disable
                        </button>
                        {(user.role === 'Administrator' || user.role === 'Utility') && (
                          <button
                            onClick={() => handleRevokeAdmin(user)}
                            disabled={actionLoading === user.uid}
                            className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/50 border border-white/10 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all disabled:opacity-50"
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
                        className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-green-500/10 text-green-300 border border-green-500/30 hover:bg-green-500/20 transition-all disabled:opacity-50"
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
                        className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/50 border border-white/10 hover:bg-green-500/20 hover:text-green-300 hover:border-green-500/30 transition-all disabled:opacity-50"
                      >
                        Reinstate
                      </button>
                    )}

                    {/* Delete button (always available) */}
                    <button
                      onClick={() => { setDeletingUser(user); setShowDeleteModal(true); }}
                      disabled={actionLoading === user.uid}
                      className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-red-400/60 border border-white/10 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all disabled:opacity-50"
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

      {/* ─── Approval Modal ──────────────────────────────────────── */}
      {showApprovalModal && selectedUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !modalLoading && setShowApprovalModal(false)}
          />
          <div className="glass-card !bg-[#1a1a2e]/95 p-6 sm:p-8 w-full max-w-md relative z-10 !rounded-2xl border-primary/20">
            <h2 className="text-xl font-bold text-white mb-1">Approve & Assign Building</h2>
            <p className="text-sm text-white/40 mb-6">Assign a building for this person to manage.</p>

            <div className="flex items-center space-x-4 glass-card !bg-white/5 p-4 !rounded-xl mb-6">
              <div className="w-11 h-11 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {selectedUser.firstName[0]?.toUpperCase() || '?'}{selectedUser.lastName[0]?.toUpperCase() || ''}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-white text-sm">{selectedUser.firstName} {selectedUser.lastName}</h4>
                <p className="text-xs text-white/40 truncate">{selectedUser.email}</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-white/70 mb-1.5">Assign Building</label>
              <select
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                className="glass-input w-full px-4 py-3 bg-white/6 appearance-none cursor-pointer"
                style={{ backgroundImage: 'none' }}
              >
                <option value="" disabled className="bg-[#1a1a2e] text-white/50">
                  Select a building...
                </option>
                {availableBuildings.map((b) => (
                  <option key={b.id} value={b.id} className="bg-[#1a1a2e] text-white">
                    {b.name} {b.code ? `(${b.code})` : ''}
                  </option>
                ))}
              </select>
              {availableBuildings.length === 0 && (
                <p className="text-xs text-yellow-400/70 mt-2">
                  ⚠ No buildings found. Please add buildings in Firestore first.
                </p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowApprovalModal(false)}
                disabled={modalLoading}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold border border-white/15 text-white/60 hover:bg-white/5 hover:text-white transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveWithBuilding}
                disabled={!selectedBuildingId || modalLoading}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all disabled:opacity-30 flex items-center justify-center"
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
          <div className="glass-card !bg-[#1a1a2e]/95 p-6 sm:p-8 w-full max-w-md relative z-10 !rounded-2xl border-red-500/20">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2 text-center">Delete Account</h2>
            <p className="text-sm text-white/40 mb-6 text-center">
              Are you sure you want to permanently delete <span className="text-white font-bold">{deletingUser.firstName} {deletingUser.lastName}</span>&apos;s account? This action cannot be undone.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletingUser(null); }}
                disabled={actionLoading === deletingUser.uid}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold border border-white/15 text-white/60 hover:bg-white/5 hover:text-white transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={actionLoading === deletingUser.uid}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center justify-center"
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
