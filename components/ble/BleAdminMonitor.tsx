'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AdminFloorFilter from '@/components/admin/AdminFloorFilter';
import BleStatusBadge from '@/components/ui/BleStatusBadge';
import {
  getPreferredDefaultFloorValue,
  sortFloorOptions,
} from '@/lib/buildings/floorLabels';
import { formatClockTime } from '@/lib/utils/dateTime';
import {
  BLE_MONITOR_REFRESH_INTERVAL_MS,
  formatBleLabel,
  formatBleTimestamp,
  getBeaconConfiguredRooms,
  getBleHistoryTone,
  getRoomBleBeaconId,
  isBeaconHardwareOnline,
} from '@/lib/occupancy/bleMonitor';
import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  type OccupancyPayload,
} from '@/lib/occupancy/occupancy';
import { fetchOccupancySnapshot } from '@/lib/occupancy/occupancyClient';
import { type Room } from '@/lib/rooms/rooms';
import { type Reservation } from '@/lib/reservations/reservations';
import { isReservationActiveTimeSlot } from '@/lib/rooms/roomStatus';

interface BleAdminMonitorProps {
  buildingName?: string;
  reservations: Reservation[];
  rooms: Pick<
    Room,
    'id' | 'name' | 'floor' | 'beaconId' | 'bleBeaconId'
  >[];
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

  return formatClockTime(value, { includeSeconds: true });
}

function formatRefreshCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getReservationStatus(
  roomId: string,
  reservations: Reservation[],
  connectionStatus: string
) {
  const hasOngoingReservation = reservations.some(
    (reservation) =>
      reservation.roomId === roomId && isReservationActiveTimeSlot(reservation)
  );

  if (!hasOngoingReservation) {
    return {
      label: 'Vacant',
      status: 'VACANT',
    } as const;
  }

  const normalizedConnectionStatus = connectionStatus.trim().toUpperCase();
  return {
    label: normalizedConnectionStatus === 'CONNECTED' ? 'Connected' : 'Disconnected',
    status:
      normalizedConnectionStatus === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
  } as const;
}

export default function BleAdminMonitor({
  reservations,
  rooms,
  className = '',
  pollIntervalMs = BLE_MONITOR_REFRESH_INTERVAL_MS,
}: Readonly<BleAdminMonitorProps>) {
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
  const [floorFilter, setFloorFilter] = useState('');

  const beaconRooms = getBeaconConfiguredRooms(rooms);
  const floorOptions = useMemo(
    () =>
      [
        ...sortFloorOptions(
          Array.from(new Set(beaconRooms.map((room) => room.floor)))
            .filter(Boolean)
            .map((floor) => ({
              value: floor,
              label: floor,
            }))
        ),
        { value: 'All', label: 'All' },
      ],
    [beaconRooms]
  );
  const filteredBeaconRooms = useMemo(
    () =>
      floorFilter === 'All'
        ? beaconRooms
        : beaconRooms.filter((room) => room.floor === floorFilter),
    [beaconRooms, floorFilter]
  );
  const hardwareOnline = isBeaconHardwareOnline(occupancyData.timestamp);

  useEffect(() => {
    if (floorOptions.length === 0) {
      return;
    }

    if (!floorFilter) {
      setFloorFilter(getPreferredDefaultFloorValue(floorOptions));
      return;
    }

    if (floorFilter === 'All') {
      return;
    }

    const hasMatchingFloor = floorOptions.some(
      (option) => option.value === floorFilter
    );

    if (!hasMatchingFloor) {
      setFloorFilter(getPreferredDefaultFloorValue(floorOptions));
    }
  }, [floorFilter, floorOptions]);

  const refreshMonitor = useCallback(
    async (mode: 'initial' | 'manual' | 'background' = 'initial') => {
      if (mode === 'initial') {
        setIsLoading(true);
      }

      if (mode === 'manual') {
        setIsRefreshing(true);
      }

      try {
        const nextOccupancyData = await fetchOccupancySnapshot({ force: mode === 'manual' });
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

        <AdminFloorFilter
          label="Filter by Floor:"
          options={floorOptions}
          value={floorFilter}
          onChange={setFloorFilter}
          disabled={beaconRooms.length === 0}
          className="lg:justify-end"
        />
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

      <div className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-base font-bold text-black">Live Connection Status</h4>
          <span className="text-xs text-black/60">
            {filteredBeaconRooms.length} of {beaconRooms.length} beacon room
            {beaconRooms.length === 1 ? '' : 's'}
          </span>
        </div>

        {beaconRooms.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dark/10 bg-dark/5 p-6 text-center text-sm text-black/75">
            No rooms have a BLE beacon ID configured yet.
          </div>
        ) : filteredBeaconRooms.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dark/10 bg-dark/5 p-6 text-center text-sm text-black/75">
            No beacon rooms match the selected floor.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-dark/10">
            <table className="min-w-full divide-y divide-dark/10 text-left">
              <thead className="bg-dark/5 text-xs uppercase tracking-[0.16em] text-black/55">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Floor</th>
                  <th className="px-4 py-3">Beacon ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reservation Status</th>
                  <th className="px-4 py-3">Last Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark/10 bg-white/60 text-sm text-black">
                {filteredBeaconRooms.map((room) => {
                  const reservationStatus = getReservationStatus(
                    room.id,
                    reservations,
                    occupancyData.connectionStatus
                  );

                  return (
                    <tr key={room.id}>
                      <td className="px-4 py-3 font-bold">{room.name}</td>
                      <td className="px-4 py-3">{room.floor}</td>
                      <td className="px-4 py-3">
                        {getRoomBleBeaconId(room) ?? 'Not configured'}
                      </td>
                      <td className="px-4 py-3">
                        <BleStatusBadge
                          status={hardwareOnline ? 'ONLINE' : 'OFFLINE'}
                          label={hardwareOnline ? 'Online' : 'Offline'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <BleStatusBadge
                          status={reservationStatus.status}
                          label={reservationStatus.label}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {formatBleTimestamp(occupancyData.timestamp)}
                      </td>
                    </tr>
                  );
                })}
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
