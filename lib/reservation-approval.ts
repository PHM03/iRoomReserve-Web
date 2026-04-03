import type { Timestamp } from "firebase/firestore";

import { type ReservationCampus } from "@/lib/campuses";

export const RESERVATION_APPROVAL_ROLES = [
  "building_admin",
  "advisor",
] as const;

export type ReservationApprovalRole =
  (typeof RESERVATION_APPROVAL_ROLES)[number];

export interface ReservationApprovalStep {
  role: ReservationApprovalRole;
  email: string;
}

export interface ReservationApprovalRecord extends ReservationApprovalStep {
  date: Timestamp;
  status: "approved";
}

export interface DigiReservationApproverInput {
  campus: "digi";
  buildingAdminEmail: string;
}

export interface MainReservationApproverInput {
  campus: "main";
  advisorEmail: string;
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
        email: normalizeApprovalEmail(approvers.buildingAdminEmail),
      },
    ];
  }

  return [
    { role: "advisor", email: normalizeApprovalEmail(approvers.advisorEmail) },
  ];
}

export function isMainCampus(campus: ReservationCampus) {
  return campus === "main";
}

export function isDigiCampus(campus: ReservationCampus) {
  return campus === "digi";
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

export function isCurrentApproverEmail(
  step: ReservationApprovalStep | null,
  userEmail: string
) {
  if (!step) {
    return false;
  }

  return step.email === normalizeApprovalEmail(userEmail);
}
