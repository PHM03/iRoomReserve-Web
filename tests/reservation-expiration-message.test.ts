import { describe, expect, it } from "vitest";

import {
  MAX_EXPIRATION_MESSAGE_LENGTH,
  normalizeExpirationMessage,
} from "../lib/reservations/expiration-message";

describe("reservation expiration messages", () => {
  it("requires a non-empty trimmed message", () => {
    expect(normalizeExpirationMessage("   ")).toBeNull();
    expect(normalizeExpirationMessage("  Please accept my apology.  ")).toBe(
      "Please accept my apology."
    );
  });

  it("enforces the maximum message length", () => {
    expect(normalizeExpirationMessage("x".repeat(MAX_EXPIRATION_MESSAGE_LENGTH))).toHaveLength(
      MAX_EXPIRATION_MESSAGE_LENGTH
    );
    expect(normalizeExpirationMessage("x".repeat(MAX_EXPIRATION_MESSAGE_LENGTH + 1))).toBeNull();
  });
});
