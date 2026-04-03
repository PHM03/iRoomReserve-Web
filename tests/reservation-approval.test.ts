import { describe, expect, it } from 'vitest';

import {
  buildApprovalFlow,
  getCurrentApprovalStep,
  getNextApprovalStep,
  isCurrentApproverEmail,
} from '../lib/reservation-approval';

describe('reservation approval helpers', () => {
  it('builds a normalized single-step Digi approval flow', () => {
    const approvalFlow = buildApprovalFlow({
      campus: 'digi',
      buildingAdminEmail: 'BuildingAdmin@sdca.edu.ph ',
    });

    expect(approvalFlow).toEqual([
      { role: 'building_admin', email: 'buildingadmin@sdca.edu.ph' },
    ]);
  });

  it('builds a normalized single-step Main approval flow for faculty review', () => {
    const approvalFlow = buildApprovalFlow({
      campus: 'main',
      advisorEmail: 'Advisor@sdca.edu.ph ',
    });

    expect(approvalFlow).toEqual([
      { role: 'advisor', email: 'advisor@sdca.edu.ph' },
    ]);
  });

  it('returns the current and next approval steps safely', () => {
    const approvalFlow = buildApprovalFlow({
      campus: 'main',
      advisorEmail: 'advisor@sdca.edu.ph',
    });

    expect(getCurrentApprovalStep(approvalFlow, 0)).toEqual({
      role: 'advisor',
      email: 'advisor@sdca.edu.ph',
    });
    expect(getNextApprovalStep(approvalFlow, 0)).toBeNull();
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
});
