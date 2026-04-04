import { describe, expect, it } from 'vitest';

import {
  buildBeaconRequestOptions,
  getBluetoothErrorMessage,
} from '../lib/beaconBluetooth';
import {
  getReservationRoomStatus,
  normalizeRoomCheckInMethod,
  resolveRoomStatus,
} from '../lib/roomStatus';

describe('beaconBluetooth', () => {
  it('builds a device request filtered to the expected beacon name and service', () => {
    expect(
      buildBeaconRequestOptions('ESP32_ROOM_301', '12345678-1234-1234-1234-1234567890ab')
    ).toEqual({
      filters: [
        {
          name: 'ESP32_ROOM_301',
          services: ['12345678-1234-1234-1234-1234567890ab'],
        },
      ],
      optionalServices: ['12345678-1234-1234-1234-1234567890ab'],
    });
  });

  it('maps common Web Bluetooth errors to user-friendly messages', () => {
    expect(getBluetoothErrorMessage({ name: 'NotFoundError' })).toContain(
      'not found'
    );
    expect(getBluetoothErrorMessage({ name: 'NotAllowedError' })).toContain(
      'permission'
    );
  });
});

describe('roomStatus bluetooth handling', () => {
  it('normalizes legacy BLE values to bluetooth', () => {
    expect(normalizeRoomCheckInMethod('ble')).toBe('bluetooth');
    expect(normalizeRoomCheckInMethod('bluetooth')).toBe('bluetooth');
    expect(normalizeRoomCheckInMethod('manual')).toBe('manual');
  });

  it('treats a disconnected bluetooth check-in as available in room status', () => {
    const reservation = {
      id: 'reservation-1',
      roomId: 'room-1',
      date: '2026-04-04',
      startTime: '08:00',
      endTime: '09:00',
      status: 'approved',
      checkedInAt: { seconds: 1 } as never,
      checkInMethod: 'bluetooth' as const,
    };
    const room = {
      id: 'room-1',
      status: 'Available',
      activeReservationId: 'reservation-1',
      beaconConnected: false,
      checkInMethod: 'bluetooth' as const,
    };

    expect(getReservationRoomStatus(reservation, room)).toBe('Available');
    expect(resolveRoomStatus(room, [reservation]).status).toBe('Available');
  });
});
