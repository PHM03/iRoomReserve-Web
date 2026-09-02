import { formatTime } from '../utils/dateTime';

export interface ReservationTimeRange {
  endMinutes: number;
  startMinutes: number;
}

export interface ReservationTimeSlot {
  endTime: string;
  startTime: string;
}

function minutesToTimeString(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function reservationTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getReservationTimeOptions(range: ReservationTimeRange): string[] {
  const options: string[] = [];

  for (let minutes = range.startMinutes; minutes <= range.endMinutes; minutes += 60) {
    options.push(minutesToTimeString(minutes));
  }

  return options;
}

export function getReservationTimeSlots(range: ReservationTimeRange): ReservationTimeSlot[] {
  const slots: ReservationTimeSlot[] = [];

  for (let minutes = range.startMinutes; minutes < range.endMinutes; minutes += 60) {
    slots.push({
      endTime: minutesToTimeString(minutes + 60),
      startTime: minutesToTimeString(minutes),
    });
  }

  return slots;
}

export function formatReservationTimeSlot(slot: ReservationTimeSlot): string {
  return `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`;
}
