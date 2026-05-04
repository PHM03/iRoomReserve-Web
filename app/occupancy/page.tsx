"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchOccupancySnapshot } from "@/lib/occupancyClient";
import { formatBleTimestamp } from "@/lib/bleMonitor";
import { formatClockTime } from "@/lib/dateTime";

const AUTO_REFRESH_INTERVAL_MS = 600000;

interface OccupancyRecord {
  occupancy: number;
  timestamp: string;
  connectionStatus: string;
  eventType: string;
}

interface OccupancyData extends OccupancyRecord {
  history: OccupancyRecord[];
}

const defaultData: OccupancyData = {
  occupancy: 0,
  timestamp: "",
  connectionStatus: "DISCONNECTED",
  eventType: "NONE",
  history: [],
};

function formatRefreshTime(value: Date | null) {
  if (!value) {
    return "Not refreshed yet";
  }

  return formatClockTime(value, { includeSeconds: true });
}

function formatRefreshCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function OccupancyPage() {
  const [data, setData] = useState<OccupancyData>(defaultData);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [millisecondsUntilRefresh, setMillisecondsUntilRefresh] = useState(
    AUTO_REFRESH_INTERVAL_MS
  );
  const [refreshScheduleVersion, setRefreshScheduleVersion] = useState(0);

  const fetchData = useCallback(
    async (mode: "initial" | "manual" | "background" = "initial") => {
      if (mode === "manual") {
        setIsRefreshing(true);
      }

      try {
        const json = (await fetchOccupancySnapshot({
          force: mode === "manual",
        })) as OccupancyData;
        setData(json);
        setError(null);
        setLastRefreshedAt(new Date());
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Cannot reach server - check Next.js is running"
        );
      } finally {
        if (mode === "manual") {
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void fetchData("initial");
  }, [fetchData]);

  useEffect(() => {
    const scheduleNextRefresh = () => {
      setNextRefreshAt(Date.now() + AUTO_REFRESH_INTERVAL_MS);
    };

    scheduleNextRefresh();

    const interval = window.setInterval(() => {
      void fetchData("background");
      scheduleNextRefresh();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [fetchData, refreshScheduleVersion]);

  useEffect(() => {
    if (nextRefreshAt === null) {
      setMillisecondsUntilRefresh(0);
      return;
    }

    const updateCountdown = () => {
      setMillisecondsUntilRefresh(Math.max(0, nextRefreshAt - Date.now()));
    };

    updateCountdown();

    const countdownInterval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(countdownInterval);
  }, [nextRefreshAt]);

  const handleManualRefresh = () => {
    void fetchData("manual");
    setRefreshScheduleVersion((currentValue) => currentValue + 1);
  };

  const isConnected = data.connectionStatus === "CONNECTED";

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>Occupancy Dashboard</h1>
          <p style={{ marginTop: "0.5rem", color: "#555" }}>
            Last refreshed: {formatRefreshTime(lastRefreshedAt)}
          </p>
          <p style={{ marginTop: "0.25rem", color: "#555" }}>
            Next refresh in {formatRefreshCountdown(millisecondsUntilRefresh)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.75rem",
            border: "1px solid #d1d5db",
            background: "#f3f4f6",
            fontWeight: 700,
            cursor: isRefreshing ? "not-allowed" : "pointer",
            opacity: isRefreshing ? 0.6 : 1,
          }}
        >
          {isRefreshing ? "Refreshing..." : "Refresh Now"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "1rem",
            background: "#fff3cd",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}
        >
          Warning: {error}
        </div>
      )}

      <div
        style={{
          padding: "1.5rem",
          background: isConnected ? "#d4edda" : "#f8d7da",
          borderRadius: "8px",
          marginBottom: "1rem",
        }}
      >
        <h2>Current Occupancy: {data.occupancy}</h2>
        <p>
          Connection: <strong>{data.connectionStatus}</strong>
        </p>
        <p>
          Last Event: <strong>{data.eventType}</strong>
        </p>
        <p>Last Update: {formatBleTimestamp(data.timestamp)}</p>
      </div>

      <h2>Connection History</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={{ padding: "8px", border: "1px solid #ddd" }}>Time</th>
            <th style={{ padding: "8px", border: "1px solid #ddd" }}>
              Connection
            </th>
            <th style={{ padding: "8px", border: "1px solid #ddd" }}>Event</th>
            <th style={{ padding: "8px", border: "1px solid #ddd" }}>
              Occupancy
            </th>
          </tr>
        </thead>
        <tbody>
          {data.history.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: "1rem",
                  textAlign: "center",
                  color: "#888",
                }}
              >
                No history yet - waiting for ESP32 data
              </td>
            </tr>
          ) : (
            data.history.map((item, index) => (
              <tr
                key={index}
                style={{
                  background:
                    item.connectionStatus === "CONNECTED"
                      ? "#f0fff0"
                      : "#fff0f0",
                }}
              >
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {formatBleTimestamp(item.timestamp)}
                </td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {item.connectionStatus}
                </td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {item.eventType}
                </td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {item.occupancy}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
