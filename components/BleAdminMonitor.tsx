'use client';

import { useCallback, useEffect, useState } from 'react';

import BleStatusBadge from '@/components/BleStatusBadge';
import {
  BLE_MONITOR_REFRESH_INTERVAL_MS,
  formatBleLabel,
  formatBleTimestamp,
  getBeaconConfiguredRooms,
  getBleHistoryTone,
  getRoomBleBeaconId,
  getTelemetryRoomLabel,
  isBeaconHardwareOnline,
} from '@/lib/bleMonitor';
import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  type OccupancyPayload,
} from '@/lib/occupancy';
import { fetchOccupancySnapshot } from '@/lib/occupancyClient';
import { type Room } from '@/lib/rooms';

interface BleAdminMonitorProps {
  buildingName?: string;
  rooms: Pick<Room, 'id' | 'name' | 'beaconId' | 'bleBeaconId'>[];
  className?: string;
  pollIntervalMs?: number;
}

function getHistoryRowClassName(statusTone: ReturnType<typeof getBleHistoryTone>) {
  switch (statusTone) {
    case 'green':
      return 'bg-green-500/8';
    case 'red':
      return 'bg-red-500/8';
    case 'yellow':
      return 'bg-yellow-500/12';
    case 'blue':
      return 'bg-blue-500/8';
    default:
      return 'bg-transparent';
  }
}

function formatRefreshTime(value: Date | null) {
  if (!value) {
    return 'Not refreshed yet';
  }

  return value.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRefreshCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function BleAdminMonitor({
  buildingName,
  rooms,
  className = '',
  pollIntervalMs = BLE_MONITOR_REFRESH_INTERVAL_MS,
}: BleAdminMonitorProps) {
  const [occupancyData, setOccupancyData] = useState<OccupancyPayload>(
    DEFAULT_OCCUPANCY_PAYLOAD
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [millisecondsUntilRefresh, setMillisecondsUntilRefresh] = useState(
    pollIntervalMs
  );
  const [refreshScheduleVersion, setRefreshScheduleVersion] = useState(0);
  const [isHistoryCleared, setIsHistoryCleared] = useState(false);

  const beaconRooms = getBeaconConfiguredRooms(rooms);
  const telemetryRoomLabel = getTelemetryRoomLabel(beaconRooms);
  const hardwareOnline = isBeaconHardwareOnline(occupancyData.timestamp);

  const refreshMonitor = useCallback(
    async (mode: 'initial' | 'manual' | 'background' = 'initial') => {
      if (mode === 'initial') {
        setIsLoading(true);
      }

      if (mode === 'manual') {
        setIsRefreshing(true);
      }

      try {
        const nextOccupancyData = await fetchOccupancySnapshot({
          force: mode === 'manual',
        });
        setOccupancyData(nextOccupancyData);

        setErrorMessage(null);
        setLastRefreshedAt(new Date());
        setIsHistoryCleared(false);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load BLE beacon data right now.'
        );
      } finally {
        if (mode === 'initial') {
          setIsLoading(false);
        }

        if (mode === 'manual') {
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void refreshMonitor('initial');
  }, [refreshMonitor]);

  useEffect(() => {
    const scheduleNextRefresh = () => {
      setNextRefreshAt(Date.now() + pollIntervalMs);
    };

    scheduleNextRefresh();

    const intervalId = window.setInterval(() => {
      void refreshMonitor('background');
      scheduleNextRefresh();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, refreshMonitor, refreshScheduleVersion]);

  useEffect(() => {
    if (nextRefreshAt === null) {
      setMillisecondsUntilRefresh(0);
      return;
    }

    const updateCountdown = () => {
      setMillisecondsUntilRefresh(Math.max(0, nextRefreshAt - Date.now()));
    };

    updateCountdown();

    const countdownIntervalId = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(countdownIntervalId);
    };
  }, [nextRefreshAt]);

  const handleManualRefresh = useCallback(() => {
    void refreshMonitor('manual');
    setRefreshScheduleVersion((currentValue) => currentValue + 1);
  }, [refreshMonitor]);

  const handleClearHistory = useCallback(() => {
    setIsHistoryCleared(true);
  }, []);

  const historyEntries = (isHistoryCleared ? [] : occupancyData.history).slice(
    0,
    50
  );

  return (
    <section className={`glass-card p-5 ${className}`.trim()}>
      <div className="flex flex-col gap-4 border-b border-dark/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30">
          <h3 className="text-lg font-bold text-gray-800">BLE Beacon Status</h3>
          <p className="mt-1 text-sm text-gray-600">
            Live ESP32 beacon telemetry for{' '}
            <span className="font-bold ui-text-teal">
              {buildingName ?? 'the active building'}
            </span>
            . Auto-refreshes every 10 minutes.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="text-xs text-black/70 space-y-1">
            <p>Last refreshed: {formatRefreshTime(lastRefreshedAt)}</p>
            <p>
              Next refresh in {formatRefreshCountdown(millisecondsUntilRefresh)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="ui-button-gray rounded-xl px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
            </button>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={historyEntries.length === 0}
              className="rounded-xl border border-dark/10 bg-white/70 px-4 py-2 text-xs font-bold text-black transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear History
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-xl border border-dark/10 bg-dark/5 px-4 py-3 text-sm text-black/70">
          Loading BLE beacon data...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {beaconRooms.length > 1 ? (
        <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          The current ESP32 endpoint is still a single test feed, so the live
          status below is shared across all configured beacon rooms until the
          API includes a room or beacon identifier.
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-dark/10 bg-dark/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">
            Beacon Hardware Status
          </p>
          <div className="mt-3">
            <BleStatusBadge
              status={hardwareOnline ? 'ONLINE' : 'OFFLINE'}
              label={hardwareOnline ? 'Beacon Online' : 'Beacon Offline'}
            />
          </div>
          <dl className="mt-4 space-y-2 text-sm text-black/75">
            <div className="flex items-start justify-between gap-4">
              <dt className="font-bold text-black">Last seen</dt>
              <dd className="text-right">
                {formatBleTimestamp(occupancyData.timestamp)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-bold text-black">Current event</dt>
              <dd className="text-right">
                {formatBleLabel(occupancyData.eventType)}
              </dd>
            </div>
          </dl>
          {!hardwareOnline ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              No beacon data has been received in the last 12 minutes.
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-dark/10 bg-dark/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">
            Live Connection Snapshot
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <BleStatusBadge
              status={occupancyData.connectionStatus}
              label={formatBleLabel(occupancyData.connectionStatus)}
            />
            <span className="rounded-full border border-dark/10 bg-white/70 px-3 py-1 text-xs font-bold text-black">
              Occupancy: {occupancyData.occupancy}
            </span>
          </div>
          <dl className="mt-4 space-y-2 text-sm text-black/75">
            <div className="flex items-start justify-between gap-4">
              <dt className="font-bold text-black">Telemetry room</dt>
              <dd className="text-right">{telemetryRoomLabel}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-bold text-black">Updated</dt>
              <dd className="text-right">
                {formatBleTimestamp(occupancyData.timestamp)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-base font-bold text-black">
            Live Connection Status
          </h4>
          <span className="text-xs text-black/60">
            {beaconRooms.length} beacon room
            {beaconRooms.length === 1 ? '' : 's'}
          </span>
        </div>

        {beaconRooms.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dark/10 bg-dark/5 p-6 text-center text-sm text-black/75">
            No rooms have a BLE beacon ID configured yet.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-dark/10">
            <table className="min-w-full divide-y divide-dark/10 text-left">
              <thead className="bg-dark/5 text-xs uppercase tracking-[0.16em] text-black/55">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Beacon ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Occupancy</th>
                  <th className="px-4 py-3">Last Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark/10 bg-white/60 text-sm text-black">
                {beaconRooms.map((room) => (
                  <tr key={room.id}>
                    <td className="px-4 py-3 font-bold">{room.name}</td>
                    <td className="px-4 py-3">
                      {getRoomBleBeaconId(room) ?? 'Not configured'}
                    </td>
                    <td className="px-4 py-3">
                      <BleStatusBadge
                        status={occupancyData.connectionStatus}
                        label={formatBleLabel(occupancyData.connectionStatus)}
                      />
                    </td>
                    <td className="px-4 py-3">{occupancyData.occupancy}</td>
                    <td className="px-4 py-3">
                      {formatBleTimestamp(occupancyData.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-base font-bold text-black">BLE History Log</h4>
          <span className="text-xs text-black/60">
            Last {historyEntries.length} event
            {historyEntries.length === 1 ? '' : 's'}
          </span>
        </div>

        {isLoading ? (
          <div className="mt-3 rounded-xl border border-dark/10 bg-dark/5 p-6 text-center text-sm text-black/75">
            Loading BLE history...
          </div>
        ) : historyEntries.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dark/10 bg-dark/5 p-6 text-center text-sm text-black/75">
            {isHistoryCleared
              ? 'History was cleared from this view. Refresh to load the latest events again.'
              : 'No BLE events have been recorded yet.'}
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-dark/10">
            <table className="min-w-full divide-y divide-dark/10 text-left">
              <thead className="bg-dark/5 text-xs uppercase tracking-[0.16em] text-black/55">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Event Type</th>
                  <th className="px-4 py-3">Connection Status</th>
                  <th className="px-4 py-3">Occupancy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark/10 bg-white/60 text-sm text-black">
                {historyEntries.map((entry, index) => {
                  const rowTone = getBleHistoryTone(entry);

                  return (
                    <tr
                      key={`${entry.timestamp}-${entry.eventType}-${index}`}
                      className={getHistoryRowClassName(rowTone)}
                    >
                      <td className="px-4 py-3">
                        {formatBleTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <BleStatusBadge
                          status={entry.eventType}
                          label={formatBleLabel(entry.eventType)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <BleStatusBadge
                          status={entry.connectionStatus}
                          label={formatBleLabel(entry.connectionStatus)}
                        />
                      </td>
                      <td className="px-4 py-3">{entry.occupancy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
