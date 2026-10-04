import { NextRequest, NextResponse } from "next/server";

import { handleApiError, ApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertVerifiedAuthentication } from "@/lib/server/route-guards";
import { db } from "@/lib/firebase/firebase-admin";
import { writeAuditLog } from "@/lib/server/services/audit-logs";
import {
  deleteReservationDocumentFromStorage,
  uploadReservationDocument,
} from "@/lib/server/supabase-storage";

export const runtime = "nodejs";

function getOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPendingDocumentPathForUser(path: string, userId: string) {
  const prefix = `reservations/pending/${userId}/`;
  if (!path.startsWith(prefix) || path !== path.trim()) {
    return false;
  }

  const objectName = path.slice(prefix.length);
  return (
    objectName.length > 0 &&
    objectName !== "." &&
    objectName !== ".." &&
    !objectName.includes("/") &&
    !objectName.includes("\\")
  );
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { includeProfile: false, allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    const userId = authContext.uid;
    if (!userId) {
      throw new ApiError(401, "unauthenticated", "Authentication is required.");
    }

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      throw new ApiError(
        400,
        "missing_file",
        "Attach a file using the form field named 'file'."
      );
    }

    console.log("[reservation-upload] received concept paper file", {
      contentType: fileEntry.type,
      fileName: fileEntry.name,
      size: fileEntry.size,
      userId,
    });

    const reservationId = getOptionalString(formData.get("reservationId"));
    const reservation = reservationId
      ? await db.collection("reservations").doc(reservationId).get()
      : null;
    if (reservationId && !reservation?.exists) {
      throw new ApiError(404, "not_found", "Reservation not found.");
    }
    const reservationData = reservation?.data() as {
      reservationReference?: string;
      userId?: string;
      campus?: string;
      buildingId?: string;
      buildingName?: string;
      roomId?: string;
      roomName?: string;
    } | undefined;
    if (reservationId && reservationData?.userId !== userId) {
      throw new ApiError(403, "forbidden", "You cannot upload a document for this reservation.");
    }
    const upload = await uploadReservationDocument({
      file: fileEntry,
      reservationId,
      userId,
    });
    // Pending uploads are linked to their reservation when that reservation is
    // submitted. Direct uploads to an existing reservation are logged here.
    if (reservationId) {
      await writeAuditLog(authContext, {
        action: "reservation.document_uploaded",
        entityType: "reservation",
        entityId: reservationId,
        reservationReference: reservationData?.reservationReference,
        targetUserId: userId,
        campus: reservationData?.campus,
        buildingId: reservationData?.buildingId,
        buildingName: reservationData?.buildingName,
        summary: `Uploaded concept paper for ${reservationData?.roomName ?? "reservation"}`,
        metadata: {
          roomId: reservationData?.roomId ?? null,
          roomName: reservationData?.roomName ?? null,
          sizeBytes: fileEntry.size,
        },
      });
    }

    console.log("[reservation-upload] returning uploaded concept paper", {
      hasFileUrl: Boolean(upload.url),
      path: upload.path,
      userId,
    });

    return NextResponse.json(upload, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
      includeProfile: false,
    });
    assertVerifiedAuthentication(authContext);
    const userId = authContext.uid;
    if (!userId) {
      throw new ApiError(401, "unauthenticated", "Authentication is required.");
    }

    const payload: unknown = await request.json().catch(() => null);
    const path =
      typeof payload === "object" &&
      payload !== null &&
      "path" in payload &&
      typeof payload.path === "string"
        ? payload.path
        : "";

    if (!isPendingDocumentPathForUser(path, userId)) {
      throw new ApiError(
        400,
        "invalid_document_path",
        "Only your pending reservation documents can be removed."
      );
    }

    await deleteReservationDocumentFromStorage(path);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
