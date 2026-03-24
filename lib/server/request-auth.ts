import "server-only";

import type { NextRequest } from "next/server";
import { doc, getDoc } from "firebase/firestore";

import { normalizeRole, type UserRole } from "@/lib/domain/roles";
import { serverClientDb } from "@/lib/server/firebase-client";
import { getOptionalAdminAuth } from "@/lib/server/firebase-admin";

export interface RequestAuthContext {
  uid: string | null;
  role: UserRole | null;
  assignedBuildingId: string | null;
  verified: boolean;
}

async function getProfileContext(uid: string) {
  const profileSnapshot = await getDoc(doc(serverClientDb, "users", uid));
  if (!profileSnapshot.exists()) {
    return {
      role: null,
      assignedBuildingId: null,
    };
  }

  const profileData = profileSnapshot.data() as {
    role?: string;
    assignedBuildingId?: string | null;
  };

  return {
    role: normalizeRole(profileData.role),
    assignedBuildingId: profileData.assignedBuildingId ?? null,
  };
}

export async function getRequestAuthContext(
  request: NextRequest
): Promise<RequestAuthContext> {
  const fallbackUid = request.headers.get("x-user-id");
  const fallbackRole = normalizeRole(request.headers.get("x-user-role"));
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const adminAuth = getOptionalAdminAuth();

    if (adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
        const profileContext = await getProfileContext(decoded.uid);
        return {
          uid: decoded.uid,
          role: profileContext.role ?? fallbackRole,
          assignedBuildingId: profileContext.assignedBuildingId,
          verified: true,
        };
      } catch {
        // Fall through to compatibility headers so the current project keeps working
        // until Firebase Admin credentials are configured.
      }
    }
  }

  const fallbackProfileContext = fallbackUid
    ? await getProfileContext(fallbackUid)
    : { role: null, assignedBuildingId: null };

  return {
    uid: fallbackUid,
    role: fallbackProfileContext.role ?? fallbackRole,
    assignedBuildingId: fallbackProfileContext.assignedBuildingId,
    verified: false,
  };
}
