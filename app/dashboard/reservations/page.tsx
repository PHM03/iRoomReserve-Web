'use client';

import React, { useEffect, useState } from 'react';

import BleStatus from '@/components/BleStatus';
import StatusBadge from '@/components/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { onRoomsByIds, Room } from '@/lib/rooms';
import {
  cancelReservation,
  completeReservation,
  deleteReservation,
  onReservationsByUser,
  Reservation,
} from '@/lib/reservations';
import { getReservationRoomStatus } from '@/lib/roomStatus';

type FilterTab =
  | 'all'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled';

export default function MyReservationsPage() {
  const { firebaseUser } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    const unsubscribeReservations = onReservationsByUser(
      firebaseUser.uid,
      setReservations
    );

    return () => {
      unsubscribeReservations();
    };
  }, [firebaseUser]);

  useEffect(() => {
    const roomIds = [...new Set(reservations.map((reservation) => reservation.roomId))];
    const unsubscribeRooms = onRoomsByIds(roomIds, setRooms);

    return () => {
      unsubscribeRooms();
    };
  }, [reservations]);

  const roomLookup = Object.fromEntries(
    rooms.map((room) => [room.id, room] as const)
  ) as Record<string, Room | undefined>;

  const filteredReservations =
    activeFilter === 'all'
      ? reservations
      : reservations.filter((reservation) => reservation.status === activeFilter);

  const filters: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: reservations.length },
    {
      key: 'pending',
      label: 'Pending',
      count: reservations.filter((reservation) => reservation.status === 'pending')
        .length,
    },
    {
      key: 'approved',
      label: 'Approved',
      count: reservations.filter(
        (reservation) => reservation.status === 'approved'
      ).length,
    },
    {
      key: 'rejected',
      label: 'Rejected',
      count: reservations.filter(
        (reservation) => reservation.status === 'rejected'
      ).length,
    },
    {
      key: 'completed',
      label: 'Completed',
      count: reservations.filter(
        (reservation) => reservation.status === 'completed'
      ).length,
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      count: reservations.filter(
        (reservation) => reservation.status === 'cancelled'
      ).length,
    },
  ];

  const handleCancel = async (reservationId: string) => {
    if (!firebaseUser) {
      return;
    }

    setActionLoading(reservationId);

    try {
      await cancelReservation(reservationId, firebaseUser.uid);
    } catch (error) {
      console.error('Failed to cancel:', error);
    }

    setActionLoading(null);
  };

  const handleComplete = async (reservationId: string) => {
    if (!firebaseUser) {
      return;
    }

    setActionLoading(reservationId);

    try {
      await completeReservation(reservationId, firebaseUser.uid);
    } catch (error) {
      console.error('Failed to complete:', error);
    }

    setActionLoading(null);
  };

  const handleDelete = async (reservationId: string) => {
    if (!firebaseUser) {
      return;
    }

    if (
      !confirm(
        'Are you sure you want to delete this reservation? This cannot be undone.'
      )
    ) {
      return;
    }

    setActionLoading(reservationId);

    try {
      await deleteReservation(reservationId, firebaseUser.uid);
    } catch (error) {
      console.warn('Failed to delete:', error);
    }

    setActionLoading(null);
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-black">My Reservations</h2>
        <p className="text-black mt-1">
          View and manage all your room reservations
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeFilter === filter.key
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-dark/5 text-black border border-dark/10 hover:text-primary hover:bg-primary/10'
            }`}
          >
            {filter.label}
            {filter.count > 0 && (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeFilter === filter.key
                    ? 'bg-primary/30 text-primary'
                    : 'bg-dark/10 text-black'
                }`}
              >
                {filter.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredReservations.length === 0 ? (
          <div className="glass-card p-12 !rounded-xl text-center">
            <svg
              className="w-14 h-14 text-black mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-sm text-black font-bold">
              No {activeFilter === 'all' ? '' : activeFilter} reservations
            </p>
          </div>
        ) : (
          filteredReservations.map((reservation) => {
            const room = roomLookup[reservation.roomId];
            const roomStatus = getReservationRoomStatus(reservation, room);

            return (
              <div key={reservation.id} className="glass-card p-5 !rounded-xl">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-base font-bold text-black">
                          {reservation.roomName}
                        </h3>
                        <StatusBadge status={reservation.status} />
                        <StatusBadge status={roomStatus} />
                      </div>
                      <p className="text-sm text-black">
                        {reservation.buildingName}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <svg
                            className="w-3.5 h-3.5 text-black"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="text-xs text-black">
                            {reservation.date}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <svg
                            className="w-3.5 h-3.5 text-black"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span className="text-xs text-black">
                            {reservation.startTime} - {reservation.endTime}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-black mt-1.5">
                        {reservation.purpose}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:min-w-[140px]">
                      {(reservation.status === 'pending' ||
                        reservation.status === 'approved') && (
                        <button
                          onClick={() => handleCancel(reservation.id)}
                          disabled={actionLoading === reservation.id}
                          className="px-4 py-2 rounded-xl text-xs font-bold ui-button-red disabled:opacity-50"
                        >
                          {actionLoading === reservation.id ? 'Processing...' : 'Cancel'}
                        </button>
                      )}
                      {reservation.status === 'approved' && (
                        <button
                          onClick={() => handleComplete(reservation.id)}
                          disabled={actionLoading === reservation.id}
                          className="px-4 py-2 rounded-xl text-xs font-bold ui-button-green disabled:opacity-50"
                        >
                          {actionLoading === reservation.id
                            ? 'Processing...'
                            : 'Mark Complete'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(reservation.id)}
                        disabled={actionLoading === reservation.id}
                        className="p-2 rounded-xl ui-button-ghost ui-button-ghost-danger disabled:opacity-50"
                        title="Delete reservation"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <BleStatus reservation={reservation} room={room} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
