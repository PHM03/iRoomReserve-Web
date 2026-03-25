export const RESERVATION_CAMPUSES = ["digi", "main"] as const;

export type ReservationCampus = (typeof RESERVATION_CAMPUSES)[number];

const CAMPUS_ALIASES: Record<string, ReservationCampus> = {
  digi: "digi",
  digital: "digi",
  "digital campus": "digi",
  "digi campus": "digi",
  "sdca digital campus": "digi",
  "sdca digi campus": "digi",
  "sdca-digital-campus": "digi",
  main: "main",
  "main campus": "main",
  "sdca main campus": "main",
  "sdca-main-campus": "main",
};

export function normalizeCampus(value?: string | null): ReservationCampus | null {
  if (!value) {
    return null;
  }

  return CAMPUS_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function inferCampusFromBuilding(input: {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  campus?: string | null;
}): ReservationCampus | null {
  return (
    normalizeCampus(input.campus) ??
    normalizeCampus(input.id) ??
    normalizeCampus(input.code) ??
    normalizeCampus(input.name)
  );
}
