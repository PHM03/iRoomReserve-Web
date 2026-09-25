import { describe, expect, it } from 'vitest';

import {
  buildApprovalFlow,
  getCompletedApprovalRecord,
  getCurrentApprovalStep,
  getNextApprovalStep,
  getApprovalTransition,
  buildReservationRejectionNotice,
  buildReservationRejectionUpdate,
  isAuthorizedDsasApprover,
  isCurrentApproverEmail,
  requiresDsasApproval,
  type ReservationApprovalRecord,
} from '../lib/reservations/reservation-approval';
import { planMainCampusDsasDesignation } from '../lib/auth/dsas-designation';

describe('reservation approval helpers', () => {
  it('builds a normalized single-step Digi approval flow', () => {
    const approvalFlow = buildApprovalFlow({
      campus: 'digi',
      buildingAdminEmail: 'BuildingAdmin@sdca.edu.ph ',
    });

    expect(approvalFlow).toEqual([
      {
        role: 'building_admin',
        email: 'buildingadmin@sdca.edu.ph'
      },
    ]);
  });

  it('builds the Main approval flow with adviser and Building Admin when DSAS is not supplied', () => {
    const approvalFlow = buildApprovalFlow({
      campus: 'main',
      advisorEmail: 'Advisor@sdca.edu.ph ',
      buildingAdminEmail: 'BuildingAdmin@sdca.edu.ph',
    });

    expect(approvalFlow).toEqual([
      {
        role: 'advisor',
        email: 'advisor@sdca.edu.ph'
      },
      {
        role: 'building_admin',
        email: 'buildingadmin@sdca.edu.ph'
      },
    ]);
  });

  it('returns the current and next approval steps safely', () => {
    const approvalFlow = buildApprovalFlow({
      campus: 'main',
      advisorEmail: 'advisor@sdca.edu.ph',
      buildingAdminEmail: 'admin@sdca.edu.ph',
    });

    expect(getCurrentApprovalStep(approvalFlow, 0)).toEqual({
      role: 'advisor',
      email: 'advisor@sdca.edu.ph',
    });
    expect(getNextApprovalStep(approvalFlow, 0)).toEqual({
      role: 'building_admin',
      email: 'admin@sdca.edu.ph',
    });
    expect(getNextApprovalStep(approvalFlow, 1)).toBeNull();
    expect(getCurrentApprovalStep(approvalFlow, 99)).toBeNull();
  });

  it('matches the current approver email case-insensitively', () => {
    const currentStep = {
      role: 'advisor' as const,
      email: 'advisor@sdca.edu.ph',
    };

    expect(isCurrentApproverEmail(currentStep, 'ADVISOR@sdca.edu.ph')).toBe(
      true
    );
    expect(isCurrentApproverEmail(currentStep, 'registrar@sdca.edu.ph')).toBe(
      false
    );
  });

  it('builds the Main Campus student flow with the DSAS stage', () => {
    expect(buildApprovalFlow({
      campus: 'main',
      advisorEmail: 'advisor@sdca.edu.ph',
      dsasApprover: { uid: 'dsas-uid', email: 'dsas@sdca.edu.ph' },
      buildingAdminEmail: 'admin@sdca.edu.ph',
    })).toEqual([
      { role: 'advisor', email: 'advisor@sdca.edu.ph' },
      { role: 'dsas', email: 'dsas@sdca.edu.ph', approverUid: 'dsas-uid' },
      { role: 'building_admin', email: 'admin@sdca.edu.ph' },
    ]);
  });

  it('keeps Digital Campus and Professor reservations out of the DSAS path', () => {
    expect(buildApprovalFlow({
      campus: 'digi',
      buildingAdminEmail: 'admin@sdca.edu.ph',
    })).toEqual([{ role: 'building_admin', email: 'admin@sdca.edu.ph' }]);
    expect(requiresDsasApproval('digi', 'Student')).toBe(false);
    expect(requiresDsasApproval('main', 'Faculty Professor')).toBe(false);
    expect(requiresDsasApproval('main', 'Student')).toBe(true);
    expect(buildApprovalFlow({
      campus: 'main',
      buildingAdminEmail: 'admin@sdca.edu.ph',
    })).toEqual([{ role: 'building_admin', email: 'admin@sdca.edu.ph' }]);
  });

  it('allows only a designated approved Faculty Professor to approve the DSAS step', () => {
    const input = {
      campus: 'main' as const,
      requesterRole: 'Student',
      step: {
        role: 'dsas' as const,
        email: 'dsas@sdca.edu.ph',
        approverUid: 'dsas-uid',
      },
      userEmail: 'DSAS@sdca.edu.ph',
      userRole: 'Faculty Professor',
      userStatus: 'approved',
      userUid: 'dsas-uid',
    };

    expect(isAuthorizedDsasApprover(input)).toBe(true);
    expect(isAuthorizedDsasApprover({ ...input, userUid: 'other-professor' })).toBe(false);
    expect(isAuthorizedDsasApprover({ ...input, userRole: 'Student' })).toBe(false);
    expect(isAuthorizedDsasApprover({ ...input, campus: 'digi' })).toBe(false);
    expect(isAuthorizedDsasApprover({ ...input, requesterRole: 'Faculty Professor' })).toBe(false);
    expect(isAuthorizedDsasApprover({ ...input, userStatus: 'disabled' })).toBe(false);
  });

  it('advances DSAS approval to the existing Building Admin step while pending', () => {
    const flow = buildApprovalFlow({
      campus: 'main',
      advisorEmail: 'advisor@sdca.edu.ph',
      dsasApprover: { uid: 'dsas-uid', email: 'dsas@sdca.edu.ph' },
      buildingAdminEmail: 'admin@sdca.edu.ph',
    });

    expect(getApprovalTransition(flow, 1)).toEqual({
      nextApprovalStep: { role: 'building_admin', email: 'admin@sdca.edu.ph' },
      nextStep: 2,
      isFinalApproval: false,
      nextStatus: 'pending',
    });
    expect(getApprovalTransition(flow, 2)).toEqual({
      nextApprovalStep: null,
      nextStep: 3,
      isFinalApproval: true,
      nextStatus: 'approved',
    });
  });

  it('uses the completed adviser approval history and preserves its name snapshot', () => {
    const approvalHistory = [{
      role: 'advisor' as const,
      email: 'advisor@sdca.edu.ph',
      approverUid: 'advisor-uid',
      approverName: 'Prof. Juan Dela Cruz',
      date: { seconds: 1, nanoseconds: 0 } as unknown as ReservationApprovalRecord['date'],
      status: 'approved' as const,
    }];

    expect(getCompletedApprovalRecord(approvalHistory, 'advisor')).toMatchObject({
      email: 'advisor@sdca.edu.ph',
      approverUid: 'advisor-uid',
      approverName: 'Prof. Juan Dela Cruz',
    });
    expect(getCompletedApprovalRecord([], 'advisor')).toBeNull();
    expect(getCompletedApprovalRecord(approvalHistory, 'dsas')).toBeNull();
  });

  it('reassigns the single Main Campus designation and rejects ineligible accounts', () => {
    const profiles = [
      { uid: 'old-dsas', role: 'Faculty Professor', status: 'approved', designation: 'DSAS', designationCampus: 'main' },
      { uid: 'new-dsas', role: 'Faculty Professor', status: 'approved' },
    ];

    expect(planMainCampusDsasDesignation('new-dsas', profiles)).toEqual({
      targetUid: 'new-dsas',
      uidsToClear: ['old-dsas'],
    });
    expect(planMainCampusDsasDesignation('new-dsas', [
      profiles[0],
      { uid: 'duplicate-dsas', role: 'Faculty Professor', status: 'approved', designation: 'DSAS', designationCampus: 'main' },
      profiles[1],
    ]).uidsToClear).toEqual(['old-dsas', 'duplicate-dsas']);
    expect(() => planMainCampusDsasDesignation('student', [
      { uid: 'student', role: 'Student', status: 'approved' },
    ])).toThrow(/Only approved Faculty Professor/);
    expect(() => planMainCampusDsasDesignation('pending-professor', [
      { uid: 'pending-professor', role: 'Faculty Professor', status: 'pending' },
    ])).toThrow(/Only approved Faculty Professor/);
  });

  it('stores a terminal DSAS rejection with its reason and notifies the student as DSAS', () => {
    const update = buildReservationRejectionUpdate('DSAS@sdca.edu.ph', '  Capacity conflict  ');
    const notice = buildReservationRejectionNotice({
      role: 'dsas',
      roomName: 'Lab 1',
      scheduleSummary: 'Sep 25 (10:00 AM–11:00 AM)',
      reason: '  Capacity conflict  ',
    });

    expect(update).toEqual({
      status: 'rejected',
      rejectedBy: 'dsas@sdca.edu.ph',
      reason: 'Capacity conflict',
    });
    expect(update).not.toHaveProperty('currentStep');
    expect(update.status).toBe('rejected');
    expect(notice.title).toBe('Reservation Rejected by DSAS');
    expect(notice.message).toContain('DSAS-designated Professor (DSAS)');
    expect(notice.message).toContain('Reason: Capacity conflict');
  });
});
