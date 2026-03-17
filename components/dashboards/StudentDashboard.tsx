'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getBuildings, Building } from '@/lib/buildings';
import {
  createReservation,
  onReservationsByUser,
  Reservation,
} from '@/lib/reservations';
import {
  onUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  Notification,
} from '@/lib/notifications';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ─── Status Badge ───────────────────────────────────────────────
function HistoryBadge({ status }: { status: string }) {
  const style = (() => {
    switch (status) {
      case 'approved': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'completed': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'pending': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-white/10 text-white/50 border-white/20';
    }
  })();
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${style} capitalize`}>
      {status}
    </span>
  );
}

function HistoryDot({ status }: { status: string }) {
  const color = (() => {
    switch (status) {
      case 'approved': return 'bg-green-400';
      case 'rejected': return 'bg-red-400';
      case 'completed': return 'bg-yellow-400';
      case 'pending': return 'bg-blue-400';
      default: return 'bg-white/30';
    }
  })();
  return <span className={`w-2.5 h-full min-h-full rounded-full ${color} shrink-0`} />;
}

// ─── Room Type ──────────────────────────────────────────────────
interface Room {
  id: string;
  name: string;
  floor: string;
  status: string;
}

// ─── Component ──────────────────────────────────────────────────
interface StudentDashboardProps {
  firstName: string;
}

export default function StudentDashboard({ firstName }: StudentDashboardProps) {
  const { firebaseUser } = useAuth();

  // ─── State ──────────────────────────────────────────────────
  const [reservationHistory, setReservationHistory] = useState<Reservation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Reservation form state
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedBuildingName, setSelectedBuildingName] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // Equipment & endorsement state
  const [equipment, setEquipment] = useState<Record<string, number>>({
    fans: 0,
    speakers: 0,
    televisions: 0,
    hdmiCables: 0,
    monoblockChairs: 0,
    tables: 0,
  });
  const [endorsedByEmail, setEndorsedByEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  // ─── Real-time Listeners ────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubReservations = onReservationsByUser(firebaseUser.uid, setReservationHistory);
    const unsubNotifs = onUnreadNotifications(firebaseUser.uid, setNotifications);

    return () => {
      unsubReservations();
      unsubNotifs();
    };
  }, [firebaseUser]);

  // ─── Load Buildings ─────────────────────────────────────────
  useEffect(() => {
    if (showReservationForm) {
      getBuildings().then(setBuildings).catch(console.error);
    }
  }, [showReservationForm]);

  // ─── Load Rooms When Building Selected ──────────────────────
  useEffect(() => {
    if (!selectedBuildingId) {
      setRooms([]);
      return;
    }
    setRoomsLoading(true);
    const fetchRooms = async () => {
      const q = query(
        collection(db, 'rooms'),
        where('buildingId', '==', selectedBuildingId),
        where('status', '==', 'Available')
      );
      const snap = await getDocs(q);
      const r: Room[] = snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || '',
        floor: d.data().floor || '',
        status: d.data().status || 'Available',
      }));
      setRooms(r);
      setRoomsLoading(false);
    };
    fetchRooms();
  }, [selectedBuildingId]);

  // ─── Handlers ───────────────────────────────────────────────
  const handleBuildingSelect = (buildingId: string) => {
    const building = buildings.find((b) => b.id === buildingId);
    setSelectedBuildingId(buildingId);
    setSelectedBuildingName(building?.name || '');
    setSelectedRoomId('');
    setSelectedRoomName('');
    setFormStep(2);
  };

  const handleRoomSelect = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    setSelectedRoomId(roomId);
    setSelectedRoomName(room?.name || '');
    setFormStep(3);
  };

  const updateEquipment = (key: string, delta: number) => {
    setEquipment((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }));
  };

  const validateEmail = (email: string): boolean => {
    if (!email.trim()) return true; // optional
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleSubmitReservation = async () => {
    if (!firebaseUser || !selectedBuildingId || !selectedRoomId || !reservationDate || !startTime || !endTime || !purpose) return;
    if (endorsedByEmail && !validateEmail(endorsedByEmail)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const displayName = firebaseUser.displayName || 'Student';
      await createReservation({
        userId: firebaseUser.uid,
        userName: displayName,
        userRole: 'Student',
        roomId: selectedRoomId,
        roomName: selectedRoomName,
        buildingId: selectedBuildingId,
        buildingName: selectedBuildingName,
        date: reservationDate,
        startTime,
        endTime,
        purpose,
        equipment,
        endorsedByEmail: endorsedByEmail.trim() || undefined,
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        resetForm();
      }, 2000);
    } catch (err) {
      console.error('Failed to create reservation:', err);
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setShowReservationForm(false);
    setFormStep(1);
    setSelectedBuildingId('');
    setSelectedBuildingName('');
    setSelectedRoomId('');
    setSelectedRoomName('');
    setReservationDate('');
    setStartTime('');
    setEndTime('');
    setPurpose('');
    setSubmitSuccess(false);
    setEquipment({ fans: 0, speakers: 0, televisions: 0, hdmiCables: 0, monoblockChairs: 0, tables: 0 });
    setEndorsedByEmail('');
    setEmailError('');
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser) return;
    await markAllNotificationsRead(firebaseUser.uid);
  };

  // ─── Computed Values ────────────────────────────────────────
  const pendingCount = reservationHistory.filter((r) => r.status === 'pending').length;
  const activeReservation = reservationHistory.find((r) => r.status === 'approved');
  const nextBooking = reservationHistory.find((r) => r.status === 'approved' || r.status === 'pending');

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
        {/* Welcome + Notification Bell */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Welcome back, {firstName} 🎓</h2>
            <p className="text-white/40 mt-1">Here&apos;s an overview of your reservations</p>
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
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          notif.type === 'reservation_approved' ? 'bg-green-500/20' :
                          notif.type === 'reservation_rejected' ? 'bg-red-500/20' : 'bg-primary/20'
                        }`}>
                          <svg className={`w-4 h-4 ${
                            notif.type === 'reservation_approved' ? 'text-green-400' :
                            notif.type === 'reservation_rejected' ? 'text-red-400' : 'text-primary'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {notif.type === 'reservation_approved' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            ) : notif.type === 'reservation_rejected' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            )}
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white">{notif.title}</p>
                          <p className="text-[11px] text-white/40 mt-0.5">{notif.message}</p>
                        </div>
                        <button
                          onClick={() => markNotificationRead(notif.id)}
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

        {/* ─── Top 3 Cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {/* Active Now */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <span className="text-xs text-white/40 font-bold">Active Now</span>
            </div>
            {activeReservation ? (
              <>
                <h3 className="text-lg font-bold text-white">{activeReservation.roomName}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-bold">Approved</span>
                </div>
                <p className="text-[10px] text-white/30 mt-0.5">{activeReservation.buildingName} · {activeReservation.date}</p>
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-white/30 font-bold">No active room</p>
                <p className="text-[10px] text-white/20 mt-0.5">You have no reservation right now</p>
              </div>
            )}
          </div>

          {/* Pending Requests */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <span className="text-xs text-white/40 font-bold">Pending Requests</span>
            </div>
            <h3 className="text-3xl font-bold text-white">{pendingCount}</h3>
            <p className="text-xs text-white/30 mt-0.5">Requests</p>
          </div>

          {/* Next Booking */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs text-white/40 font-bold">Next Booking</span>
            </div>
            {nextBooking ? (
              <>
                <h3 className="text-xl font-bold text-white">{nextBooking.startTime} – {nextBooking.endTime}</h3>
                <p className="text-xs text-white/40 mt-0.5">{nextBooking.roomName}</p>
                <p className="text-[10px] text-white/20">{nextBooking.buildingName} · {nextBooking.date}</p>
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-white/30 font-bold">No upcoming</p>
                <p className="text-[10px] text-white/20 mt-0.5">No reservations scheduled</p>
              </div>
            )}
          </div>
        </div>

        {/* ─── New Reservation Button / Form ──────────────────────── */}
        {!showReservationForm ? (
          <button
            onClick={() => setShowReservationForm(true)}
            className="w-full glass-card p-5 !rounded-2xl flex items-center justify-center gap-3 mb-8 group hover:!border-primary/40 transition-all cursor-pointer"
          >
            <svg className="w-6 h-6 text-white/40 group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-lg font-bold text-white/60 group-hover:text-white transition-colors">
              New Reservation
            </span>
          </button>
        ) : (
          <div className="glass-card p-6 !rounded-2xl mb-8">
            {/* Success State */}
            {submitSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Reservation Submitted!</h3>
                <p className="text-sm text-white/40">The building admin will review your request.</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-white">New Reservation</h3>
                    <p className="text-xs text-white/40 mt-0.5">
                      Step {formStep} of 4 — {
                        formStep === 1 ? 'Select Building' :
                        formStep === 2 ? 'Select Room' :
                        formStep === 3 ? 'Date, Time & Purpose' :
                        'Equipment & Endorsement'
                      }
                    </p>
                  </div>
                  <button
                    onClick={resetForm}
                    className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="flex gap-2 mb-6">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-1 flex-1 rounded-full transition-all ${
                        step <= formStep ? 'bg-primary' : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>

                {/* Step 1: Select Building */}
                {formStep === 1 && (
                  <div>
                    <h4 className="text-sm font-bold text-white/70 mb-3">Where would you like to book?</h4>
                    {buildings.length === 0 ? (
                      <div className="text-center py-8">
                        <svg className="animate-spin h-6 w-6 text-white/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-white/30">Loading buildings...</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {buildings.map((building) => (
                          <button
                            key={building.id}
                            onClick={() => handleBuildingSelect(building.id)}
                            className="glass-card !bg-white/5 p-4 !rounded-xl text-left group hover:!border-primary/40 transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                              </div>
                              <div>
                                <h5 className="font-bold text-white text-sm group-hover:text-primary transition-colors">{building.name}</h5>
                                {building.code && (
                                  <p className="text-[10px] text-white/30">{building.code} · {building.floors} floors</p>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Select Room */}
                {formStep === 2 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => setFormStep(1)}
                        className="p-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h4 className="text-sm font-bold text-white/70">
                        Available rooms in <span className="text-primary">{selectedBuildingName}</span>
                      </h4>
                    </div>

                    {roomsLoading ? (
                      <div className="text-center py-8">
                        <svg className="animate-spin h-6 w-6 text-white/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-white/30">Loading rooms...</p>
                      </div>
                    ) : rooms.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-sm text-white/30">No available rooms in this building.</p>
                        <button
                          onClick={() => setFormStep(1)}
                          className="mt-3 text-sm text-primary font-bold hover:text-primary-hover transition-colors"
                        >
                          Choose another building
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {rooms.map((room) => (
                          <button
                            key={room.id}
                            onClick={() => handleRoomSelect(room.id)}
                            className="glass-card !bg-white/5 p-4 !rounded-xl text-left group hover:!border-green-500/40 transition-all cursor-pointer border-l-4 border-green-500/40"
                          >
                            <h5 className="font-bold text-white text-sm">{room.name}</h5>
                            <p className="text-[10px] text-white/30 mt-0.5">{room.floor}</p>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-green-500/20 text-green-300 border-green-500/30 mt-2">
                              Available
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Date, Time, Purpose */}
                {formStep === 3 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <button
                        onClick={() => setFormStep(2)}
                        className="p-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h4 className="text-sm font-bold text-white/70">
                        Booking <span className="text-primary">{selectedRoomName}</span> in {selectedBuildingName}
                      </h4>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-white/70 mb-1.5">Date</label>
                        <input
                          type="date"
                          value={reservationDate}
                          onChange={(e) => setReservationDate(e.target.value)}
                          className="glass-input w-full px-4 py-3"
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-white/70 mb-1.5">Start Time</label>
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="glass-input w-full px-4 py-3"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-white/70 mb-1.5">End Time</label>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="glass-input w-full px-4 py-3"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-white/70 mb-1.5">Purpose</label>
                        <input
                          type="text"
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                          className="glass-input w-full px-4 py-3"
                          placeholder="e.g., Group Study, Meeting, Workshop"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (!reservationDate || !startTime || !endTime || !purpose) return;
                          setFormStep(4);
                        }}
                        disabled={!reservationDate || !startTime || !endTime || !purpose}
                        className="btn-primary w-full py-3 px-4 flex items-center justify-center"
                      >
                        Next: Equipment & Endorsement
                        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 4: Equipment & Endorsement */}
                {formStep === 4 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <button
                        onClick={() => setFormStep(3)}
                        className="p-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h4 className="text-sm font-bold text-white/70">
                        Materials / Equipment
                      </h4>
                    </div>

                    <div className="space-y-6">
                      {/* Equipment Steppers */}
                      <div className="space-y-3">
                        {[
                          { key: 'fans', label: 'Fans' },
                          { key: 'speakers', label: 'Speakers with Microphones' },
                          { key: 'televisions', label: 'Televisions' },
                          { key: 'hdmiCables', label: 'HDMI Cables' },
                          { key: 'monoblockChairs', label: 'Monoblock Chairs' },
                          { key: 'tables', label: 'Tables' },
                        ].map((item) => (
                          <div
                            key={item.key}
                            className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                          >
                            <span className="text-sm font-bold text-white/70">{item.label}</span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => updateEquipment(item.key, -1)}
                                disabled={equipment[item.key] === 0}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all bg-white/5 border border-white/10 hover:bg-white/10 hover:text-primary disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/40"
                              >
                                ←
                              </button>
                              <span className="w-8 text-center text-sm font-bold text-white">
                                {equipment[item.key]}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateEquipment(item.key, 1)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all bg-white/5 border border-white/10 hover:bg-white/10 hover:text-primary"
                              >
                                →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Endorsement */}
                      <div>
                        <h5 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3">Signature / Endorsement</h5>
                        <label className="block text-xs font-bold text-white/40 mb-1.5">
                          Endorsed by Dean / Department Head
                        </label>
                        <input
                          type="email"
                          value={endorsedByEmail}
                          onChange={(e) => {
                            setEndorsedByEmail(e.target.value);
                            if (emailError) setEmailError('');
                          }}
                          className={`glass-input w-full px-4 py-3 ${
                            emailError ? '!border-red-500/60' : ''
                          }`}
                          placeholder="Input e-mail"
                        />
                        {emailError && (
                          <p className="text-xs text-red-400 mt-1.5 font-bold">{emailError}</p>
                        )}
                      </div>

                      {/* Submit */}
                      <button
                        onClick={handleSubmitReservation}
                        disabled={submitting}
                        className="btn-primary w-full py-3 px-4 flex items-center justify-center"
                      >
                        {submitting ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Submitting...
                          </>
                        ) : (
                          'Submit Reservation'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Reservation History ─────────────────────────────────── */}
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Reservation History</h3>
          <div className="glass-card !rounded-xl overflow-hidden">
            {reservationHistory.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="w-14 h-14 text-white/8 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="text-sm text-white/30 font-bold">No reservations yet</p>
                <p className="text-xs text-white/15 mt-1">Your reservation history will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {reservationHistory.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                    {/* Color Bar */}
                    <HistoryDot status={item.status} />
                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white">{item.roomName} · {item.buildingName}</h4>
                      <p className="text-xs text-white/35 mt-0.5">{item.date} · {item.startTime} – {item.endTime}</p>
                      <p className="text-[10px] text-white/20 mt-0.5">{item.purpose}</p>
                    </div>
                    {/* Status Badge */}
                    <HistoryBadge status={item.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass-nav border-t border-white/10 z-40">
        <div className="grid grid-cols-4 h-16">
          {[
            { label: 'Home', active: true, icon: <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /> },
            { label: 'Reservations', active: false, icon: <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /> },
            { label: 'Reserve', active: false, icon: <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /> },
            { label: 'Alerts', active: false, icon: <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /> },
          ].map((item) => (
            <button key={item.label} className={`flex flex-col items-center justify-center transition-colors ${item.active ? 'text-primary' : 'text-white/30 hover:text-primary'}`}>
              <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 20 20">{item.icon}</svg>
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
