/**
 * Campus-specific allowed hour ranges for class schedules.
 * startHour and endHour are inclusive, in 24-hour format.
 * e.g. { startHour: 7, endHour: 19 } means 7:00 AM – 7:00 PM
 */

export interface CampusTimeRule {
  startHour: number;
  endHour: number;
  campusLabel: string;
  errorMessage: string;
}

export const CAMPUS_TIME_RULES: Record<string, CampusTimeRule> = {
  digi: {
    startHour: 7,
    endHour: 19,
    campusLabel: "SDCA Digi Campus",
    errorMessage:
      "Class schedules for SDCA Digi Campus must be between 7:00 AM and 7:00 PM.",
  },
  main: {
    startHour: 7,
    endHour: 21,
    campusLabel: "SDCA Main Campus",
    errorMessage:
      "Class schedules for SDCA Main Campus must be between 7:00 AM and 9:00 PM.",
  },
};

/**
 * Returns the CampusTimeRule for the given campus key, or null if unknown.
 */
export function getCampusTimeRule(campus: string | null | undefined): CampusTimeRule | null {
  if (!campus) return null;
  return CAMPUS_TIME_RULES[campus] ?? null;
}

/**
 * Parses an "HH:mm" string into total minutes from midnight.
 */
export function timeToMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Returns true if the given "HH:mm" time falls within [startHour, endHour] (inclusive hours).
 * A time of e.g. "20:00" with endHour=19 is considered OUT of range
 * because only full hours on the boundary are allowed (19:00 is last valid start).
 */
export function isTimeInRange(time: string, rule: CampusTimeRule): boolean {
  const minutes = timeToMinutes(time);
  const minMinutes = rule.startHour * 60;
  const maxMinutes = rule.endHour * 60;
  return minutes >= minMinutes && minutes <= maxMinutes;
}

/**
 * Validates both startTime and endTime against the campus rule.
 * Returns an error string if invalid, or null if valid.
 */
export function validateScheduleTimes(
  startTime: string,
  endTime: string,
  campus: string | null | undefined
): string | null {
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return "End time must be later than start time.";
  }

  const rule = getCampusTimeRule(campus);
  if (!rule) return null; // no rule = no restriction

  if (!isTimeInRange(startTime, rule) || !isTimeInRange(endTime, rule)) {
    return rule.errorMessage;
  }

  return null;
}
