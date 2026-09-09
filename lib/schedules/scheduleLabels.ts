export interface ScheduleLabelInput {
  courseCode?: string | null;
  section?: string | null;
  subjectName: string;
}

export function getScheduleProgramSection(schedule: ScheduleLabelInput): string {
  const section = schedule.section?.trim() ?? '';
  const program = schedule.courseCode?.trim() || schedule.subjectName?.trim() || '';

  return section || program || 'Class scheduled';
}
