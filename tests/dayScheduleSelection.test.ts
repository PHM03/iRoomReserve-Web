import { describe, expect, it } from 'vitest';

import {
  getNextScheduleSelection,
  isMultiSlotSelection,
  isSlotSelected,
  type ScheduleSelection,
  type ScheduleSlot,
} from '../lib/reservations/dayScheduleSelection';

function createSlots(statuses: Array<ScheduleSlot['status']>): ScheduleSlot[] {
  return statuses.map((status, index) => {
    const startHour = 7 + index;
    const endHour = startHour + 1;

    return {
      startTime: `${startHour.toString().padStart(2, '0')}:00`,
      endTime: `${endHour.toString().padStart(2, '0')}:00`,
      status,
    };
  });
}

function createSelection(startTime: string, endTime: string): ScheduleSelection {
  return { startTime, endTime };
}

describe('day schedule range selection', () => {
  it('starts with a single-slot selection on the first available click', () => {
    const slots = createSlots(['available', 'available']);

    expect(
      getNextScheduleSelection(slots, null, slots[0]).selection
    ).toEqual(createSelection('07:00', '08:00'));
  });

  it('expands a single selected slot into one continuous range', () => {
    const slots = createSlots(['available', 'available', 'available']);

    expect(
      getNextScheduleSelection(
        slots,
        createSelection('07:00', '08:00'),
        slots[2]
      ).selection
    ).toEqual(createSelection('07:00', '10:00'));
  });

  it('keeps the current anchor when the chosen range would cross a blocked slot', () => {
    const slots = createSlots(['available', 'reserved-others', 'available']);

    expect(
      getNextScheduleSelection(
        slots,
        createSelection('07:00', '08:00'),
        slots[2]
      )
    ).toEqual({
      selection: createSelection('07:00', '08:00'),
      reason: 'blocked-range',
    });
  });

  it('clears the selection when a selected slot is clicked again', () => {
    const slots = createSlots(['available', 'available', 'available']);

    expect(
      getNextScheduleSelection(
        slots,
        createSelection('07:00', '10:00'),
        slots[1]
      ).selection
    ).toBeNull();
  });

  it('resets a completed range when an outside available slot is clicked', () => {
    const slots = createSlots(['available', 'available', 'available', 'available']);

    expect(
      getNextScheduleSelection(
        slots,
        createSelection('07:00', '09:00'),
        slots[3]
      ).selection
    ).toEqual(createSelection('10:00', '11:00'));
  });

  it('clears a completed range when a blocked slot outside the range is clicked', () => {
    const slots = createSlots(['available', 'available', 'reserved-others', 'available']);

    expect(
      getNextScheduleSelection(
        slots,
        createSelection('07:00', '09:00'),
        slots[2]
      ).selection
    ).toBeNull();
  });

  it('keeps a single selected slot when a blocked slot is clicked during range picking', () => {
    const slots = createSlots(['available', 'reserved-others', 'available']);

    expect(
      getNextScheduleSelection(
        slots,
        createSelection('07:00', '08:00'),
        slots[1]
      ).selection
    ).toEqual(createSelection('07:00', '08:00'));
  });

  it('identifies multi-slot ranges and selected slots', () => {
    const selection = createSelection('07:00', '10:00');
    const slots = createSlots(['available', 'available', 'available']);

    expect(isMultiSlotSelection(selection)).toBe(true);
    expect(isSlotSelected(slots[1], selection)).toBe(true);
    expect(isSlotSelected({ startTime: '10:00', endTime: '11:00' }, selection)).toBe(false);
  });
});
