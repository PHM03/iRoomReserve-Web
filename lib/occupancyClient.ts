'use client';

import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  parseOccupancyPayload,
  type OccupancyPayload,
} from '@/lib/occupancy';

const OCCUPANCY_CLIENT_CACHE_WINDOW_MS = 5 * 60 * 1000;

let cachedPayload: OccupancyPayload | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<OccupancyPayload> | null = null;

function getResponseMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return payload.message;
  }

  return 'Unable to load BLE beacon data right now.';
}

async function requestOccupancySnapshot() {
  const response = await fetch('/api/occupancy', {
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  const nextPayload = payload
    ? parseOccupancyPayload(payload)
    : DEFAULT_OCCUPANCY_PAYLOAD;

  if (!response.ok) {
    throw new Error(getResponseMessage(payload));
  }

  cachedPayload = nextPayload;
  cachedAt = Date.now();

  return nextPayload;
}

export async function fetchOccupancySnapshot(options?: { force?: boolean }) {
  const force = options?.force ?? false;
  const now = Date.now();

  if (
    !force &&
    cachedPayload &&
    now - cachedAt < OCCUPANCY_CLIENT_CACHE_WINDOW_MS
  ) {
    return cachedPayload;
  }

  if (!force && inFlightRequest) {
    return inFlightRequest;
  }

  inFlightRequest = requestOccupancySnapshot().finally(() => {
    inFlightRequest = null;
  });

  return inFlightRequest;
}
