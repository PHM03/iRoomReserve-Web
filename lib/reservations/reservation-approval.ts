import type { FirestoreTimestampLike } from "@/lib/types/firestore-types";

import { type ReservationCampus } from "@/lib/buildings/campuses";

export const RESERVATION_APPROVAL_ROLES = [
  "building_admin",
  "advisor",
  "dsas",
] as const;

export type ReservationApprovalRole =
  (typeof RESERVATION_APPROVAL_ROLES)[number];

export interface ReservationApprovalStep {
  role: ReservationApprovalRole;
  email: string;
  approverUid?: string;
}

export interface ReservationApprovalRecord extends ReservationApprovalStep {
  date: FirestoreTimestampLike;
  approverName?: string;
  status: "approved";
}

export interface DigiReservationApproverInput {
  campus: "digi";
  buildingAdminEmail?: string;
}

export interface MainReservationApproverInput {
  campus: "main";
  advisorEmail?: string;
  dsasApprover?: {
    uid: string;
    email: string;
  };
  buildingAdminEmail?: string;
}

export type ReservationApproverInput =
  | DigiReservationApproverInput
  | MainReservationApproverInput;

export function normalizeApprovalEmail(email: string) {
  return email.trim().toLowerCase();
}

export function buildApprovalFlow(
  approvers: ReservationApproverInput
): ReservationApprovalStep[] {
  if (approvers.campus === "digi") {
    return [
      {
        role: "building_admin",
        email: normalizeApprovalEmail(approvers.buildingAdminEmail ?? ""),
      },
    ];
  }

  if (!approvers.advisorEmail?.trim()) {
    return [
      {
        role: "building_admin",
        email: normalizeApprovalEmail(approvers.buildingAdminEmail ?? ""),
      },
    ];
  }

  return [
    {
      role: "advisor",
      email: normalizeApprovalEmail(approvers.advisorEmail)
    },
    ...(approvers.dsasApprover
      ? [{
          role: "dsas" as const,
          email: normalizeApprovalEmail(approvers.dsasApprover.email),
          approverUid: approvers.dsasApprover.uid,
        }]
      : []),
    {
      role: "building_admin",
      email: normalizeApprovalEmail(approvers.buildingAdminEmail ?? ""),
    },
  ];
}

export function isMainCampus(campus: ReservationCampus) {
  return campus === "main";
}

export function isDigiCampus(campus: ReservationCampus) {
  return campus === "digi";
}

export function requiresDsasApproval(campus: ReservationCampus, requesterRole: string) {
  return campus === "main" && requesterRole === "Student";
}

export function getCurrentApprovalStep(
  approvalFlow: ReservationApprovalStep[] | undefined,
  currentStep: number | undefined
) {
  if (!approvalFlow || approvalFlow.length === 0) {
    return null;
  }

  if (typeof currentStep !== "number" || currentStep < 0) {
    return null;
  }

  return approvalFlow[currentStep] ?? null;
}

export function getNextApprovalStep(
  approvalFlow: ReservationApprovalStep[] | undefined,
  currentStep: number | undefined
) {
  return getCurrentApprovalStep(
    approvalFlow,
    typeof currentStep === "number" ? currentStep + 1 : undefined
  );
}

export function getCompletedApprovalRecord(
  approvals: ReservationApprovalRecord[] | undefined,
  role: ReservationApprovalRole
) {
  return approvals?.find(
    (approval) => approval.role === role && approval.status === "approved"
  ) ?? null;
}

export function isCurrentApproverEmail(
  step: ReservationApprovalStep | null,
  userEmail: string
) {
  if (!step) {
    return false;
  }

  return step.email === normalizeApprovalEmail(userEmail);
}

export function isAuthorizedDsasApprover(input: {
  campus: ReservationCampus;
  requesterRole: string;
  step: ReservationApprovalStep;
  userEmail: string;
  userRole: string | null;
  userStatus: string | null | undefined;
  userUid: string | null;
}) {
  return (
    input.campus === "main" &&
    input.requesterRole === "Student" &&
    input.step.role === "dsas" &&
    Boolean(input.step.approverUid) &&
    input.step.approverUid === input.userUid &&
    input.step.email === normalizeApprovalEmail(input.userEmail) &&
    input.userRole === "Faculty Professor" &&
    input.userStatus === "approved"
  );
}

export function getApprovalTransition(
  approvalFlow: ReservationApprovalStep[],
  currentStep: number
) {
  const nextStep = currentStep + 1;
  const nextApprovalStep = getCurrentApprovalStep(approvalFlow, nextStep);

  return {
    nextApprovalStep,
    nextStep,
    isFinalApproval: nextApprovalStep === null,
    nextStatus: nextApprovalStep === null ? "approved" as const : "pending" as const,
  };
}

export function getRejectionStageLabel(role: ReservationApprovalRole) {
  return role === "dsas" ? "DSAS-designated Professor (DSAS)" : role;
}

export function buildReservationRejectionNotice(input: {
  role: ReservationApprovalRole;
  roomName: string;
  scheduleSummary: string;
  reason: string;
}) {
  return {
    title: input.role === "dsas" ? "Reservation Rejected by DSAS" : "Reservation Rejected",
    message: `Your reservation for ${input.roomName} on ${input.scheduleSummary} was rejected during the ${getRejectionStageLabel(
      input.role
    )} approval step. Reason: ${input.reason.trim()}`,
  };
}

export function buildReservationRejectionUpdate(userEmail: string, reason: string) {
  return {
    status: "rejected" as const,
    rejectedBy: normalizeApprovalEmail(userEmail),
    reason: reason.trim(),
  };
}
