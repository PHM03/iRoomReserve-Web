import "server-only";

import type { NextRequest } from "next/server";

import { normalizeAssignedBuildings } from "@/lib/admin/assignedBuildings";
import { type ReservationCampus } from "@/lib/buildings/campuses";
import { auth as adminAuth, db } from "@/lib/firebase/firebase-admin";
import { type UserRole } from "@/lib/auth/roles";
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
  /** @deprecated Compatibility headers are ignored; use a verified bearer token. */
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
  // Identity must come from a Firebase-signed token. Client-controlled x-user-*
  // headers can impersonate another account, so they are never accepted.
  const { includeProfile = true } = options;
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      const profileContext = includeProfile
        ? await getProfileContext(decoded.uid)
        : getEmptyProfileContext();
      return {
        uid: decoded.uid,
        role: profileContext.role,
        status: profileContext.status,
        email: profileContext.email ?? decoded.email?.trim().toLowerCase() ?? null,
        campus: profileContext.campus,
        assignedBuildingId: profileContext.assignedBuildingId,
        assignedBuildingIds: profileContext.assignedBuildingIds,
        verified: true,
      };
    } catch (error) {
      console.warn("Firebase ID token verification failed", { error });
      // Never downgrade an invalid bearer token to an untrusted header identity.
      if (authHeader) {
        return {
          uid: null,
          role: null,
          ...getEmptyProfileContext(),
          verified: false,
        };
      }
    }
  }

  return {
    uid: null,
    ...getEmptyProfileContext(),
    verified: false,
  };
}
