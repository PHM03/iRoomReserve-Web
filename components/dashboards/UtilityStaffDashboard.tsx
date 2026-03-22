'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Schedule,
  onSchedulesByBuilding,
  DAY_NAMES,
  formatTime12h,
} from '@/lib/schedules';
import {
  onReservationsByBuilding,
  Reservation,
} from '@/lib/reservations';
import {
  AdminRequest,
  onAdminRequestsByBuilding,
} from '@/lib/adminRequests';
import {
  Room,
  onRoomsByBuilding,
} from '@/lib/rooms';

// ─── Helpers ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const style = (() => {
    switch (status) {
      case 'Occupied': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'Unavailable': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'Available': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'approved': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default: return 'bg-white/10 text-white/50 border-white/20';
    }
  })();
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${style}`}>
      {status}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────
interface UtilityStaffDashboardProps {
  firstName: string;
}

export default function UtilityStaffDashboard({ firstName }: UtilityStaffDashboardProps) {
  const { firebaseUser, profile } = useAuth();
  const buildingId = profile?.assignedBuildingId;
  const buildingName = profile?.assignedBuilding;

  // State
  const [rooms, setRooms] = useState<Room[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);

  // ─── Real-time Listeners ──────────────────────────────────────
  useEffect(() => {
    if (!buildingId || !firebaseUser) return;

    const unsubRooms = onRoomsByBuilding(buildingId, setRooms);
    const unsubSchedules = onSchedulesByBuilding(buildingId, setSchedules);
    const unsubReservations = onReservationsByBuilding(buildingId, setReservations);
    const unsubRequests = onAdminRequestsByBuilding(buildingId, setAdminRequests);

    return () => {
      unsubRooms();
      unsubSchedules();
      unsubReservations();
      unsubRequests();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, firebaseUser?.uid]);

  // ─── Computed Values ──────────────────────────────────────────
  const today = new Date();
  const todayDateStr = today.toISOString().split('T')[0];
  const currentDay = today.getDay();
  const currentTime = today.getHours().toString().padStart(2, '0') + ':' + today.getMinutes().toString().padStart(2, '0');

  const todaySchedules = schedules.filter((s) => s.dayOfWeek === currentDay);
  const todayReservations = reservations.filter(
    (r) => r.date === todayDateStr && (r.status === 'approved' || r.status === 'pending')
  );
  const openRequests = adminRequests.filter((r) => r.status === 'open');

  // ─── No Building Assigned State ───────────────────────────────
  if (!buildingId || !buildingName) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Hello, {firstName} 🔑</h2>
          <p className="text-white/40 mt-1">Utility Staff Dashboard</p>
        </div>
        <div className="glass-card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-white/60 mb-2">No Building Assigned</h3>
          <p className="text-sm text-white/30 max-w-sm mx-auto">
            Your account has been approved, but no building has been assigned to you yet. Please contact the Super Admin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
      {/* Welcome */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Hello, {firstName} 🔑</h2>
        <p className="text-white/40 mt-1">
          Managing: <span className="text-teal-400 font-bold">{buildingName}</span>
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-card p-5 border-l-4 border-teal-500/60">
          <p className="text-2xl font-bold text-teal-400">{rooms.length}</p>
          <p className="text-xs text-white/50 font-bold">Total Rooms</p>
        </div>
        <div className="glass-card p-5 border-l-4 border-orange-500/60">
          <p className="text-2xl font-bold text-orange-400">{todaySchedules.length}</p>
          <p className="text-xs text-white/50 font-bold">Classes Today</p>
        </div>
        <div className="glass-card p-5 border-l-4 border-blue-500/60">
          <p className="text-2xl font-bold text-blue-400">{todayReservations.length}</p>
          <p className="text-xs text-white/50 font-bold">Reservations Today</p>
        </div>
        <div className="glass-card p-5 border-l-4 border-yellow-500/60">
          <p className="text-2xl font-bold text-yellow-400">{openRequests.length}</p>
          <p className="text-xs text-white/50 font-bold">Open Requests</p>
        </div>
      </div>

      {/* ─── Today's Class Schedules ──────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">
            Today&apos;s Class Schedules
            <span className="text-sm text-white/30 font-normal ml-2">({DAY_NAMES[currentDay]})</span>
          </h3>
          <span className="text-xs text-white/30">{todaySchedules.length} class{todaySchedules.length !== 1 ? 'es' : ''}</span>
        </div>

        {todaySchedules.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-3xl mb-2">📚</div>
            <p className="text-sm text-white/30">No classes scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {todaySchedules.map((s) => {
              const isActive = s.startTime <= currentTime && s.endTime > currentTime;
              const isUpcoming = s.startTime > currentTime;
              return (
                <div key={s.id} className={`glass-card p-4 border-l-4 ${isActive ? 'border-orange-500/60' : isUpcoming ? 'border-teal-500/40' : 'border-white/10'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{s.subjectName}</p>
                      <p className="text-xs text-white/40 mt-0.5">{s.roomName} · {s.instructorName}</p>
                      <p className="text-xs text-white/50 mt-1">{formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}</p>
                    </div>
                    {isActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                        In Progress
                      </span>
                    )}
                    {isUpcoming && !isActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        Upcoming
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Today's Room Reservations ────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Today&apos;s Room Reservations</h3>
          <span className="text-xs text-white/30">{todayReservations.length} reservation{todayReservations.length !== 1 ? 's' : ''}</span>
        </div>

        {todayReservations.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-sm text-white/30">No reservations for today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayReservations.map((res) => {
              const isActive = res.startTime <= currentTime && res.endTime > currentTime;
              return (
                <div key={res.id} className={`glass-card p-4 sm:p-5 border-l-4 ${isActive ? 'border-orange-500/40' : res.status === 'pending' ? 'border-yellow-500/40' : 'border-green-500/40'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {res.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{res.userName}</h4>
                          <StatusBadge status={res.status} />
                          {isActive && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              Active Now
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">
                          {res.roomName} · {res.startTime} – {res.endTime}
                        </p>
                        <p className="text-xs text-white/30 mt-0.5">Purpose: {res.purpose}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Contact Requests from Admin ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Admin Requests</h3>
          {openRequests.length > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {openRequests.length} open
            </span>
          )}
        </div>

        {adminRequests.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-sm text-white/30">No admin requests for this building.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {adminRequests.slice(0, 10).map((req) => {
              const reqStatusStyle = (() => {
                switch (req.status) {
                  case 'open': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                  case 'responded': return 'bg-green-500/20 text-green-400 border-green-500/30';
                  case 'closed': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                  default: return 'bg-white/10 text-white/50 border-white/20';
                }
              })();
              const reqTypeIcon = req.type === 'equipment' ? '🔧' : req.type === 'general' ? '💬' : '📋';

              return (
                <div key={req.id} className="glass-card p-4 sm:p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {req.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-bold text-white text-sm">{req.userName}</h4>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${reqStatusStyle} capitalize`}>
                            {req.status}
                          </span>
                        </div>
                        <p className="text-xs text-white/40">
                          <span className="mr-1">{reqTypeIcon}</span>
                          {req.type} · {req.subject}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-white/50 mb-2">{req.message}</p>
                  {req.adminResponse && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                      <p className="text-xs font-bold text-primary mb-1">Admin Response</p>
                      <p className="text-sm text-white/60">{req.adminResponse}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
