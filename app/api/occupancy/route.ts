import { NextResponse } from "next/server";

import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  parseOccupancyPayload,
  parseOccupancyRecord,
  type OccupancyPayload,
} from "@/lib/occupancy";

export const dynamic = "force-dynamic";

const ESP32_OCCUPANCY_API_URL =
  process.env.ESP32_OCCUPANCY_API_URL?.trim() ||
  "http://192.168.100.165:3000/api/occupancy";
const OCCUPANCY_HISTORY_LIMIT = 50;
const OCCUPANCY_FETCH_TIMEOUT_MS = 4_000;

let occupancyData: OccupancyPayload = {
  ...DEFAULT_OCCUPANCY_PAYLOAD,
  history: [],
};

function toNoStoreResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function trimOccupancyHistory(payload: OccupancyPayload): OccupancyPayload {
  return {
    ...payload,
    history: payload.history.slice(0, OCCUPANCY_HISTORY_LIMIT),
  };
}

async function fetchRemoteOccupancy() {
  const response = await fetch(ESP32_OCCUPANCY_API_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(OCCUPANCY_FETCH_TIMEOUT_MS),
  });
  const payload = parseOccupancyPayload(await response.json());

  if (!response.ok) {
    throw new Error(`ESP32 API returned ${response.status}.`);
  }

  return trimOccupancyHistory(payload);
}

export async function POST(request: Request) {
  try {
    const nextRecord = parseOccupancyRecord(await request.json());

    occupancyData = {
      ...nextRecord,
      history: [nextRecord, ...occupancyData.history].slice(
        0,
        OCCUPANCY_HISTORY_LIMIT
      ),
    };

    return toNoStoreResponse({
      success: true,
      message: "Occupancy data received.",
    });
  } catch (error) {
    return toNoStoreResponse(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Invalid occupancy payload.",
      },
      {
        status: 400
      }
    );
  }
}

export async function GET() {
  try {
    occupancyData = await fetchRemoteOccupancy();

    return toNoStoreResponse(occupancyData, {
      headers: {
        "x-occupancy-source": "esp32"
      },
    });
  } catch (error) {
    if (occupancyData.timestamp) {
      return toNoStoreResponse(
        {
          ...occupancyData,
          message:
            error instanceof Error
              ? error.message
              : "Unable to refresh the latest ESP32 occupancy data.",
          stale: true,
        },
        {
          headers: {
            "x-occupancy-source": "cache"
          },
        }
      );
    }

    return toNoStoreResponse(
      {
        ...DEFAULT_OCCUPANCY_PAYLOAD,
        message:
          error instanceof Error
            ? error.message
            : "Unable to load ESP32 occupancy data.",
      },
      {
        status: 503,
        headers: {
          "x-occupancy-source": "unavailable"
        },
      }
    );
  }
}
