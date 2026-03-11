'use client';

import React from 'react';
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

// Mock user data
const user = {
  name: 'John Doe',
  initials: 'JD',
  role: 'Student',
};

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar user={user} />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <SummaryCard
            icon="🟢"
            number="8"
            label="Available Rooms"
            color="border-green-500"
          />
          <SummaryCard
            icon="🔵"
            number="3"
            label="Reserved"
            color="border-blue-500"
          />
          <SummaryCard
            icon="🟠"
            number="5"
            label="Occupied"
            color="border-orange-500"
          />
          <SummaryCard
            icon="🔴"
            number="2"
            label="Vacant (no-show)"
            color="border-red-500"
          />
        </div>

        {/* Room Availability */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Room Availability — Live</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                name={room.name}
                floor={room.floor}
                status={room.status}
              />
            ))}
          </div>
        </div>

        {/* Recent Reservations */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">My Recent Reservations</h2>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg shadow-md">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Room</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentReservations.map((reservation) => (
                  <tr key={reservation.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{reservation.room}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{reservation.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{reservation.time}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{reservation.purpose}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={reservation.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {recentReservations.map((reservation) => (
              <div key={reservation.id} className="bg-white rounded-lg shadow-md p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{reservation.room}</h3>
                    <p className="text-sm text-gray-500">{reservation.date}</p>
                  </div>
                  <StatusBadge status={reservation.status} />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Time:</span>
                    <span className="font-medium">{reservation.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Purpose:</span>
                    <span className="font-medium">{reservation.purpose}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="grid grid-cols-4 h-16">
          <a href="#" className="flex flex-col items-center justify-center text-red-800">
            <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            <span className="text-xs font-medium">Home</span>
          </a>
          <a href="#" className="flex flex-col items-center justify-center text-gray-400">
            <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Reservations</span>
          </a>
          <a href="#" className="flex flex-col items-center justify-center text-gray-400">
            <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Reserve</span>
          </a>
          <a href="#" className="flex flex-col items-center justify-center text-gray-400">
            <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-xs">Notifications</span>
          </a>
        </div>
      </div>
      {/* Add bottom padding for fixed nav */}
      <div className="md:hidden h-16"></div>
    </div>
  );
}
