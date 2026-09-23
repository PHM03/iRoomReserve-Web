import { describe, expect, it } from "vitest";

import {
  buildAdministrativeRoomConditionUpdate,
  getCurrentRoomReservation,
  isRoomScheduleActive,
  isRoomAdministrativelyUnavailable,
  preserveAdministrativeUnavailableStatus,
  resolveRoomOperationalState,
  resolveRoomStatus,
} from "../lib/rooms/roomStatus";

describe("room status helpers", () => {
  it("recognizes unavailable as an administrative room condition", () => {
    expect(isRoomAdministrativelyUnavailable("Unavailable")).toBe(true);
    expect(isRoomAdministrativelyUnavailable("Available")).toBe(false);
    expect(isRoomAdministrativelyUnavailable("Reserved")).toBe(false);
    expect(isRoomAdministrativelyUnavailable("Occupied")).toBe(false);
  });

  it("preserves administrative unavailable during lifecycle payload writes", () => {
    const payload = preserveAdministrativeUnavailableStatus("Unavailable", {
      status: "Available" as const,
      activeReservationId: null,
      checkedInAt: null,
    });

    expect(payload).toEqual({
      activeReservationId: null,
      checkedInAt: null,
    });
  });

  it("allows operational status updates when the room is administratively available", () => {
    const payload = preserveAdministrativeUnavailableStatus("Available", {
      status: "Reserved" as const,
      activeReservationId: "reservation-1",
    });

    expect(payload).toEqual({
      status: "Reserved",
      activeReservationId: "reservation-1",
    });
  });

  it("builds an administrative status patch without BLE telemetry fields", () => {
    const patch = buildAdministrativeRoomConditionUpdate(
      "Unavailable",
      "Maintenance"
    );
    expect(patch).toEqual({
      status: "Unavailable",
      unavailableReason: "Maintenance",
    });
    expect(patch).not.toHaveProperty("beaconConnected");
    expect(patch).not.toHaveProperty("beaconDeviceName");
  });

  it("keeps unavailable authoritative in effective room status resolution", () => {
    const resolved = resolveRoomStatus(
      {
        id: "room-1",
        status: "Unavailable",
        activeReservationId: "reservation-1",
      },
      [
        {
          id: "reservation-1",
          roomId: "room-1",
          userName: "Jane Doe",
          date: "2026-09-23",
          startTime: "08:00",
          endTime: "10:00",
          status: "approved",
        },
      ]
    );

    expect(resolved.status).toBe("Unavailable");
    expect(resolved.reservation?.id).toBe("reservation-1");
  });

  describe("current room reservation selection", () => {
    const now = new Date("2026-09-23T02:30:00.000Z"); // 10:30 in Manila
    const room = { id: "room-1", status: "Available" };
    const checkedInAt = {
      seconds: 1,
      nanoseconds: 0,
      toDate: () => new Date(1_000),
      toMillis: () => 1_000,
    };
    const reservation = (overrides: Record<string, unknown> = {}) => ({
      id: "reservation-1",
      roomId: "room-1",
      date: "2026-09-23",
      startTime: "10:00",
      endTime: "11:00",
      status: "approved",
      ...overrides,
    });

    it("selects an approved reservation only while its slot is active", () => {
      expect(getCurrentRoomReservation(room, [reservation()], now)?.id).toBe("reservation-1");
      expect(
        getCurrentRoomReservation(
          room,
          [reservation({ startTime: "11:00", endTime: "12:00" })],
          now
        )
      ).toBeNull();
    });

    it("does not show completed reservations as current, even when occupancy is unreleased", () => {
      expect(
        getCurrentRoomReservation(
          { ...room, activeReservationId: "reservation-1" },
          [reservation({ status: "completed", checkedInAt })],
          now
        )
      ).toBeNull();
    });

    it("keeps an unreleased checked-in approved reservation relevant after its time slot", () => {
      const checkedIn = reservation({
        date: "2026-09-22",
        checkedInAt,
      });
      expect(getCurrentRoomReservation(room, [checkedIn], now)?.id).toBe("reservation-1");
    });

    it("does not let a stale activeReservationId select a future reservation", () => {
      const future = reservation({ startTime: "11:00", endTime: "12:00" });
      expect(
        getCurrentRoomReservation(
          { ...room, activeReservationId: "reservation-1" },
          [future],
          now
        )
      ).toBeNull();
    });

    it.each(["pending", "cancelled", "expired"]) (
      "excludes %s reservations",
      (status) => {
        expect(getCurrentRoomReservation(room, [reservation({ status })], now)).toBeNull();
      }
    );
  });

  it("evaluates class schedules in the application timezone and changes at the boundary", () => {
    const schedule = { dayOfWeek: 3, startTime: "08:00", endTime: "09:00" };
    expect(isRoomScheduleActive(schedule, new Date("2026-09-23T00:59:00.000Z"))).toBe(true);
    expect(isRoomScheduleActive(schedule, new Date("2026-09-23T01:00:00.000Z"))).toBe(false);
  });

  it("recalculates operational activity when an approved reservation crosses its time boundary", () => {
    const room = { id: "room-1", status: "Available" };
    const reservation = {
      id: "reservation-1",
      roomId: "room-1",
      date: "2026-09-23",
      startTime: "10:00",
      endTime: "11:00",
      status: "approved",
    };
    expect(
      resolveRoomOperationalState(room, [reservation], {
        now: new Date("2026-09-23T01:59:00.000Z"), // 09:59 in Manila
      }).activity
    ).toBe("Available");
    expect(
      resolveRoomOperationalState(room, [reservation], {
        now: new Date("2026-09-23T02:00:00.000Z"), // 10:00 in Manila
      }).activity
    ).toBe("Reserved");
  });

  it("keeps the administrative condition authoritative over checked-in activity", () => {
    const state = resolveRoomOperationalState(
      { id: "room-1", status: "Unavailable" },
      [
        {
          id: "reservation-1",
          roomId: "room-1",
          date: "2026-09-23",
          startTime: "10:00",
          endTime: "11:00",
          status: "approved",
          checkedInAt: {
            seconds: 1,
            nanoseconds: 0,
            toDate: () => new Date(1_000),
            toMillis: () => 1_000,
            valueOf: () => "1",
          },
        },
      ],
      { now: new Date("2026-09-23T02:30:00.000Z") }
    );
    expect(state.condition).toBe("Unavailable");
    expect(state.activity).toBe("Administratively unavailable");
  });
});
