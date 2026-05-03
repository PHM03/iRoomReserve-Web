import { describe, expect, it } from 'vitest';

import {
  BLE_HARDWARE_OFFLINE_WINDOW_MS,
  formatBleLabel,
  getBleHistoryTone,
  getRoomBleBeaconId,
  getTelemetryRoomLabel,
  isBeaconHardwareOnline,
} from '../lib/bleMonitor';

describe('bleMonitor helpers', () => {
  it('reads the beacon id from either bleBeaconId or beaconId', () => {
    expect(
      getRoomBleBeaconId({
        beaconId: 'LEGACY-ID',
        bleBeaconId: 'BLE-ID',
      } as never)
    ).toBe('BLE-ID');
    expect(
      getRoomBleBeaconId({
        beaconId: 'LEGACY-ID',
      } as never)
    ).toBe('LEGACY-ID');
  });

  it('marks beacon hardware online only when telemetry is recent', () => {
    expect(
      isBeaconHardwareOnline(
        '2026-04-04T12:00:00+08:00',
        new Date('2026-04-04T12:10:30+08:00'),
        BLE_HARDWARE_OFFLINE_WINDOW_MS
      )
    ).toBe(true);
    expect(
      isBeaconHardwareOnline(
        '2026-04-04T12:00:00+08:00',
        new Date('2026-04-04T12:12:30+08:00'),
        BLE_HARDWARE_OFFLINE_WINDOW_MS
      )
    ).toBe(false);
  });

  it('formats BLE labels and history tones for the admin monitor', () => {
    expect(formatBleLabel('END_OF_RESERVATION')).toBe('End Of Reservation');
    expect(
      getBleHistoryTone({
        connectionStatus: 'DISCONNECTED',
        eventType: 'END_OF_RESERVATION',
      })
    ).toBe('yellow');
    expect(
      getBleHistoryTone({
        connectionStatus: 'CONNECTED',
        eventType: 'CONNECTION',
      })
    ).toBe('green');
    expect(
      getBleHistoryTone({
        connectionStatus: 'DISCONNECTED',
        eventType: 'INTERVAL_UPDATE',
      })
    ).toBe('blue');
  });

  it('uses a shared label when multiple beacon rooms are configured', () => {
    expect(
      getTelemetryRoomLabel([
        {
          id: 'room-1',
          name: 'Room 101'
        },
        {
          id: 'room-2',
          name: 'Room 102'
        },
      ])
    ).toBe('Shared Test Feed');
  });
});
