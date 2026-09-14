import { describe, expect, it } from 'vitest';

import {
  getBuildingAdminApprovalStepIndex,
  getReservationRevisionNotificationId,
  getReservationRevisionScope,
  getRevisionRequestStateError,
  hasActiveReservationRevision,
  isBuildingAdminActionableReservation,
  isCurrentRequestedRevision,
  type ReservationRevisionRecord,
} from '../lib/reservations/reservation-revisions';
import {
  reservationRevisionRecordSchema,
  reservationRevisionScopeSchema,
  reservationRevisionStatusSchema,
} from '../lib/server/schemas';

const buildingAdminApproval = {
  approvalFlow: [
    {
      role: 'building_admin' as const,
      email: 'building-admin@sdca.edu.ph',
    },
  ],
  currentStep: 0,
};

function reservationState(
  overrides: Partial<{
    activeRevisionId: string;
    activeRevisionStatus: 'requested';
    recurringGroupId: string;
    revisionScope: 'single' | 'series';
    status: string;
    currentStep: number;
  }> = {}
) {
  return {
    id: 'reservation-1',
    status: 'pending',
    ...buildingAdminApproval,
    ...overrides,
  };
}

describe('reservation revision foundation', () => {
  it('allows a reservation with no active revision', () => {
    expect(hasActiveReservationRevision(reservationState())).toBe(false);
    expect(getRevisionRequestStateError(reservationState())).toBeNull();
  });

  it('accepts only supported revision statuses and scopes', () => {
    expect(reservationRevisionStatusSchema.safeParse('requested').success).toBe(true);
    expect(reservationRevisionStatusSchema.safeParse('accepted').success).toBe(true);
    expect(reservationRevisionStatusSchema.safeParse('cancelled').success).toBe(true);
    expect(reservationRevisionStatusSchema.safeParse('pending').success).toBe(false);
    expect(reservationRevisionScopeSchema.safeParse('single').success).toBe(true);
    expect(reservationRevisionScopeSchema.safeParse('series').success).toBe(true);
    expect(reservationRevisionScopeSchema.safeParse('occurrence').success).toBe(false);
  });

  it('derives single and recurring-series scope without requiring legacy fields', () => {
    expect(getReservationRevisionScope(reservationState())).toBe('single');
    expect(
      getReservationRevisionScope(reservationState({ recurringGroupId: 'group-1' }))
    ).toBe('series');
    expect(
      getReservationRevisionScope(
        reservationState({ recurringGroupId: 'group-1', revisionScope: 'single' })
      )
    ).toBe('single');
  });

  it('returns the existing Building Admin approval step for both campus flows', () => {
    expect(
      getBuildingAdminApprovalStepIndex([
        { role: 'advisor', email: 'advisor@sdca.edu.ph' },
        { role: 'building_admin', email: 'admin@sdca.edu.ph' },
      ])
    ).toBe(1);
    expect(
      getBuildingAdminApprovalStepIndex([
        { role: 'building_admin', email: 'admin@sdca.edu.ph' },
      ])
    ).toBe(0);
    expect(getBuildingAdminApprovalStepIndex(undefined)).toBe(-1);
  });

  it('builds deterministic notification identities per revision event and recipient', () => {
    const requestedId = getReservationRevisionNotificationId(
      'revision/1',
      'reservation_revision_requested',
      'requester-1'
    );

    expect(requestedId).toBe(
      getReservationRevisionNotificationId(
        'revision/1',
        'reservation_revision_requested',
        'requester-1'
      )
    );
    expect(requestedId).not.toBe(
      getReservationRevisionNotificationId(
        'revision/1',
        'reservation_revision_accepted',
        'requester-1'
      )
    );
    expect(requestedId).not.toBe(
      getReservationRevisionNotificationId(
        'revision/1',
        'reservation_revision_requested',
        'admin-1'
      )
    );
  });

  it('rejects duplicate active revisions and non-pending revision requests', () => {
    expect(
      getRevisionRequestStateError(
        reservationState({
          activeRevisionId: 'revision-1',
          activeRevisionStatus: 'requested',
        })
      )
    ).toContain('already has an active');
    expect(
      getRevisionRequestStateError(reservationState({ status: 'approved' }))
    ).toContain('Only pending');
  });

  it('excludes reservations with active revisions from Building Admin pending work', () => {
    expect(isBuildingAdminActionableReservation(reservationState())).toBe(true);
    expect(
      isBuildingAdminActionableReservation(
        reservationState({
          activeRevisionId: 'revision-1',
          activeRevisionStatus: 'requested',
        })
      )
    ).toBe(false);
    expect(
      isBuildingAdminActionableReservation(
        reservationState({ activeRevisionId: 'revision-1' })
      )
    ).toBe(false);
    expect(
      isBuildingAdminActionableReservation(
        reservationState({ currentStep: 1 })
      )
    ).toBe(false);
    expect(
      isBuildingAdminActionableReservation(
        reservationState({ status: 'approved' })
      )
    ).toBe(false);
  });

  it('identifies only the current requested revision', () => {
    const activeReservation = reservationState({
      activeRevisionId: 'revision-1',
      activeRevisionStatus: 'requested',
    });
    const activeRevision = {
      reservationId: 'reservation-1',
      revisionId: 'revision-1',
      status: 'requested' as const,
    };

    expect(
      isCurrentRequestedRevision(
        activeReservation,
        activeRevision,
        'reservation-1',
        'revision-1'
      )
    ).toBe(true);
    expect(
      isCurrentRequestedRevision(
        activeReservation,
        activeRevision,
        'reservation-1',
        'old-revision'
      )
    ).toBe(false);
    expect(
      isCurrentRequestedRevision(
        activeReservation,
        { ...activeRevision, status: 'accepted' },
        'reservation-1',
        'revision-1'
      )
    ).toBe(false);
    expect(
      isCurrentRequestedRevision(
        { ...activeReservation, activeRevisionStatus: undefined },
        activeRevision,
        'reservation-1',
        'revision-1'
      )
    ).toBe(false);
    expect(
      isCurrentRequestedRevision(
        activeReservation,
        activeRevision,
        'different-reservation',
        'revision-1'
      )
    ).toBe(false);
    expect(
      hasActiveReservationRevision({
        activeRevisionId: 'revision-1',
        activeRevisionStatus: undefined,
      })
    ).toBe(false);
  });

  it('validates the complete immutable audit record shape', () => {
    const revisionRecord: ReservationRevisionRecord = {
      revisionId: 'revision-1',
      reservationId: 'reservation-1',
      recurringGroupId: 'group-1',
      scope: 'series',
      status: 'requested',
      requestedByUid: 'admin-1',
      requestedByEmail: 'admin@sdca.edu.ph',
      requestedAt: {} as ReservationRevisionRecord['requestedAt'],
      originalRoomId: 'room-1',
      originalRoomName: 'Room 101',
      originalBuildingId: 'gd1',
      originalBuildingName: 'GD1',
      proposedRoomId: 'room-2',
      proposedRoomName: 'Room 202',
      proposedBuildingId: 'gd1',
      proposedBuildingName: 'GD1',
    };

    expect(reservationRevisionRecordSchema.safeParse(revisionRecord).success).toBe(true);
    expect(reservationRevisionRecordSchema.safeParse({ ...revisionRecord, proposedRoomId: '' }).success).toBe(false);
    expect(
      reservationRevisionRecordSchema
        .safeParse({ ...revisionRecord, requestedAt: undefined })
        .success
    ).toBe(false);
    expect(revisionRecord.recurringGroupId).toBe('group-1');
    expect(revisionRecord.originalRoomId).toBe('room-1');
    expect(revisionRecord.proposedRoomId).toBe('room-2');
  });
});
