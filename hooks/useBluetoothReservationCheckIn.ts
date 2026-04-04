'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { connectToBeacon, type BeaconConnection } from '@/lib/beaconBluetooth';
import {
  checkInReservation,
  disconnectReservationBeacon,
  type Reservation,
} from '@/lib/reservations';
import { type Room } from '@/lib/rooms';

type ToastType = 'success' | 'error';
export type BluetoothConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected';

interface BluetoothReservationCheckInInput {
  reservation: Reservation;
  room?: Room;
  userId: string;
}

interface ActiveReservationSession {
  connection: BeaconConnection;
  hasCheckedIn: boolean;
}

const activeReservationSessions = new Map<string, ActiveReservationSession>();

function getInitialConnectionStatuses() {
  const initialStatuses: Record<string, BluetoothConnectionStatus> = {};

  activeReservationSessions.forEach((session, reservationId) => {
    initialStatuses[reservationId] = session.hasCheckedIn
      ? 'connected'
      : 'connecting';
  });

  return initialStatuses;
}

export function useBluetoothReservationCheckIn() {
  const [loadingReservationId, setLoadingReservationId] = useState<string | null>(
    null
  );
  const [connectionStatuses, setConnectionStatuses] = useState<
    Record<string, BluetoothConnectionStatus>
  >(getInitialConnectionStatuses);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');
  const [showToast, setShowToast] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pushToast = useCallback((message: string, type: ToastType) => {
    if (!isMountedRef.current) {
      return;
    }

    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  }, []);

  const dismissToast = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    setShowToast(false);
  }, []);

  const setConnectionStatus = useCallback(
    (reservationId: string, status: BluetoothConnectionStatus) => {
      if (!isMountedRef.current) {
        return;
      }

      setConnectionStatuses((currentStatuses) => {
        if (currentStatuses[reservationId] === status) {
          return currentStatuses;
        }

        return {
          ...currentStatuses,
          [reservationId]: status,
        };
      });
    },
    []
  );

  const getConnectionStatus = useCallback(
    (reservationId: string): BluetoothConnectionStatus =>
      connectionStatuses[reservationId] ?? 'disconnected',
    [connectionStatuses]
  );

  const checkInWithBluetooth = useCallback(
    async ({ reservation, room, userId }: BluetoothReservationCheckInInput) => {
      if (!userId) {
        pushToast('You must be signed in to use Bluetooth check-in.', 'error');
        return;
      }

      if (reservation.userId !== userId) {
        pushToast('You can only check in to your own reservation.', 'error');
        return;
      }

      if (reservation.status !== 'approved') {
        pushToast(
          'Only approved reservations can be checked in via Bluetooth.',
          'error'
        );
        return;
      }

      if (reservation.checkedInAt) {
        pushToast('This reservation has already been checked in.', 'error');
        return;
      }

      if (!room) {
        pushToast('Room details could not be loaded for this reservation.', 'error');
        return;
      }

      if (!room.beaconId?.trim()) {
        pushToast(
          `${room.name} does not have a beacon ID configured yet.`,
          'error'
        );
        return;
      }

      const existingSession = activeReservationSessions.get(reservation.id);
      if (existingSession?.hasCheckedIn) {
        setConnectionStatus(reservation.id, 'connected');
        pushToast(
          `Bluetooth is already connected for ${reservation.roomName}.`,
          'success'
        );
        return;
      }

      setLoadingReservationId(reservation.id);
      setConnectionStatus(reservation.id, 'connecting');

      try {
        const connection = await connectToBeacon({
          beaconId: room.beaconId,
          onDisconnected: () => {
            const activeSession = activeReservationSessions.get(reservation.id);
            activeReservationSessions.delete(reservation.id);
            setConnectionStatus(reservation.id, 'disconnected');

            if (!activeSession?.hasCheckedIn) {
              return;
            }

            void disconnectReservationBeacon(reservation.id, userId)
              .then(() => {
                pushToast(
                  `${reservation.roomName} Bluetooth disconnected. The room is available again.`,
                  'error'
                );
              })
              .catch((error: unknown) => {
                console.error('Failed to handle Bluetooth disconnect:', error);
                pushToast(
                  `Bluetooth disconnected from ${reservation.roomName}, but the room status could not be refreshed automatically.`,
                  'error'
                );
              });
          },
        });

        activeReservationSessions.set(reservation.id, {
          connection,
          hasCheckedIn: false,
        });

        try {
          await checkInReservation(reservation.id, userId, 'bluetooth');
          activeReservationSessions.set(reservation.id, {
            connection,
            hasCheckedIn: true,
          });
          setConnectionStatus(reservation.id, 'connected');
          pushToast(
            `Connected to ${room.beaconId} and checked in to ${reservation.roomName}.`,
            'success'
          );
        } catch (error) {
          activeReservationSessions.delete(reservation.id);
          setConnectionStatus(reservation.id, 'disconnected');
          await connection.disconnect().catch(() => undefined);
          throw error;
        }
      } catch (error) {
        setConnectionStatus(reservation.id, 'disconnected');
        const message =
          error instanceof Error
            ? error.message
            : 'Bluetooth connection failed. Please try again.';
        pushToast(message, 'error');
      } finally {
        if (isMountedRef.current) {
          setLoadingReservationId(null);
        }
      }
    },
    [pushToast, setConnectionStatus]
  );

  return {
    checkInWithBluetooth,
    dismissToast,
    getConnectionStatus,
    loadingReservationId,
    showToast,
    toastMessage,
    toastType,
  };
}
