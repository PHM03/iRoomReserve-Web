import { NextRequest, NextResponse } from "next/server";

import { monitorPendingReservations } from "@/lib/server/services/reservations";

export const runtime = "nodejs";

/**
 * Server-scheduled reservation monitoring endpoint. Configure the deployment's
 * scheduler to call this route with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization")?.trim();

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await monitorPendingReservations());
}
