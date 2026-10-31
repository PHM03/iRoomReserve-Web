import type { ReservationCampus } from '@/lib/buildings/campuses';

export type QuickReservationTimeRanges = Record<
  ReservationCampus,
  { endMinutes: number; startMinutes: number }
>;

export interface QuickReservationDraft {
  date: string;
  endTime: string;
  isEvent: boolean;
  organization: string;
  purpose: string;
  roomId: string;
  startTime: string;
}

export function mapQuickReservationDraftToForm(draft: QuickReservationDraft) {
  return {
    roomId: draft.roomId,
    reservationDate: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    programDepartmentOrganization: draft.organization,
    purpose: draft.purpose,
    isEventReservation: draft.isEvent,
  };
}

export function isQuickReservationTimeRangeValid(
  campus: ReservationCampus | null,
  startTime: string,
  endTime: string,
  ranges: QuickReservationTimeRanges
) {
  if (!campus || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return false;
  }
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return false;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const { startMinutes, endMinutes } = ranges[campus];
  return start >= startMinutes && end <= endMinutes && start % 60 === 0 && end % 60 === 0 && end - start >= 60;
}

export function getQuickReservationFollowUpRequirements(input: {
  campus: ReservationCampus | null;
  isFaculty: boolean;
  isStudent: boolean;
}) {
  return [
    ...(input.isStudent ? ['concept paper or approval letter'] : []),
    ...(input.campus === 'main' && !input.isFaculty ? ['adviser, department head, or professor email'] : []),
  ];
}

export function getQuickReservationMissingDetails(input: {
  organization: string;
  purpose: string;
}) {
  return [
    ...(!input.organization.trim() ? ['program, department, or organization'] : []),
    ...(!input.purpose.trim() ? ['purpose or event name'] : []),
  ];
}

export function isQuickReservationStartInPast(date: string, startTime: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (date < today) return true;
  if (date > today) return false;
  const [hour, minute] = startTime.split(':').map(Number);
  return hour * 60 + minute <= now.getHours() * 60 + now.getMinutes();
}
