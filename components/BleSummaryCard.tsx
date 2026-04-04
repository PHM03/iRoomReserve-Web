'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import BleStatusBadge from '@/components/BleStatusBadge';
import {
  BLE_MONITOR_REFRESH_INTERVAL_MS,
  formatBleLabel,
  formatBleTimestamp,
  isBeaconHardwareOnline,
} from '@/lib/bleMonitor';
import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  type OccupancyPayload,
} from '@/lib/occupancy';
import { fetchOccupancySnapshot } from '@/lib/occupancyClient';

interface BleSummaryCardProps {
  buildingName?: string;
  className?: string;
  pollIntervalMs?: number;
  detailsHref?: string;
  onViewDetails?: () => void;
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

export default function BleSummaryCard({
  buildingName,
  className = '',
  pollIntervalMs = BLE_MONITOR_REFRESH_INTERVAL_MS,
  detailsHref = '/dashboard/room-status',
  onViewDetails,
}: BleSummaryCardProps) {
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

  const hardwareOnline = isBeaconHardwareOnline(occupancyData.timestamp);

  const refreshCard = useCallback(
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
    void refreshCard('initial');
  }, [refreshCard]);

  useEffect(() => {
    const scheduleNextRefresh = () => {
      setNextRefreshAt(Date.now() + pollIntervalMs);
    };

    scheduleNextRefresh();

    const intervalId = window.setInterval(() => {
      void refreshCard('background');
      scheduleNextRefresh();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, refreshCard, refreshScheduleVersion]);

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
    void refreshCard('manual');
    setRefreshScheduleVersion((currentValue) => currentValue + 1);
  }, [refreshCard]);

  const viewDetailsControl = onViewDetails ? (
    <button
      type="button"
      onClick={onViewDetails}
      className="text-sm font-bold text-primary hover:text-primary-hover transition-colors"
    >
      View Details
    </button>
  ) : (
    <Link
      href={detailsHref}
      className="text-sm font-bold text-primary hover:text-primary-hover transition-colors"
    >
      View Details
    </Link>
  );

  return (
    <section className={`glass-card p-5 ${className}`.trim()}>
      <div className="flex flex-col gap-4 border-b border-dark/10 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-black">BLE Beacon Summary</h3>
            {viewDetailsControl}
          </div>
          <p className="mt-1 text-sm text-black/75">
            Quick ESP32 beacon snapshot for{' '}
            <span className="font-bold ui-text-teal">
              {buildingName ?? 'the active building'}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="text-xs text-black/70 space-y-1">
            <p>Last refreshed: {formatRefreshTime(lastRefreshedAt)}</p>
            <p>
              Next refresh in {formatRefreshCountdown(millisecondsUntilRefresh)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="ui-button-gray rounded-xl px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-xl border border-dark/10 bg-dark/5 px-4 py-3 text-sm text-black/70">
          Loading BLE beacon summary...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-dark/10 bg-dark/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">
            Hardware
          </p>
          <div className="mt-3">
            <BleStatusBadge
              status={hardwareOnline ? 'ONLINE' : 'OFFLINE'}
              label={hardwareOnline ? 'Online' : 'Offline'}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-dark/10 bg-dark/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">
            Connection
          </p>
          <div className="mt-3">
            <BleStatusBadge
              status={occupancyData.connectionStatus}
              label={formatBleLabel(occupancyData.connectionStatus)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-dark/10 bg-dark/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">
            Occupancy
          </p>
          <p className="mt-3 text-2xl font-bold text-black">
            {occupancyData.occupancy}
          </p>
        </div>

        <div className="rounded-2xl border border-dark/10 bg-dark/5 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">
            Last Updated
          </p>
          <p className="mt-3 text-sm font-medium text-black/75">
            {formatBleTimestamp(occupancyData.timestamp)}
          </p>
        </div>
      </div>
    </section>
  );
}
