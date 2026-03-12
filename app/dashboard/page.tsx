'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '../../components/NavBar';
import SummaryCard from '../../components/SummaryCard';
import RoomCard from '../../components/RoomCard';
import StatusBadge, { Status } from '../../components/StatusBadge';

// Mock data for rooms
const rooms = [
  { id: 1, name: 'Room 101', floor: '1st Floor', status: 'Available' as Status },
  { id: 2, name: 'Room 102', floor: '1st Floor', status: 'Reserved' as Status },
  { id: 3, name: 'Room 201', floor: '2nd Floor', status: 'Occupied' as Status },
  { id: 4, name: 'Room 202', floor: '2nd Floor', status: 'Vacant' as Status },
  { id: 5, name: 'Room 301', floor: '3rd Floor', status: 'Available' as Status },
  { id: 6, name: 'Room 302', floor: '3rd Floor', status: 'Reserved' as Status },
];

// Mock data for recent reservations
const recentReservations = [
  { id: 1, room: 'Room 101', date: '2023-06-15', time: '09:00 - 10:30', purpose: 'Lecture', status: 'Available' as Status },
  { id: 2, room: 'Room 201', date: '2023-06-14', time: '14:00 - 15:30', purpose: 'Meeting', status: 'Occupied' as Status },
  { id: 3, room: 'Room 302', date: '2023-06-13', time: '10:00 - 12:00', purpose: 'Workshop', status: 'Reserved' as Status },
  { id: 4, room: 'Room 102', date: '2023-06-12', time: '16:00 - 17:00', purpose: 'Tutorial', status: 'Vacant' as Status },
];

export default function Dashboard() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const router = useRouter();

  // Redirect to login if not authenticated, or to superadmin dashboard if Super Admin
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push('/');
    }
    if (!loading && profile?.role === 'Super Admin') {
      router.push('/superadmin/dashboard');
    }
  }, [loading, firebaseUser, profile, router]);

  // Show loading while auth resolves or redirecting
  if (loading || !firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-white/50">Loading...</p>
        </div>
      </div>
    );
  }

  // Build user object from real data
  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : firebaseUser?.displayName || 'User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const user = {
    name: displayName,
    initials,
    role: profile?.role || 'Student',
  };

  return (
    <div className="min-h-screen relative">
      {/* Decorative background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-20 -left-40 w-96 h-96 rounded-full bg-secondary/8 blur-3xl" />
      </div>

      <NavBar user={user} onLogout={logout} />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Welcome back, {profile?.firstName || 'User'}</h2>
          <p className="text-white/40 mt-1">Here&apos;s what&apos;s happening with your rooms today</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SummaryCard icon="🟢" number="8" label="Available Rooms" color="border-green-500/60" />
          <SummaryCard icon="🔵" number="3" label="Reserved" color="border-blue-500/60" />
          <SummaryCard icon="🟠" number="5" label="Occupied" color="border-orange-500/60" />
          <SummaryCard icon="🔴" number="2" label="Vacant (no-show)" color="border-red-500/60" />
        </div>

        {/* Room Availability */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Room Availability — Live</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <RoomCard key={room.id} name={room.name} floor={room.floor} status={room.status} />
            ))}
          </div>
        </div>

        {/* Recent Reservations */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">My Recent Reservations</h2>

          {/* Desktop table */}
          <div className="hidden md:block glass-card overflow-hidden !rounded-xl">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Room</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Purpose</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-white/50 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentReservations.map((reservation) => (
                  <tr key={reservation.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">{reservation.room}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">{reservation.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">{reservation.time}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">{reservation.purpose}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={reservation.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {recentReservations.map((reservation) => (
              <div key={reservation.id} className="glass-card p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-white">{reservation.room}</h3>
                    <p className="text-sm text-white/40">{reservation.date}</p>
                  </div>
                  <StatusBadge status={reservation.status} />
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/40">Time:</span>
                    <span className="font-bold text-white/70">{reservation.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Purpose:</span>
                    <span className="font-bold text-white/70">{reservation.purpose}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 glass-nav border-t border-white/10">
        <div className="grid grid-cols-4 h-16">
          {[
            { label: 'Home', active: true, icon: <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /> },
            { label: 'Reservations', active: false, icon: <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /> },
            { label: 'Reserve', active: false, icon: <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /> },
            { label: 'Alerts', active: false, icon: <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" /> },
          ].map((item) => (
            <a key={item.label} href="#" className={`flex flex-col items-center justify-center transition-colors ${item.active ? 'text-primary' : 'text-white/30 hover:text-primary'}`}>
              <svg className="w-5 h-5 mb-1" fill="currentColor" viewBox="0 0 20 20">{item.icon}</svg>
              <span className="text-[10px] font-bold">{item.label}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="md:hidden h-16" />
    </div>
  );
}
