export type ScheduleSlotStatus =
  | 'available'
  | 'past'
  | 'reserved-others'
  | 'pending-others'
  | 'user-conflict';

export interface ScheduleSlot {
  startTime: string;
  endTime: string;
  status: ScheduleSlotStatus;
}

export interface ScheduleSelection {
  startTime: string;
  endTime: string;
}

export interface NextScheduleSelectionResult {
  selection: ScheduleSelection | null;
  reason?: 'blocked-range';
}

function timeStringToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function slotsOverlap(
  slotStart: string,
  slotEnd: string,
  rangeStart: string,
  rangeEnd: string
): boolean {
  return slotStart < rangeEnd && slotEnd > rangeStart;
}

export function isSlotSelected(
  slot: Pick<ScheduleSlot, 'startTime' | 'endTime'>,
  selection: ScheduleSelection | null
): boolean {
  if (!selection) {
    return false;
  }

  return slotsOverlap(
    slot.startTime,
    slot.endTime,
    selection.startTime,
    selection.endTime
  );
}

export function isMultiSlotSelection(
  selection: ScheduleSelection | null
): boolean {
  if (!selection) {
    return false;
  }

  return (
    timeStringToMinutes(selection.endTime) -
      timeStringToMinutes(selection.startTime) >
    60
  );
}

export function getNextScheduleSelection(
  slots: readonly ScheduleSlot[],
  currentSelection: ScheduleSelection | null,
  clickedSlot: ScheduleSlot
): NextScheduleSelectionResult {
  const clickedInsideCurrentSelection = isSlotSelected(
    clickedSlot,
    currentSelection
  );
  const currentSelectionIsMultiSlot = isMultiSlotSelection(currentSelection);

  if (clickedSlot.status !== 'available') {
    if (
      currentSelectionIsMultiSlot &&
      currentSelection &&
      !clickedInsideCurrentSelection
    ) {
      return { selection: null };
    }

    return { selection: currentSelection };
  }

  if (!currentSelection) {
    return {
      selection: {
        startTime: clickedSlot.startTime,
        endTime: clickedSlot.endTime,
      },
    };
  }

  if (clickedInsideCurrentSelection) {
    return { selection: null };
  }

  if (currentSelectionIsMultiSlot) {
    return {
      selection: {
        startTime: clickedSlot.startTime,
        endTime: clickedSlot.endTime,
      },
    };
  }

  const nextSelection = {
    startTime:
      clickedSlot.startTime < currentSelection.startTime
        ? clickedSlot.startTime
        : currentSelection.startTime,
    endTime:
      clickedSlot.endTime > currentSelection.endTime
        ? clickedSlot.endTime
        : currentSelection.endTime,
  };

  const hasBlockedSlotInRange = slots.some(
    (slot) =>
      slotsOverlap(
        slot.startTime,
        slot.endTime,
        nextSelection.startTime,
        nextSelection.endTime
      ) && slot.status !== 'available'
  );

  if (hasBlockedSlotInRange) {
    return {
      selection: currentSelection,
      reason: 'blocked-range',
    };
  }

  return { selection: nextSelection };
}
