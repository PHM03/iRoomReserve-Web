import { NextRequest, NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/auth/roles";
import { handleApiError } from "@/lib/server/api-error";
import { getOptionalAdminDb } from "@/lib/server/firebase-admin";
import { getRequestAuthContext } from "@/lib/server/request-auth";
import {
  assertAuthenticated,
  assertCanManageBuilding,
  assertRole,
  assertVerifiedAuthentication,
} from "@/lib/server/route-guards";
import { roomInputSchema } from "@/lib/server/schemas";
import { createRoomRecord } from "@/lib/server/services/rooms";
import { writeAuditLog } from "@/lib/server/services/audit-logs";

interface RoomRecord {
  id: string;
  beaconId?: string | null;
  name: string;
  floor: string;
  roomType: string;
  acStatus: string;
  tvProjectorStatus: string;
  capacity: number;
  status: string;
  buildingId: string;
  buildingName: string;
  reservedBy: string | null;
  activeReservationId?: string | null;
}

interface RoomFloorCount {
  floor: string;
  count: number;
}

export async function GET(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request);
    assertAuthenticated(authContext);

    const { searchParams } = new URL(request.url);
    console.log("Query params:", Object.fromEntries(searchParams.entries()));
    const buildingId = searchParams.get("buildingId");
    const countsOnly = searchParams.get("counts") === "true";
    const floor = searchParams.get("floor");
    const countFloors = searchParams
      .get("floors")
      ?.split("|")
      .map((value) => value.trim())
      .filter(Boolean);
    const roomIds = searchParams
      .get("roomIds")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const adminDb = getOptionalAdminDb();

    if (!adminDb) {
      throw new Error(
        "Firebase Admin Firestore is not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    if (countsOnly) {
      if (!buildingId) {
        return NextResponse.json(
          {
            error: {
              code: "missing_building_id",
              message: "buildingId is required."
            }
          },
          { status: 400 }
        );
      }

      const buildingRoomsQuery = adminDb
        .collection("rooms")
        .where("buildingId", "==", buildingId);
      const [totalSnapshot, ...floorSnapshots] = await Promise.all([
        buildingRoomsQuery.count().get(),
        ...(countFloors ?? []).map((countFloor) =>
          buildingRoomsQuery.where("floor", "==", countFloor).count().get()
        ),
      ]);
      const floors: RoomFloorCount[] = (countFloors ?? []).map((countFloor, index) => ({
        floor: countFloor,
        count: floorSnapshots[index]?.data().count ?? 0,
      }));

      return NextResponse.json({
        floors,
        total: totalSnapshot.data().count,
      });
    }

    const baseSnapshot = roomIds?.length
      ? await Promise.all(roomIds.map((roomId) => adminDb.collection("rooms").doc(roomId).get()))
      : buildingId
        ? await (() => {
            let roomsQuery: FirebaseFirestore.Query = adminDb
              .collection("rooms")
              .where("buildingId", "==", buildingId);

            if (floor) {
              roomsQuery = roomsQuery.where("floor", "==", floor);
            }

            return roomsQuery.get().then((snapshot) => snapshot.docs);
          })()
        : [];

    const rooms: RoomRecord[] = baseSnapshot
      .filter((roomDoc) => roomDoc.exists)
      .map((roomDoc) => {
        const data = roomDoc.data() as {
          beaconId?: string | null;
          bleBeaconId?: string | null;
          name?: string;
          floor?: string;
          roomType?: string;
          acStatus?: string;
          tvProjectorStatus?: string;
          capacity?: number;
          status?: string;
          buildingId?: string;
          buildingName?: string;
          reservedBy?: string | null;
          activeReservationId?: string | null;
        };

        return {
          id: roomDoc.id,
          beaconId:
            typeof data.bleBeaconId === "string" && data.bleBeaconId.trim().length > 0
              ? data.bleBeaconId.trim()
              : typeof data.beaconId === "string" && data.beaconId.trim().length > 0
                ? data.beaconId.trim()
                : null,
          name: data.name ?? "",
          floor: data.floor ?? "",
          roomType: data.roomType ?? "",
          acStatus: data.acStatus ?? "",
          tvProjectorStatus: data.tvProjectorStatus ?? "",
          capacity: data.capacity ?? 0,
          status: data.status ?? "Available",
          buildingId: data.buildingId ?? "",
          buildingName: data.buildingName ?? "",
          reservedBy: data.reservedBy ?? null,
          activeReservationId: data.activeReservationId ?? null,
        };
      })
      .sort(
        (left, right) =>
          left.buildingName.localeCompare(right.buildingName) ||
          left.floor.localeCompare(right.floor) ||
          left.name.localeCompare(right.name)
      );

    return NextResponse.json(rooms);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, { allowCompatibilityHeaders: false });
    assertVerifiedAuthentication(authContext);
    assertRole(authContext, [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN]);

    const payload = roomInputSchema.parse(await request.json());
    assertCanManageBuilding(authContext, payload.buildingId);

    const id = await createRoomRecord(payload);
    await writeAuditLog(authContext, {
      action: "room.created",
      entityType: "room",
      entityId: id,
      campus: authContext.campus,
      buildingId: payload.buildingId,
      buildingName: payload.buildingName,
      summary: `Added room ${payload.name}`,
      metadata: { roomName: payload.name, floor: payload.floor },
    });
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
