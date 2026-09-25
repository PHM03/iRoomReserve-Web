import { NextRequest, NextResponse } from "next/server";

import { getCurrentApprovalStep } from "@/lib/reservations/reservation-approval";
import { handleApiError, ApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";
import { createReservationDocumentSignedUrl } from "@/lib/server/supabase-storage";
import { db } from "@/lib/firebase/firebase-admin";
import { groupReservationsForDisplay } from "@/lib/reservations/reservation-groups";
import { normalizeRole, USER_ROLES } from "@/lib/auth/roles";
import { isMainCampusDsasProfile } from "@/lib/auth/dsas-designation";

export const runtime = "nodejs";

type PendingApprovalReservation = {
  approvalFlow?: unknown;
  createdAt?: unknown;
  currentStep?: number;
  id: string;
  status?: string;
} & Record<string, unknown>;

function getTimestampSeconds(value: unknown) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const candidate = value as {
    seconds?: unknown;
    _seconds?: unknown;
  };

  if (typeof candidate.seconds === "number") {
    return candidate.seconds;
  }

  if (typeof candidate._seconds === "number") {
    return candidate._seconds;
  }

  return 0;
}

function sortReservations(
  left: PendingApprovalReservation,
  right: PendingApprovalReservation
) {
  const leftSeconds = getTimestampSeconds(left.createdAt);
  const rightSeconds = getTimestampSeconds(right.createdAt);

  return (
    rightSeconds - leftSeconds ||
    String(right.id).localeCompare(String(left.id))
  );
}

async function getApprovalDocumentUrl(reservation: PendingApprovalReservation) {
  const storedUrl =
    typeof reservation.approvalDocumentUrl === "string"
      ? reservation.approvalDocumentUrl
      : null;

  try {
    return (
      (await createReservationDocumentSignedUrl({ path: typeof reservation.approvalDocumentPath === "string" ? reservation.approvalDocumentPath : null })) ?? storedUrl
    );
  } catch (error) {
    console.warn("Failed to resolve reservation approval document URL", {
      error,
      reservationId: reservation.id,
    });
    return storedUrl;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    if (!authContext.email) {
      throw new ApiError(
        400,
        "missing_email",
        "Authenticated user email is required."
      );
    }

    if (authContext.status !== "approved") {
      throw new ApiError(403, "account_not_approved", "Only approved accounts can review reservations.");
    }

    const normalizedEmail = authContext.email.trim().toLowerCase();
    let isCurrentDsasApprover = false;
    if (authContext.role === USER_ROLES.FACULTY && authContext.uid) {
      const [assignmentSnapshot, userSnapshot] = await Promise.all([
        db.collection("systemSettings").doc("main-campus-dsas").get(),
        db.collection("users").doc(authContext.uid).get(),
      ]);
      const assignmentUid = assignmentSnapshot.data()?.mainCampusDsasUid;
      const userData = userSnapshot.data() as {
        role?: string | null;
        status?: string | null;
        designation?: string | null;
        designationCampus?: string | null;
      } | undefined;
      isCurrentDsasApprover =
        assignmentUid === authContext.uid &&
        userSnapshot.exists &&
        Boolean(userData && isMainCampusDsasProfile({
          uid: authContext.uid,
          ...userData,
        }));
    }
    const snapshot = await db
      .collection("reservations")
      .where("status", "==", "pending")
      .get();

    const reservations = snapshot.docs
      .map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as PendingApprovalReservation
      )
      .filter((reservation) => {
        const currentStep = getCurrentApprovalStep(
          Array.isArray(reservation.approvalFlow)
            ? reservation.approvalFlow
            : undefined,
          typeof reservation.currentStep === "number"
            ? reservation.currentStep
            : undefined
        );

        if (currentStep?.role === "dsas") {
          return (
            isCurrentDsasApprover &&
            reservation.campus === "main" &&
            normalizeRole(String(reservation.userRole ?? "")) === USER_ROLES.STUDENT &&
            currentStep.approverUid === authContext.uid &&
            currentStep.email === normalizedEmail
          );
        }

        return currentStep?.email === normalizedEmail;
      })
      .sort(sortReservations);

    const reservationsWithDocuments = await Promise.all(
      reservations.map(async (reservation) => ({
        ...reservation,
        approvalDocumentUrl: await getApprovalDocumentUrl(reservation),
      }))
    );

    return NextResponse.json(groupReservationsForDisplay(reservationsWithDocuments));
  } catch (error) {
    return handleApiError(error);
  }
}
