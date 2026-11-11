import { describe, expect, it } from "vitest";

import { sanitizeRoomReservation } from "../lib/reservations/roomAvailabilitySnapshot";

describe("sanitizeRoomReservation", () => {
  it("returns only schedule fields and a current-user flag", () => {
    const result = sanitizeRoomReservation({
      buildingId: "gd1",
      date: "2026-11-20",
      endTime: "10:00",
      checkedInAt: { seconds: 1 },
      occupancyReleasedAt: null,
      purpose: "Private purpose",
      roomId: "room-1",
      roomName: "Room 1",
      startTime: "09:00",
      status: "approved",
      userId: "user-1",
      userName: "Private name",
      userEmail: "private@example.com",
    }, "user-1");

    expect(result).toEqual({
      id: "room-1_2026-11-20_09:00_approved",
      buildingId: "gd1",
      date: "2026-11-20",
      endTime: "10:00",
      hasActiveCheckIn: true,
      isCurrentUser: true,
      roomId: "room-1",
      roomName: "Room 1",
      startTime: "09:00",
      status: "approved",
    });
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("userName");
    expect(result).not.toHaveProperty("userEmail");
    expect(result).not.toHaveProperty("purpose");
  });

  it("rejects statuses or intervals outside the schedule contract", () => {
    expect(sanitizeRoomReservation({
      roomId: "room-1",
      date: "2026-11-20",
      startTime: "09:00",
      endTime: "10:00",
      status: "cancelled",
    }, "user-1")).toBeNull();

    expect(sanitizeRoomReservation({
      roomId: "room-1",
      date: "2026-11-20",
      startTime: "09:00",
      status: "approved",
    }, "user-1")).toBeNull();
  });
});
