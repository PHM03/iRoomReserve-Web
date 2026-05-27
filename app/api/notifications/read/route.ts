import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/firebase/firebase-admin";
import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertAuthenticated } from "@/lib/server/route-guards";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const snapshot = await db
      .collection("notifications")
      .where("recipientUid", "==", authContext.uid)
      .where("read", "==", true)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ deleted: 0 });
    }

    const batch = db.batch();
    snapshot.docs.forEach((notificationDoc) => {
      batch.delete(notificationDoc.ref);
    });
    await batch.commit();

    return NextResponse.json({ deleted: snapshot.size });
  } catch (error) {
    return handleApiError(error);
  }
}
