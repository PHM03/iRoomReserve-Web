export const USER_GENDER_VALUES = [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
] as const;

export type UserGender = (typeof USER_GENDER_VALUES)[number];

export const USER_GENDER_LABELS: Record<UserGender, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

export function normalizeUserGender(value: unknown): UserGender | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return USER_GENDER_VALUES.includes(normalized as UserGender)
    ? (normalized as UserGender)
    : null;
}

export function buildUserGenderUpdate(gender: unknown, updatedAt: unknown) {
  return {
    gender: normalizeUserGender(gender),
    updatedAt,
  };
}
