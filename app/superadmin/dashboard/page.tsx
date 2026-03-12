'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  onUsersByStatus,
  approveUser,
  rejectUser,
  ManagedUser,
} from '@/lib/auth';

type Tab = 'pending' | 'approved' | 'rejected';

export default function SuperAdminDashboard() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [pendingUsers, setPendingUsers] = useState<ManagedUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<ManagedUser[]>([]);
  const [rejectedUsers, setRejectedUsers] = useState<ManagedUser[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Redirect if not super admin
  useEffect(() => {
    if (!loading && (!firebaseUser || profile?.role !== 'Super Admin')) {
      router.push('/');
    }
  }, [loading, firebaseUser, profile, router]);

  // Real-time listeners
  useEffect(() => {
    const unsubPending = onUsersByStatus('pending', setPendingUsers);
    const unsubApproved = onUsersByStatus('approved', setApprovedUsers);
    const unsubRejected = onUsersByStatus('rejected', setRejectedUsers);
    return () => { unsubPending(); unsubApproved(); unsubRejected(); };
  }, []);

  const handleApprove = async (uid: string) => {
    setActionLoading(uid);
    try { await approveUser(uid); } catch (err) { console.error('Failed to approve:', err); }
    setActionLoading(null);
  };

  const handleReject = async (uid: string) => {
    setActionLoading(uid);
    try { await rejectUser(uid); } catch (err) { console.error('Failed to reject:', err); }
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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pendingUsers.length },
    { key: 'approved', label: 'Approved', count: approvedUsers.length },
    { key: 'rejected', label: 'Rejected', count: rejectedUsers.length },
  ];

  const currentUsers = activeTab === 'pending' ? pendingUsers : activeTab === 'approved' ? approvedUsers : rejectedUsers;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Faculty': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'Administrator': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-white/10 text-white/50 border-white/20';
    }
  };

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/40 font-bold">Pending Approval</p>
                <p className="text-3xl font-bold text-yellow-400 mt-1">{pendingUsers.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/40 font-bold">Approved</p>
                <p className="text-3xl font-bold text-green-400 mt-1">{approvedUsers.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/40 font-bold">Rejected</p>
                <p className="text-3xl font-bold text-red-400 mt-1">{rejectedUsers.length}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 glass-card !rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold ${
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
            <h3 className="text-lg font-bold text-white/60 mb-1">No {activeTab} registrations</h3>
            <p className="text-sm text-white/30">
              {activeTab === 'pending' ? 'All caught up! No registrations waiting for approval.'
                : activeTab === 'approved' ? 'No faculty or admin accounts have been approved yet.'
                : 'No registrations have been rejected.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentUsers.map((user) => (
              <div key={user.uid} className="glass-card p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-lg">
                      {user.firstName[0]?.toUpperCase() || '?'}{user.lastName[0]?.toUpperCase() || ''}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg">{user.firstName} {user.lastName}</h3>
                      <p className="text-white/40 text-sm">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 sm:ml-auto">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getRoleBadge(user.role)}`}>
                      {user.role}
                    </span>

                    {activeTab === 'pending' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleApprove(user.uid)}
                          disabled={actionLoading === user.uid}
                          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all disabled:opacity-50"
                        >
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(user.uid)}
                          disabled={actionLoading === user.uid}
                          className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-50"
                        >
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Decline
                        </button>
                      </div>
                    )}

                    {activeTab === 'approved' && (
                      <button
                        onClick={() => handleReject(user.uid)}
                        disabled={actionLoading === user.uid}
                        className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-white/5 text-white/50 border border-white/10 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-all disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}

                    {activeTab === 'rejected' && (
                      <button
                        onClick={() => handleApprove(user.uid)}
                        disabled={actionLoading === user.uid}
                        className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-white/5 text-white/50 border border-white/10 hover:bg-green-500/20 hover:text-green-300 hover:border-green-500/30 transition-all disabled:opacity-50"
                      >
                        Reinstate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
