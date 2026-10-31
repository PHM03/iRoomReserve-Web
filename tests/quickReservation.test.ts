import { describe, expect, it } from 'vitest';

import {
  getQuickReservationFollowUpRequirements,
  getQuickReservationMissingDetails,
  isQuickReservationStartInPast,
  isQuickReservationTimeRangeValid,
  mapQuickReservationDraftToForm,
} from '../lib/ai/quickReservation';

const timeRanges = {
  digi: { startMinutes: 7 * 60, endMinutes: 17 * 60 },
  main: { startMinutes: 7 * 60, endMinutes: 21 * 60 },
};

describe('quick reservation', () => {
  it('uses the existing campus time windows and one-hour slots', () => {
    expect(isQuickReservationTimeRangeValid('digi', '16:00', '17:00', timeRanges)).toBe(true);
    expect(isQuickReservationTimeRangeValid('digi', '16:30', '17:30', timeRanges)).toBe(false);
    expect(isQuickReservationTimeRangeValid('main', '20:00', '21:00', timeRanges)).toBe(true);
    expect(isQuickReservationTimeRangeValid('main', '20:00', '22:00', timeRanges)).toBe(false);
  });

  it('collects only purpose and organization before handoff', () => {
    expect(getQuickReservationMissingDetails({ organization: '', purpose: 'Club meeting' })).toEqual([
      'program, department, or organization',
    ]);
    expect(getQuickReservationMissingDetails({ organization: 'BSIT', purpose: 'Club meeting' })).toEqual([]);
  });

  it('hands the selected room ID and draft fields to the existing form fields', () => {
    expect(mapQuickReservationDraftToForm({
      roomId: 'digital-room-205',
      date: '2026-11-02',
      startTime: '14:00',
      endTime: '15:00',
      organization: 'BSIT',
      purpose: 'Club meeting',
      isEvent: true,
    })).toEqual({
      roomId: 'digital-room-205',
      reservationDate: '2026-11-02',
      startTime: '14:00',
      endTime: '15:00',
      programDepartmentOrganization: 'BSIT',
      purpose: 'Club meeting',
      isEventReservation: true,
    });
  });

  it('rejects past dates and already-started times without restricting weekdays', () => {
    const now = new Date(2026, 9, 31, 12, 0);
    expect(isQuickReservationStartInPast('2026-10-30', '09:00', now)).toBe(true);
    expect(isQuickReservationStartInPast('2026-10-31', '12:00', now)).toBe(true);
    expect(isQuickReservationStartInPast('2026-11-01', '09:00', now)).toBe(false);
  });

  it('preserves role and campus specific form requirements', () => {
    expect(getQuickReservationFollowUpRequirements({ campus: 'main', isStudent: true, isFaculty: false })).toEqual([
      'concept paper or approval letter',
      'adviser, department head, or professor email',
    ]);
    expect(getQuickReservationFollowUpRequirements({ campus: 'digi', isStudent: false, isFaculty: false })).toEqual([]);
    expect(getQuickReservationFollowUpRequirements({ campus: 'main', isStudent: false, isFaculty: true })).toEqual([]);
  });
});
