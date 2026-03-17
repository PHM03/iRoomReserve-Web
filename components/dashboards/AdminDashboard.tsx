'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { AdminTab } from '@/components/NavBar';
import {
  onPendingReservationsByBuilding,
  onReservationsByBuilding,
  approveReservation,
  rejectReservation,
  Reservation,
} from '@/lib/reservations';
import {
  onUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  Notification,
} from '@/lib/notifications';
import {
  Room,
  RoomInput,
  addRoom,
  updateRoom,
  deleteRoom,
  updateRoomStatus,
  onRoomsByBuilding,
} from '@/lib/rooms';
import {
  Feedback,
  onFeedbackByBuilding,
  respondToFeedback,
} from '@/lib/feedback';
import { getBuildingById } from '@/lib/buildings';

// ─── Helpers ────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const style = role === 'Faculty'
    ? 'bg-green-500/20 text-green-300 border-green-500/30'
    : 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = (() => {
    switch (status) {
      case 'Occupied': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'Unavailable': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'Available': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'approved': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default: return 'bg-white/10 text-white/50 border-white/20';
    }
  })();
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${style}`}>
      {status}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'text-yellow-400' : 'text-white/15'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────
interface AdminDashboardProps {
  firstName: string;
  activeTab: AdminTab;
}

export default function AdminDashboard({ firstName, activeTab }: AdminDashboardProps) {
  const { firebaseUser, profile } = useAuth();
  const buildingId = profile?.assignedBuildingId;
  const buildingName = profile?.assignedBuilding;

  // ─── State ──────────────────────────────────────────────────
  const [requests, setRequests] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Add Room wizard state
  const [addRoomStep, setAddRoomStep] = useState(0); // 0=button, 1=floor, 2=form
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomFloor, setNewRoomFloor] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState('');
  const [newRoomType, setNewRoomType] = useState('');
  const [newRoomAcStatus, setNewRoomAcStatus] = useState('');
  const [newRoomTvStatus, setNewRoomTvStatus] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);
  const [buildingFloors, setBuildingFloors] = useState(0);

  // Edit Room state
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editCapacity, setEditCapacity] = useState('');

  // Feedback response state
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  // History filter state
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState('');

  // ─── Real-time Listeners ────────────────────────────────────
  useEffect(() => {
    if (!buildingId || !firebaseUser) return;

    const unsubReservations = onPendingReservationsByBuilding(buildingId, setRequests);
    const unsubAllReservations = onReservationsByBuilding(buildingId, setAllReservations);
    const unsubRooms = onRoomsByBuilding(buildingId, (r) => setRooms(r));
    const unsubFeedback = onFeedbackByBuilding(buildingId, setFeedbackList);
    const unsubNotifs = onUnreadNotifications(firebaseUser.uid, setNotifications);

    return () => {
      unsubReservations();
      unsubAllReservations();
      unsubRooms();
      unsubFeedback();
      unsubNotifs();
    };
  }, [buildingId, firebaseUser]);

  // Load building floors when on add-rooms tab
  useEffect(() => {
    if (buildingId && activeTab === 'add-rooms') {
      getBuildingById(buildingId).then((b) => {
        if (b) setBuildingFloors(b.floors);
      });
    }
  }, [buildingId, activeTab]);

  // ─── Handlers ───────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try { await approveReservation(id); } catch (err) { console.warn('Failed to approve:', err); }
    setActionLoading(null);
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try { await rejectReservation(id); } catch (err) { console.warn('Failed to reject:', err); }
    setActionLoading(null);
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser) return;
    await markAllNotificationsRead(firebaseUser.uid);
  };

  const handleDismissNotification = async (notifId: string) => {
    await markNotificationRead(notifId);
  };

  const resetAddRoomWizard = () => {
    setAddRoomStep(0);
    setNewRoomName('');
    setNewRoomFloor('');
    setNewRoomCapacity('');
    setNewRoomType('');
    setNewRoomAcStatus('');
    setNewRoomTvStatus('');
  };

  const handleAddRoom = async () => {
    if (!buildingId || !buildingName || !newRoomName.trim() || !newRoomFloor.trim() || !newRoomType) return;
    setAddingRoom(true);
    try {
      const data: RoomInput = {
        name: newRoomName.trim(),
        floor: newRoomFloor.trim(),
        roomType: newRoomType,
        acStatus: newRoomAcStatus || 'No Air Conditioning',
        tvProjectorStatus: newRoomTvStatus || 'No Television or Projector',
        capacity: parseInt(newRoomCapacity) || 30,
        status: 'Available',
        buildingId,
        buildingName,
      };
      await addRoom(data);
      resetAddRoomWizard();
    } catch (err) {
      console.warn('Failed to add room:', err);
    }
    setAddingRoom(false);
  };

  const handleEditRoom = async (roomId: string) => {
    try {
      await updateRoom(roomId, {
        name: editName.trim(),
        floor: editFloor.trim(),
        capacity: parseInt(editCapacity) || 30,
      });
      setEditingRoomId(null);
    } catch (err) {
      console.warn('Failed to update room:', err);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try { await deleteRoom(roomId); } catch (err) { console.warn('Failed to delete:', err); }
  };

  const handleStatusChange = async (roomId: string, status: Room['status']) => {
    try { await updateRoomStatus(roomId, status); } catch (err) { console.warn('Failed to update status:', err); }
  };

  const handleRespondFeedback = async (feedbackId: string) => {
    if (!responseText.trim()) return;
    try {
      await respondToFeedback(feedbackId, responseText.trim());
      setRespondingId(null);
      setResponseText('');
    } catch (err) {
      console.warn('Failed to respond:', err);
    }
  };

  // ─── Computed Values ────────────────────────────────────────
  const filteredHistory = allReservations.filter((r) => {
    if (historyFilter !== 'all' && r.status !== historyFilter) return false;
    if (historySearch && !r.userName.toLowerCase().includes(historySearch.toLowerCase()) && !r.roomName.toLowerCase().includes(historySearch.toLowerCase())) return false;
    return true;
  });

  // ─── No Building Assigned State ─────────────────────────────
  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Welcome, {firstName} 🏛️</h2>
          <p className="text-white/40 mt-1">Administrator Dashboard</p>
        </div>
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white/60 mb-2">No Building Assigned</h3>
          <p className="text-sm text-white/30 max-w-sm mx-auto">
            Your account has been approved, but the Super Admin has not yet assigned a building to you.
            Please contact the Super Admin to get a building assignment.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
      {/* ─── Header with Notification Bell ───────────────────────── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Welcome, {firstName} 🏛️</h2>
          <p className="text-white/40 mt-1">
            Managing: <span className="text-primary font-bold">{buildingName}</span>
          </p>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 rounded-xl glass-card !p-2.5 hover:!border-primary/40 transition-all"
          >
            <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {notifications.length}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 glass-card !rounded-xl overflow-hidden z-50">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h4 className="font-bold text-white text-sm">Notifications</h4>
                {notifications.length > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-primary font-bold hover:text-primary-hover transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm text-white/30">No new notifications</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors flex items-start gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white">{notif.title}</p>
                        <p className="text-[11px] text-white/40 mt-0.5">{notif.message}</p>
                      </div>
                      <button
                        onClick={() => handleDismissNotification(notif.id)}
                        className="text-white/20 hover:text-white/50 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Summary Strip ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="glass-card p-4 border-l-4 border-green-500/60">
          <p className="text-2xl font-bold text-green-400">{rooms.length}</p>
          <p className="text-xs text-white/50 font-bold">Total Rooms</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-yellow-500/60">
          <p className="text-2xl font-bold text-yellow-400">{requests.length}</p>
          <p className="text-xs text-white/50 font-bold">Pending Requests</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-emerald-500/60">
          <p className="text-2xl font-bold text-emerald-400">{rooms.filter(r => r.status === 'Available').length}</p>
          <p className="text-xs text-white/50 font-bold">Available</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-orange-500/60">
          <p className="text-2xl font-bold text-orange-400">{rooms.filter(r => r.status === 'Occupied').length}</p>
          <p className="text-xs text-white/50 font-bold">Occupied</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-red-500/60">
          <p className="text-2xl font-bold text-red-400">{rooms.filter(r => r.status === 'Unavailable').length}</p>
          <p className="text-xs text-white/50 font-bold">Unavailable</p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: ADD ROOMS ──────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'add-rooms' && (
        <div>
          <h3 className="text-xl font-bold text-white mb-6">Manage Rooms</h3>

          {/* ─── Step 0: New Room Button ─────────────────────────── */}
          {addRoomStep === 0 && (
            <button
              onClick={() => setAddRoomStep(1)}
              className="w-full glass-card p-6 !rounded-2xl flex items-center justify-center gap-3 mb-8 group hover:!border-primary/40 transition-all cursor-pointer"
            >
              <svg className="w-6 h-6 text-white/40 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-lg font-bold text-white/60 group-hover:text-white transition-colors">
                New Room
              </span>
            </button>
          )}

          {/* ─── Step 1: Select Floor ────────────────────────────── */}
          {addRoomStep === 1 && (
            <div className="glass-card p-6 mb-8 !rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-lg font-bold text-white">Select Floor</h4>
                  <p className="text-xs text-white/40 mt-0.5">Step 1 of 2 — Choose which floor the room is on</p>
                </div>
                <button
                  onClick={resetAddRoomWizard}
                  className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Progress Bar */}
              <div className="flex gap-2 mb-6">
                <div className="h-1 flex-1 rounded-full bg-primary" />
                <div className="h-1 flex-1 rounded-full bg-white/10" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: buildingFloors || 5 }, (_, i) => {
                  const floorLabel = i === 0 ? 'Ground Floor' : `${i === 1 ? '1st' : i === 2 ? '2nd' : i === 3 ? '3rd' : `${i}th`} Floor`;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setNewRoomFloor(floorLabel);
                        setAddRoomStep(2);
                      }}
                      className="glass-card !bg-white/5 p-4 !rounded-xl text-center group hover:!border-primary/40 transition-all cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                        <span className="text-primary font-bold text-sm">{i === 0 ? 'G' : i}</span>
                      </div>
                      <p className="text-sm font-bold text-white/70 group-hover:text-white transition-colors">{floorLabel}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Step 2: Room Information Form ───────────────────── */}
          {addRoomStep === 2 && (
            <div className="glass-card p-6 mb-8 !rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-lg font-bold text-white">Room Information</h4>
                  <p className="text-xs text-white/40 mt-0.5">
                    Step 2 of 2 — <span className="text-primary">{newRoomFloor}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAddRoomStep(1)}
                    className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={resetAddRoomWizard}
                    className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="flex gap-2 mb-6">
                <div className="h-1 flex-1 rounded-full bg-primary" />
                <div className="h-1 flex-1 rounded-full bg-primary" />
              </div>

              <div className="space-y-6">
                {/* Room Name & Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-white/40 mb-1.5">Room Name *</label>
                    <input
                      type="text"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      placeholder="e.g. Room 312"
                      className="glass-input w-full px-4 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/40 mb-1.5">Room Type *</label>
                    <select
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value)}
                      className="glass-input w-full px-4 py-2.5 text-sm appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select room type</option>
                      <option value="Conference Room">Conference Room</option>
                      <option value="Glass Room">Glass Room</option>
                      <option value="Classroom">Classroom</option>
                      <option value="Specialized Room">Specialized Room (e.g., Computer Lab)</option>
                      <option value="Gymnasium">Gymnasium</option>
                    </select>
                  </div>
                </div>

                {/* Facilities Section */}
                <div>
                  <h5 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-4">Facilities</h5>

                  {/* Air Conditioner Status */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-white/40 mb-2">Air Conditioner Status</label>
                    <div className="flex flex-wrap gap-2">
                      {['Working', 'Not Working', 'No Air Conditioning'].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setNewRoomAcStatus(opt)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            newRoomAcStatus === opt
                              ? 'bg-primary/20 text-primary border border-primary/40'
                              : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Television or Projector Status */}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-white/40 mb-2">Television or Projector</label>
                    <div className="flex flex-wrap gap-2">
                      {['Working', 'Not Working', 'No Television or Projector'].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setNewRoomTvStatus(opt)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            newRoomTvStatus === opt
                              ? 'bg-primary/20 text-primary border border-primary/40'
                              : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Capacity */}
                  <div>
                    <label className="block text-xs font-bold text-white/40 mb-1.5">Capacity</label>
                    <input
                      type="number"
                      value={newRoomCapacity}
                      onChange={(e) => setNewRoomCapacity(e.target.value)}
                      placeholder="30"
                      className="glass-input w-full sm:w-40 px-4 py-2.5 text-sm"
                      min={1}
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleAddRoom}
                  disabled={addingRoom || !newRoomName.trim() || !newRoomType}
                  className="btn-primary w-full py-3 px-4 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {addingRoom ? 'Adding Room...' : 'Add Room'}
                </button>
              </div>
            </div>
          )}

          {/* Room List */}
          {rooms.length === 0 && addRoomStep === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">🏠</div>
              <h4 className="text-lg font-bold text-white/60 mb-1">No Rooms Yet</h4>
              <p className="text-sm text-white/30">Click &quot;New Room&quot; above to add your first room.</p>
            </div>
          ) : rooms.length > 0 && (
            <div className="space-y-3">
              {rooms.map((room) => (
                <div key={room.id} className="glass-card p-4 sm:p-5">
                  {editingRoomId === room.id ? (
                    /* Editing Mode */
                    <div className="flex flex-col sm:flex-row gap-3 items-end">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="glass-input px-3 py-2 text-sm"
                          placeholder="Room name"
                        />
                        <input
                          type="text"
                          value={editFloor}
                          onChange={(e) => setEditFloor(e.target.value)}
                          className="glass-input px-3 py-2 text-sm"
                          placeholder="Floor"
                        />
                        <input
                          type="number"
                          value={editCapacity}
                          onChange={(e) => setEditCapacity(e.target.value)}
                          className="glass-input px-3 py-2 text-sm"
                          placeholder="Capacity"
                        />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleEditRoom(room.id)}
                          className="px-4 py-2 rounded-xl text-sm font-bold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRoomId(null)}
                          className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-lg shrink-0">
                          🚪
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{room.name}</h4>
                          <p className="text-xs text-white/40">
                            {room.floor} · {room.roomType || 'Room'} · Capacity: {room.capacity}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={room.status} />
                        <button
                          onClick={() => {
                            setEditingRoomId(room.id);
                            setEditName(room.name);
                            setEditFloor(room.floor);
                            setEditCapacity(String(room.capacity));
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white/40 hover:text-primary hover:bg-white/5 border border-white/10 transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-400/60 hover:text-red-300 hover:bg-red-500/10 border border-white/10 transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: FEEDBACK ───────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'feedback' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Room Feedback</h3>
            <span className="text-sm text-white/30">{feedbackList.length} total</span>
          </div>

          {feedbackList.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">💬</div>
              <h4 className="text-lg font-bold text-white/60 mb-1">No Feedback Yet</h4>
              <p className="text-sm text-white/30">Feedback from room users will appear here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {feedbackList.map((fb) => (
                <div key={fb.id} className="glass-card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-sm">
                        {fb.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{fb.userName}</h4>
                        <p className="text-xs text-white/40">{fb.roomName}</p>
                      </div>
                    </div>
                    <StarRating rating={fb.rating} />
                  </div>

                  <p className="text-sm text-white/70 mb-3 leading-relaxed">{fb.message}</p>

                  {fb.adminResponse ? (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mt-3">
                      <p className="text-xs font-bold text-primary mb-1">Admin Response</p>
                      <p className="text-sm text-white/60">{fb.adminResponse}</p>
                    </div>
                  ) : (
                    <>
                      {respondingId === fb.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            placeholder="Type your response..."
                            className="glass-input w-full px-4 py-3 text-sm resize-none"
                            rows={3}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setRespondingId(null); setResponseText(''); }}
                              className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleRespondFeedback(fb.id)}
                              disabled={!responseText.trim()}
                              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                            >
                              Send Response
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRespondingId(fb.id)}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary/70 hover:text-primary hover:bg-primary/5 border border-primary/20 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Reply
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: PENDING RESERVATION ────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'pending' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Pending Reservation Requests</h3>
            {requests.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                {requests.length} pending
              </span>
            )}
          </div>

          {requests.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">✅</div>
              <h4 className="text-lg font-bold text-white/60 mb-1">All caught up!</h4>
              <p className="text-sm text-white/30">No reservation requests waiting for approval.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="glass-card p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {req.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{req.userName}</h4>
                          <RoleBadge role={req.userRole} />
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">
                          {req.roomName} · {req.date} · {req.startTime} – {req.endTime}
                        </p>
                        <p className="text-xs text-white/30 mt-0.5">Purpose: {req.purpose}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={actionLoading === req.id}
                        className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30 transition-all disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={actionLoading === req.id}
                        className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: STATUS ─────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'status' && (
        <div>
          <h3 className="text-xl font-bold text-white mb-6">
            Room Status Monitor
            <span className="text-sm text-white/30 font-normal ml-2">({buildingName})</span>
          </h3>

          {rooms.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-sm text-white/30">No rooms configured for this building yet. Add rooms first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => {
                const statusBorder = room.status === 'Occupied'
                  ? 'border-orange-500/40'
                  : room.status === 'Unavailable'
                    ? 'border-red-500/40'
                    : 'border-green-500/40';

                return (
                  <div key={room.id} className={`glass-card p-5 border-l-4 ${statusBorder}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="text-lg font-bold text-white">{room.name}</h4>
                        <p className="text-sm text-white/40">{room.floor} · Cap: {room.capacity}</p>
                      </div>
                      <StatusBadge status={room.status} />
                    </div>
                    {room.reservedBy && (
                      <p className="text-xs text-white/30 mb-3">Reserved by: {room.reservedBy}</p>
                    )}

                    {/* Status Toggle Buttons */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                      <button
                        onClick={() => handleStatusChange(room.id, 'Available')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          room.status === 'Available'
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : 'bg-white/5 text-white/30 border border-white/10 hover:bg-green-500/10 hover:text-green-300'
                        }`}
                      >
                        Available
                      </button>
                      <button
                        onClick={() => handleStatusChange(room.id, 'Occupied')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          room.status === 'Occupied'
                            ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                            : 'bg-white/5 text-white/30 border border-white/10 hover:bg-orange-500/10 hover:text-orange-300'
                        }`}
                      >
                        Occupied
                      </button>
                      <button
                        onClick={() => handleStatusChange(room.id, 'Unavailable')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          room.status === 'Unavailable'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-white/5 text-white/30 border border-white/10 hover:bg-red-500/10 hover:text-red-300'
                        }`}
                      >
                        Unavailable
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ─── TAB: ROOM HISTORY ───────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {activeTab === 'room-history' && (
        <div>
          <h3 className="text-xl font-bold text-white mb-6">Reservation History</h3>

          {/* Filters */}
          <div className="glass-card p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search by name or room..."
                  className="glass-input w-full px-4 py-2.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                {['all', 'approved', 'rejected', 'pending', 'completed'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                      historyFilter === filter
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">📋</div>
              <h4 className="text-lg font-bold text-white/60 mb-1">No Reservations Found</h4>
              <p className="text-sm text-white/30">
                {historySearch || historyFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Reservation history will appear here.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block glass-card overflow-hidden !rounded-xl">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">User</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Room</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Time</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Purpose</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((res) => (
                      <tr key={res.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{res.userName}</span>
                            <RoleBadge role={res.userRole} />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">{res.roomName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">{res.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">{res.startTime} – {res.endTime}</td>
                        <td className="px-6 py-4 text-sm text-white/40 max-w-[200px] truncate">{res.purpose}</td>
                        <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={res.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {filteredHistory.map((res) => (
                  <div key={res.id} className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{res.userName}</span>
                        <RoleBadge role={res.userRole} />
                      </div>
                      <StatusBadge status={res.status} />
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/40">Room:</span>
                        <span className="font-bold text-white/70">{res.roomName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Date:</span>
                        <span className="text-white/70">{res.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Time:</span>
                        <span className="text-white/70">{res.startTime} – {res.endTime}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Purpose:</span>
                        <span className="text-white/70 truncate max-w-[180px]">{res.purpose}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 text-center">
            <p className="text-xs text-white/20">Showing {filteredHistory.length} of {allReservations.length} reservations</p>
          </div>
        </div>
      )}
    </main>
  );
}
