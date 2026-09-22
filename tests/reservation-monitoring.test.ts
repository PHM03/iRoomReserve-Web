import { describe, expect, it } from "vitest";

import {
  formatManilaDate,
  getManilaDateKey,
  getMonitoringDayOffset,
  getReservationDayOffset,
  isPendingReservationDueForExpiration,
} from "../lib/reservations/reservation-monitoring";

describe("reservation monitoring dates", () => {
  const beforeMidnightInManila = new Date("2026-09-20T15:59:00.000Z");
  const afterMidnightInManila = new Date("2026-09-20T16:01:00.000Z");

  it("uses the Manila calendar date at the day boundary", () => {
    expect(getManilaDateKey(beforeMidnightInManila)).toBe("2026-09-20");
    expect(getManilaDateKey(afterMidnightInManila)).toBe("2026-09-21");
  });

  it.each([
    ["2026-09-23", 3],
    ["2026-09-22", 2],
    ["2026-09-21", 1],
  ])("recognizes the %s monitoring window", (reservationDate, expectedOffset) => {
    expect(getMonitoringDayOffset(reservationDate, beforeMidnightInManila)).toBe(
      expectedOffset
    );
  });

  it("does not expire a pending request before its reservation date", () => {
    expect(getReservationDayOffset("2026-09-21", beforeMidnightInManila)).toBe(1);
    expect(isPendingReservationDueForExpiration("2026-09-21", beforeMidnightInManila)).toBe(false);
  });

  it("expires at the start of the reservation date in Manila", () => {
    expect(getReservationDayOffset("2026-09-21", afterMidnightInManila)).toBe(0);
    expect(isPendingReservationDueForExpiration("2026-09-21", afterMidnightInManila)).toBe(true);
  });

  it("formats recorded expiration timestamps in Manila", () => {
    expect(formatManilaDate({ seconds: Date.parse("2026-09-23T16:00:00Z") / 1000 })).toBe(
      "September 24, 2026"
    );
  });
});
