import { describe, expect, it } from "vitest";

import {
  buildUserGenderUpdate,
  normalizeUserGender,
  USER_GENDER_VALUES,
} from "../lib/auth/profile-types";

describe("optional profile gender", () => {
  it("accepts every supported value used by profile saving", () => {
    expect(USER_GENDER_VALUES).toEqual([
      "male",
      "female",
      "non_binary",
      "prefer_not_to_say",
    ]);

    USER_GENDER_VALUES.forEach((gender) => {
      expect(normalizeUserGender(gender)).toBe(gender);
    });
  });

  it("treats missing, blank, and invalid values as unspecified", () => {
    expect(normalizeUserGender(undefined)).toBeNull();
    expect(normalizeUserGender(null)).toBeNull();
    expect(normalizeUserGender(" ")).toBeNull();
    expect(normalizeUserGender("unknown")).toBeNull();
  });

  it("builds save and clear updates for Account Settings", () => {
    expect(buildUserGenderUpdate("female", "server-timestamp")).toEqual({
      gender: "female",
      updatedAt: "server-timestamp",
    });
    expect(buildUserGenderUpdate(null, "server-timestamp")).toEqual({
      gender: null,
      updatedAt: "server-timestamp",
    });
  });
});
