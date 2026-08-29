import "server-only";

import type { NextRequest } from "next/server";

import { normalizeAssignedBuildings } from "@/lib/admin/assignedBuildings";
import { type ReservationCampus } from "@/lib/buildings/campuses";
import { auth as adminAuth, db } from "@/lib/firebase/firebase-admin";
import { normalizeRole, type UserRole } from "@/lib/auth/roles";
import { resolveCampusAssignment } from "@/lib/buildings/campusAssignments";

export interface RequestAuthContext {
  uid: string | null;
  role: UserRole | null;
  status?: string | null;
  email: string | null;
  campus: ReservationCampus | null;
  assignedBuildingId: string | null;
  assignedBuildingIds: string[];
  verified: boolean;
}

interface UserProfileData {
  role?: string;
  status?: string | null;
  email?: string | null;
  campus?: string | null;
  campusName?: string | null;
  assignedBuildingId?: string | null;
  assignedBuilding?: string | null;
  assignedBuildingIds?: string[];
  assignedBuildings?: unknown;
}

interface GetRequestAuthContextOptions {
  includeProfile?: boolean;
  allowCompatibilityHeaders?: boolean;
}

function getEmptyProfileContext() {
  return {
    role: null,
    status: null,
    email: null,
    campus: null,
    assignedBuildingId: null,
    assignedBuildingIds: [] as string[],
  };
}

async function getProfileContext(uid: string) {
  let profileData: UserProfileData | null = null;
  const profileSnapshot = await db.collection("users").doc(uid).get();
  if (profileSnapshot.exists) {
    profileData = profileSnapshot.data() as UserProfileData;
  }

  if (!profileData) {
    return getEmptyProfileContext();
  }

  const assignedBuildings = normalizeAssignedBuildings(profileData);
  const { campus } = resolveCampusAssignment(profileData);

  return {
    role: normalizeRole(profileData.role),
    status:
      typeof profileData.status === "string"
        ? profileData.status.trim().toLowerCase()
        : null,
    email: profileData.email?.trim().toLowerCase() ?? null,
    campus,
    assignedBuildingId:
      assignedBuildings[0]?.id ?? profileData.assignedBuildingId ?? null,
    assignedBuildingIds: assignedBuildings.map((building) => building.id),
  };
}

export async function getRequestAuthContext(
  request: NextRequest,
  options: GetRequestAuthContextOptions = {}
): Promise<RequestAuthContext> {
  const { includeProfile = true, allowCompatibilityHeaders = true } = options;
  const fallbackUid = allowCompatibilityHeaders
    ? request.headers.get("x-user-id")
    : null;
  const fallbackRole = allowCompatibilityHeaders
    ? normalizeRole(request.headers.get("x-user-role"))
    : null;
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      const profileContext = includeProfile
        ? await getProfileContext(decoded.uid)
        : getEmptyProfileContext();
      return {
        uid: decoded.uid,
        role: profileContext.role ?? fallbackRole,
        status: profileContext.status,
        email: profileContext.email ?? decoded.email?.trim().toLowerCase() ?? null,
        campus: profileContext.campus,
        assignedBuildingId: profileContext.assignedBuildingId,
        assignedBuildingIds: profileContext.assignedBuildingIds,
        verified: true,
      };
    } catch (error) {
      console.warn("Firebase ID token verification failed", { error });
      // Compatibility headers remain available only to legacy routes that opt in.
    }
  }

  const fallbackProfileContext =
    includeProfile && fallbackUid
      ? await getProfileContext(fallbackUid)
      : getEmptyProfileContext();

  return {
    uid: fallbackUid,
    role: fallbackProfileContext.role ?? fallbackRole,
    status: fallbackProfileContext.status,
    email: fallbackProfileContext.email,
    campus: fallbackProfileContext.campus,
    assignedBuildingId: fallbackProfileContext.assignedBuildingId,
    assignedBuildingIds: fallbackProfileContext.assignedBuildingIds,
    verified: false,
  };
}
