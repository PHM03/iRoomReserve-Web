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

export interface ContiguousScheduleSelectionResult {
  reason?: 'non-contiguous';
  selectedSlots: ScheduleSelection[];
  selection: ScheduleSelection | null;
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

export function getNextContiguousScheduleSelection(
  selectedSlots: readonly ScheduleSelection[],
  clickedSlot: ScheduleSelection
): ContiguousScheduleSelectionResult {
  const clickedInsideSelection = selectedSlots.some(
    (slot) =>
      slot.startTime === clickedSlot.startTime && slot.endTime === clickedSlot.endTime
  );

  if (clickedInsideSelection) {
    return {
      selectedSlots: [],
      selection: null,
    };
  }

  if (selectedSlots.length === 0) {
    return {
      selectedSlots: [clickedSlot],
      selection: clickedSlot,
    };
  }

  const sortedSlots = [...selectedSlots].sort((left, right) =>
    left.startTime.localeCompare(right.startTime)
  );
  const firstSlot = sortedSlots[0];
  const lastSlot = sortedSlots[sortedSlots.length - 1];
  const canAppend = clickedSlot.startTime === lastSlot.endTime;
  const canPrepend = clickedSlot.endTime === firstSlot.startTime;

  if (!canAppend && !canPrepend) {
    return {
      reason: 'non-contiguous',
      selectedSlots: [...selectedSlots],
      selection: {
        endTime: lastSlot.endTime,
        startTime: firstSlot.startTime,
      },
    };
  }

  const nextSelectedSlots = [...selectedSlots, clickedSlot].sort((left, right) =>
    left.startTime.localeCompare(right.startTime)
  );

  return {
    selectedSlots: nextSelectedSlots,
    selection: {
      endTime: nextSelectedSlots[nextSelectedSlots.length - 1].endTime,
      startTime: nextSelectedSlots[0].startTime,
    },
  };
}
