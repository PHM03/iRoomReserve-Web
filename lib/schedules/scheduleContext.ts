export const SCHEDULE_SEMESTERS = [
  '1st Semester',
  '2nd Semester',
  'Summer Classes',
] as const;

export const SCHEDULE_ACADEMIC_YEARS = [
  'A.Y. 2025-2026',
  'A.Y. 2026-2027',
  'A.Y. 2027-2028',
] as const;

export type ScheduleSemester = (typeof SCHEDULE_SEMESTERS)[number];
export type ScheduleAcademicYear = (typeof SCHEDULE_ACADEMIC_YEARS)[number];

export interface ScheduleContext {
  academicYear: ScheduleAcademicYear;
  semester: ScheduleSemester;
}

export const DEFAULT_SCHEDULE_CONTEXT: ScheduleContext = {
  academicYear: 'A.Y. 2025-2026',
  semester: '1st Semester',
};

export function isScheduleSemester(value: unknown): value is ScheduleSemester {
  return (
    typeof value === 'string' &&
    (SCHEDULE_SEMESTERS as readonly string[]).includes(value)
  );
}

export function isScheduleAcademicYear(value: unknown): value is ScheduleAcademicYear {
  return (
    typeof value === 'string' &&
    (SCHEDULE_ACADEMIC_YEARS as readonly string[]).includes(value)
  );
}

export function normalizeScheduleContext(input?: {
  academicYear?: unknown;
  semester?: unknown;
} | null): ScheduleContext {
  return {
    academicYear: isScheduleAcademicYear(input?.academicYear)
      ? input.academicYear
      : DEFAULT_SCHEDULE_CONTEXT.academicYear,
    semester: isScheduleSemester(input?.semester)
      ? input.semester
      : DEFAULT_SCHEDULE_CONTEXT.semester,
  };
}

export function formatScheduleContextLabel(context: ScheduleContext): string {
  return `${context.academicYear} (${context.semester})`;
}

export function doesScheduleMatchContext(
  schedule: {
    academicYear?: string | null;
    semester?: string | null;
  },
  context: ScheduleContext
): boolean {
  const scheduleContext = normalizeScheduleContext({
    academicYear: schedule.academicYear,
    semester: schedule.semester,
  });

  return (
    scheduleContext.academicYear === context.academicYear &&
    scheduleContext.semester === context.semester
  );
}
