import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/server/api-error";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import { assertScheduleAccess } from "@/lib/server/schedule-authorization";
import { db } from "@/lib/firebase/firebase-admin";

export const runtime = "nodejs";

const requestSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    await assertScheduleAccess(authContext, { operation: "write", requireRoom: false });

    const { emails } = requestSchema.parse(await request.json());
    const registeredEmails = new Set<string>();
    const uniqueEmails = [...new Set(emails)];

    for (let index = 0; index < uniqueEmails.length; index += 10) {
      const snapshot = await db
        .collection("users")
        .where("email", "in", uniqueEmails.slice(index, index + 10))
        .get();
      snapshot.docs.forEach((user) => {
        const email = user.data().email;
        if (typeof email === "string") registeredEmails.add(email.trim().toLowerCase());
      });
    }

    return NextResponse.json({ registeredEmails: [...registeredEmails] });
  } catch (error) {
    return handleApiError(error);
  }
}
