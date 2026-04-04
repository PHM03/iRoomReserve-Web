'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  BLE_MONITOR_REFRESH_INTERVAL_MS,
  formatBleLabel,
  formatBleTimestamp,
  getRoomBleBeaconId,
} from '@/lib/bleMonitor';
import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  isOccupancyConnected,
  type OccupancyPayload,
} from '@/lib/occupancy';
import { fetchOccupancySnapshot } from '@/lib/occupancyClient';
import { type Reservation } from '@/lib/reservations';
import { type Room } from '@/lib/rooms';
import { isReservationActiveTimeSlot } from '@/lib/roomStatus';

interface BleStatusProps {
  reservation: Pick<
    Reservation,
    'id' | 'userId' | 'roomName' | 'date' | 'startTime' | 'endTime' | 'status'
  >;
  room?: Pick<Room, 'beaconId' | 'bleBeaconId' | 'name'> | null;
  className?: string;
  pollIntervalMs?: number;
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

function getBluetoothSettingsUrl(userAgent: string) {
  if (/android/i.test(userAgent)) {
    return 'intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end';
  }

  if (/(iPhone|iPad|iPod)/i.test(userAgent)) {
    return 'App-Prefs:root=Bluetooth';
  }

  return null;
}

function tryOpenBluetoothSettings() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const settingsUrl = getBluetoothSettingsUrl(navigator.userAgent);
  if (!settingsUrl) {
    return false;
  }

  window.location.href = settingsUrl;
  return true;
}

export default function BleStatus({
  reservation,
  room,
  className = '',
  pollIntervalMs = BLE_MONITOR_REFRESH_INTERVAL_MS,
}: BleStatusProps) {
  const { firebaseUser, loading } = useAuth();
  const [occupancyStatus, setOccupancyStatus] = useState<OccupancyPayload>(
    DEFAULT_OCCUPANCY_PAYLOAD
  );
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [millisecondsUntilRefresh, setMillisecondsUntilRefresh] = useState(
    pollIntervalMs
  );
  const [refreshScheduleVersion, setRefreshScheduleVersion] = useState(0);

  const isOwner = firebaseUser?.uid === reservation.userId;
  const isActiveSlot = isReservationActiveTimeSlot(reservation);
  const beaconId = getRoomBleBeaconId(room);
  const hasBeaconId = Boolean(beaconId);
  const beaconName = beaconId || 'HC-05 / ZS-040';
  const shouldRender = !loading && isOwner && isActiveSlot;

  const loadOccupancyStatus = useCallback(
    async (mode: 'initial' | 'manual' | 'background' = 'initial') => {
      if (!shouldRender || !hasBeaconId) {
        return;
      }

      if (mode === 'initial') {
        setIsLoadingStatus(true);
      }

      if (mode === 'manual') {
        setIsRefreshingStatus(true);
      }

      try {
        const nextOccupancyStatus = await fetchOccupancySnapshot({
          force: mode === 'manual',
        });
        setOccupancyStatus(nextOccupancyStatus);
        setStatusError(null);
        setLastRefreshedAt(new Date());
      } catch (error) {
        setStatusError(
          error instanceof Error
            ? error.message
            : 'Unable to load the BLE status right now.'
        );
      } finally {
        if (mode === 'initial') {
          setIsLoadingStatus(false);
        }

        if (mode === 'manual') {
          setIsRefreshingStatus(false);
        }
      }
    },
    [hasBeaconId, shouldRender]
  );

  useEffect(() => {
    if (!shouldRender || !hasBeaconId) {
      setIsLoadingStatus(false);
      setNextRefreshAt(null);
      setMillisecondsUntilRefresh(0);
      return;
    }

    void loadOccupancyStatus('initial');
  }, [hasBeaconId, loadOccupancyStatus, shouldRender]);

  useEffect(() => {
    if (!shouldRender || !hasBeaconId) {
      setNextRefreshAt(null);
      return;
    }

    const scheduleNextRefresh = () => {
      setNextRefreshAt(Date.now() + pollIntervalMs);
    };

    scheduleNextRefresh();

    const intervalId = window.setInterval(() => {
      void loadOccupancyStatus('background');
      scheduleNextRefresh();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    hasBeaconId,
    loadOccupancyStatus,
    pollIntervalMs,
    refreshScheduleVersion,
    shouldRender,
  ]);

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

  if (!shouldRender) {
    return null;
  }

  const isConnected = isOccupancyConnected(occupancyStatus.connectionStatus);

  const handleManualRefresh = () => {
    void loadOccupancyStatus('manual');
    setRefreshScheduleVersion((currentValue) => currentValue + 1);
  };

  const handleConnectClick = () => {
    setShowGuide(true);

    const openedSettings = tryOpenBluetoothSettings();
    setSettingsMessage(
      openedSettings
        ? 'Trying to open your Bluetooth settings now. If your browser stays on this page, follow the steps below manually.'
        : 'Your browser may not support opening Bluetooth settings directly. Follow the steps below manually.'
    );
  };

  return (
    <section
      className={`rounded-xl border border-dark/10 bg-white/70 p-4 shadow-sm ${className}`.trim()}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/55">
            BLE Beacon
          </p>
          <h4 className="mt-1 text-sm font-bold text-black">
            Bluetooth access for {room?.name ?? reservation.roomName}
          </h4>
          <p className="mt-1 text-xs text-black/70">
            Available only during your active slot: {reservation.startTime} -{' '}
            {reservation.endTime}
          </p>
        </div>

        <button
          type="button"
          onClick={handleConnectClick}
          disabled={!hasBeaconId}
          className="ui-button-orange rounded-xl px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Connect to BLE Beacon
        </button>
      </div>

      {!hasBeaconId ? (
        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          No BLE beacon ID is configured for this room yet.
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dark/10 bg-dark/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/45">
                Live Status
              </p>
              <p className="mt-1 text-sm font-bold text-black">
                {isLoadingStatus && !occupancyStatus.timestamp
                  ? 'Checking BLE status...'
                  : isConnected
                    ? '🟢 Connected'
                    : '🔴 Disconnected'}
              </p>
              <p className="mt-1 text-xs text-black/70">
                Beacon: <span className="font-bold">{beaconName}</span>
              </p>
            </div>

            <div className="text-xs text-black/70 sm:text-right">
              <p>Event: {formatBleLabel(occupancyStatus.eventType)}</p>
              <p className="mt-1">
                Updated: {formatBleTimestamp(occupancyStatus.timestamp)}
              </p>
            </div>
          </div>

          {statusError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {statusError}
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-3 border-t border-dark/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-black/70 space-y-1">
              <p>Last refreshed: {formatRefreshTime(lastRefreshedAt)}</p>
              <p>
                Next refresh in {formatRefreshCountdown(millisecondsUntilRefresh)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshingStatus}
              className="ui-button-gray rounded-xl px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefreshingStatus ? 'Refreshing...' : 'Refresh Status'}
            </button>
          </div>
        </div>
      )}

      {showGuide ? (
        <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h5 className="text-sm font-bold text-black">How to connect</h5>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="text-xs font-bold text-primary hover:underline"
            >
              Hide
            </button>
          </div>

          {settingsMessage ? (
            <p className="mt-2 text-xs text-black/70">{settingsMessage}</p>
          ) : null}

          <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-black/80">
            <li>Open your phone&apos;s Bluetooth settings.</li>
            <li>Pair with the room beacon named {beaconName}.</li>
            <li>Return to iRoomReserve and wait for the live status to refresh.</li>
          </ol>

          <button
            type="button"
            onClick={handleConnectClick}
            className="ui-button-gray mt-4 rounded-xl px-3 py-2 text-xs font-bold"
          >
            Open Bluetooth Settings Again
          </button>
        </div>
      ) : null}
    </section>
  );
}
