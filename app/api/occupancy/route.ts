import { NextResponse } from "next/server";

import {
  DEFAULT_OCCUPANCY_PAYLOAD,
  parseOccupancyRecord,
  type OccupancyPayload,
} from "@/lib/occupancy/occupancy";
import { syncRoomBeaconTelemetry } from "@/lib/server/services/rooms";

export const dynamic = "force-dynamic";

const OCCUPANCY_HISTORY_LIMIT = 50;

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

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const nextRecord = parseOccupancyRecord(payload);

    occupancyData = trimOccupancyHistory({
      ...nextRecord,
      history: [nextRecord, ...occupancyData.history],
    });

    await syncRoomBeaconTelemetry({
      beaconId:
        typeof payload.beaconId === "string" ? payload.beaconId : undefined,
      connectionStatus: nextRecord.connectionStatus,
      roomId: typeof payload.roomId === "string" ? payload.roomId : undefined,
    });

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
      { status: 400 }
    );
  }
}

export async function GET() {
  return toNoStoreResponse(trimOccupancyHistory(occupancyData), { headers: { "x-occupancy-source": occupancyData.timestamp ? "memory" : "empty" } });
}
