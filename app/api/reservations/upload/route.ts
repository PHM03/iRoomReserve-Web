import { NextRequest, NextResponse } from "next/server";

import { handleApiError, ApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";
import { uploadReservationDocument } from "@/lib/server/supabase-storage";

function getOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      includeProfile: false,
    });
    assertAuthenticated(authContext);
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

    const upload = await uploadReservationDocument({
      file: fileEntry,
      reservationId: getOptionalString(formData.get("reservationId")),
      userId,
    });

    return NextResponse.json(upload, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
