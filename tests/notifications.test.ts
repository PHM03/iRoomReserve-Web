import { describe, expect, it } from 'vitest';

import { isStaleReservationRequestNotification } from '../lib/notifications/staleReservationRequest';

describe('reservation request notification stale checks', () => {
  it('treats missing reservations as stale', () => {
    expect(
      isStaleReservationRequestNotification(null, 'advisor@sdca.edu.ph')
    ).toBe(true);
  });

  it('treats non-pending reservations as stale', () => {
    expect(
      isStaleReservationRequestNotification({
        approvalFlow: [{ role: 'advisor', email: 'advisor@sdca.edu.ph' }],
        currentStep: 0,
        date: '2026-05-28',
        status: 'approved',
      }, 'advisor@sdca.edu.ph')
    ).toBe(true);
  });

  it('treats already-past reservations as stale', () => {
    expect(
      isStaleReservationRequestNotification(
        {
          approvalFlow: [{ role: 'advisor', email: 'advisor@sdca.edu.ph' }],
          currentStep: 0,
          date: '2026-05-27',
          status: 'pending',
        },
        'advisor@sdca.edu.ph',
        new Date('2026-05-28T12:00:00Z')
      )
    ).toBe(true);
  });

  it('treats same-day reservations with a passed end time as stale', () => {
    expect(
      isStaleReservationRequestNotification(
        {
          approvalFlow: [{ role: 'advisor', email: 'advisor@sdca.edu.ph' }],
          currentStep: 0,
          date: '2026-05-28',
          endTime: '09:00',
          status: 'pending',
        },
        'advisor@sdca.edu.ph',
        new Date(2026, 4, 28, 9, 30, 0)
      )
    ).toBe(true);
  });

  it('treats notifications for a previous approver as stale', () => {
    expect(
      isStaleReservationRequestNotification({
        approvalFlow: [
          { role: 'advisor', email: 'advisor@sdca.edu.ph' },
          { role: 'building_admin', email: 'admin@sdca.edu.ph' },
        ],
        currentStep: 1,
        date: '2026-05-28',
        status: 'pending',
      }, 'advisor@sdca.edu.ph')
    ).toBe(true);
  });

  it('keeps active notifications for the current approver', () => {
    expect(
      isStaleReservationRequestNotification({
        approvalFlow: [{ role: 'building_admin', email: 'admin@sdca.edu.ph' }],
        currentStep: 0,
        date: '2026-05-28',
        status: 'pending',
      }, 'ADMIN@sdca.edu.ph')
    ).toBe(false);
  });
});
