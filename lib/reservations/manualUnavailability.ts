'use client';

import { apiRequest } from '@/lib/api/client';
import { auth } from '@/lib/firebase/firebase';

export interface ManualUnavailabilityInput {
  date: string;
  startTime: string;
  endTime: string;
}

export function setManualRoomUnavailability(roomId: string, input: ManualUnavailabilityInput) {
  return apiRequest<{ id: string }>(`/api/rooms/${roomId}/unavailability`, {
    body: input,
    method: 'POST',
    userId: auth.currentUser?.uid,
  });
}

export function clearManualRoomUnavailability(roomId: string, input: ManualUnavailabilityInput) {
  return apiRequest<{ ok: true }>(`/api/rooms/${roomId}/unavailability`, {
    body: input,
    method: 'DELETE',
    userId: auth.currentUser?.uid,
  });
}
