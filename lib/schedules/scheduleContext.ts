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

export interface ScheduleSemesterDateRange {
  start: string;
  end: string;
}

export type AcademicYearSemesterDateRanges = Record<
  ScheduleAcademicYear,
  Record<ScheduleSemester, ScheduleSemesterDateRange>
>;

/**
 * Analytics use the same academic-year and semester labels as Class Schedules.
 * End dates are exclusive so adjacent semesters do not overlap.
 */
export const ACADEMIC_YEAR_SEMESTER_DATE_RANGES: AcademicYearSemesterDateRanges = {
  'A.Y. 2025-2026': {
    '1st Semester': { start: '2025-08-01', end: '2026-01-01' },
    '2nd Semester': { start: '2026-01-01', end: '2026-06-01' },
    'Summer Classes': { start: '2026-06-01', end: '2026-08-01' },
  },
  'A.Y. 2026-2027': {
    '1st Semester': { start: '2026-08-01', end: '2027-01-01' },
    '2nd Semester': { start: '2027-01-01', end: '2027-06-01' },
    'Summer Classes': { start: '2027-06-01', end: '2027-08-01' },
  },
  'A.Y. 2027-2028': {
    '1st Semester': { start: '2027-08-01', end: '2028-01-01' },
    '2nd Semester': { start: '2028-01-01', end: '2028-06-01' },
    'Summer Classes': { start: '2028-06-01', end: '2028-08-01' },
  },
};

export const DEFAULT_SCHEDULE_CONTEXT: ScheduleContext = {
  academicYear: 'A.Y. 2025-2026',
  semester: '1st Semester',
};

export function getScheduleAcademicYearAtOffset(
  academicYear: ScheduleAcademicYear,
  offset: number,
): ScheduleAcademicYear | null {
  const index = SCHEDULE_ACADEMIC_YEARS.indexOf(academicYear);
  const nextIndex = index + offset;

  return nextIndex >= 0 && nextIndex < SCHEDULE_ACADEMIC_YEARS.length
    ? SCHEDULE_ACADEMIC_YEARS[nextIndex]
    : null;
}

export function getScheduleSemesterDateRange(
  academicYear: ScheduleAcademicYear,
  semester: ScheduleSemester,
): { start: Date; end: Date } {
  const configuredRange = ACADEMIC_YEAR_SEMESTER_DATE_RANGES[academicYear][semester];

  return {
    start: new Date(`${configuredRange.start}T00:00:00`),
    end: new Date(`${configuredRange.end}T00:00:00`),
  };
}

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
