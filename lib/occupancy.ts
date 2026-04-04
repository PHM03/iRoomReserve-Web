export interface OccupancyRecord {
  occupancy: number;
  timestamp: string;
  connectionStatus: string;
  eventType: string;
}

export interface OccupancyPayload extends OccupancyRecord {
  history: OccupancyRecord[];
}

export const DEFAULT_OCCUPANCY_PAYLOAD: OccupancyPayload = {
  occupancy: 0,
  timestamp: "",
  connectionStatus: "DISCONNECTED",
  eventType: "NONE",
  history: [],
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toUppercaseString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid occupancy payload: "${fieldName}" must be a string.`);
  }

  const normalizedValue = value.trim().toUpperCase();
  if (!normalizedValue) {
    throw new Error(`Invalid occupancy payload: "${fieldName}" is required.`);
  }

  return normalizedValue;
}

export function parseOccupancyRecord(value: unknown): OccupancyRecord {
  if (!isObject(value)) {
    throw new Error("Invalid occupancy payload: expected an object.");
  }

  if (typeof value.occupancy !== "number" || Number.isNaN(value.occupancy)) {
    throw new Error('Invalid occupancy payload: "occupancy" must be a number.');
  }

  if (typeof value.timestamp !== "string") {
    throw new Error('Invalid occupancy payload: "timestamp" must be a string.');
  }

  return {
    occupancy: value.occupancy,
    timestamp: value.timestamp,
    connectionStatus: toUppercaseString(
      value.connectionStatus,
      "connectionStatus"
    ),
    eventType: toUppercaseString(value.eventType, "eventType"),
  };
}

export function parseOccupancyPayload(value: unknown): OccupancyPayload {
  if (!isObject(value)) {
    throw new Error("Invalid occupancy payload: expected an object.");
  }

  const record = parseOccupancyRecord(value);
  const history = Array.isArray(value.history)
    ? value.history.map((entry) => parseOccupancyRecord(entry))
    : [];

  return {
    ...record,
    history,
  };
}

export function isOccupancyConnected(connectionStatus?: string | null) {
  return connectionStatus?.trim().toUpperCase() === "CONNECTED";
}
