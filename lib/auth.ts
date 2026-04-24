import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  where,
} from "firebase/firestore";

import { apiRequest } from "@/lib/api/client";
import {
  getCampusName,
  resolveCampusAssignment,
  type CampusName,
} from "./campusAssignments";
import {
  ALLOWED_EMAIL_DOMAIN,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
} from "@/lib/domain/auth-constants";
import { normalizeRole, USER_ROLES } from "@/lib/domain/roles";
import { auth, db } from "@/lib/configs/firebase";
import { type ReservationCampus } from "@/lib/campuses";

const MANAGED_ROLE_QUERY_VALUES = [
  USER_ROLES.STUDENT,
  USER_ROLES.FACULTY,
  USER_ROLES.UTILITY,
  USER_ROLES.ADMIN,
  "Faculty",
  "Utility",
];

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);

  if (!credential.user.emailVerified) {
    await signOut(auth);
    throw { code: "auth/email-not-verified" };
  }

  if (credential.user.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
    await saveUserProfile(credential.user.uid, {
      firstName: credential.user.displayName?.split(" ")[0] || "Super",
      lastName:
        credential.user.displayName?.split(" ").slice(1).join(" ") || "Admin",
      email: credential.user.email,
      role: USER_ROLES.SUPER_ADMIN,
      status: "approved",
    });
    return credential;
  }

  const profile = await getUserProfile(credential.user.uid);
  if (!profile) {
    await signOut(auth);
    throw { code: "auth/profile-missing" };
  }

  const normalizedRole = normalizeRole(profile.role) ?? USER_ROLES.STUDENT;
  const status = profile.status || "approved";
  const requiresApproval =
    normalizedRole === USER_ROLES.FACULTY ||
    normalizedRole === USER_ROLES.ADMIN ||
    normalizedRole === USER_ROLES.UTILITY;

  if (status === "disabled") {
    await signOut(auth);
    throw { code: "auth/account-disabled" };
  }

  if (requiresApproval && status === "pending") {
    await signOut(auth);
    throw { code: "auth/account-pending" };
  }

  if (requiresApproval && status === "rejected") {
    await signOut(auth);
    throw { code: "auth/account-rejected" };
  }

  return credential;
}

export async function registerWithEmail(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: string = USER_ROLES.STUDENT
) {
  let actualRole = normalizeRole(role) ?? USER_ROLES.STUDENT;

  if (role === "Faculty" && !isAllowedEmail(email)) {
    actualRole = USER_ROLES.UTILITY;
  }

  if (actualRole !== USER_ROLES.UTILITY && !isAllowedEmail(email)) {
    throw { code: "auth/unauthorized-domain" };
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, {
    displayName: `${firstName} ${lastName}`,
  });

  const status = actualRole === USER_ROLES.STUDENT ? "approved" : "pending";

  await saveUserProfile(credential.user.uid, {
    firstName,
    lastName,
    email,
    role: actualRole,
    status,
  });

  await sendEmailVerification(credential.user);
  await signOut(auth);

  return { credential, actualRole };
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN });

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);

  if (!result.user.email || !isAllowedEmail(result.user.email)) {
    await signOut(auth);
    throw { code: "auth/unauthorized-domain" };
  }

  const { uid, displayName, email } = result.user;
  const nameParts = (displayName ?? "").split(" ");
  const existingProfile = await getUserProfile(uid);

  if (existingProfile?.role) {
    const normalizedRole =
      normalizeRole(existingProfile.role) ?? USER_ROLES.STUDENT;
    const status =
      existingProfile.status ||
      (normalizedRole === USER_ROLES.STUDENT ? "approved" : "pending");

    if (
      normalizedRole === USER_ROLES.FACULTY ||
      normalizedRole === USER_ROLES.ADMIN ||
      normalizedRole === USER_ROLES.UTILITY
    ) {
      if (status === "pending") {
        await signOut(auth);
        throw { code: "auth/account-pending" };
      }
      if (status === "rejected") {
        await signOut(auth);
        throw { code: "auth/account-rejected" };
      }
      if (status === "disabled") {
        await signOut(auth);
        throw { code: "auth/account-disabled" };
      }
    }

    await saveUserProfile(uid, {
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email: email || "",
      role: normalizedRole,
      status,
    });
  }

  return result;
}

export async function loginSuperAdmin(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);

  if (credential.user.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
    await saveUserProfile(credential.user.uid, {
      firstName: "Super",
      lastName: "Admin",
      email: credential.user.email,
      role: USER_ROLES.SUPER_ADMIN,
      status: "approved",
    });
    return credential;
  }

  const profile = await getUserProfile(credential.user.uid);
  if (!profile || normalizeRole(profile.role) !== USER_ROLES.SUPER_ADMIN) {
    await signOut(auth);
    throw { code: "auth/not-superadmin" };
  }

  return credential;
}

export async function seedSuperAdmin() {
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      SUPERADMIN_EMAIL,
      SUPERADMIN_PASSWORD
    );

    await updateProfile(credential.user, {
      displayName: "Super Admin",
    });

    await saveUserProfile(credential.user.uid, {
      firstName: "Super",
      lastName: "Admin",
      email: SUPERADMIN_EMAIL,
      role: USER_ROLES.SUPER_ADMIN,
      status: "approved",
    });

    await sendEmailVerification(credential.user);
    await signOut(auth);

    return {
      success: true,
      message: "Super Admin account created. Please verify the email.",
    };
  } catch (error: unknown) {
    const firebaseError = error as { code?: string };

    if (firebaseError.code === "auth/email-already-in-use") {
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          SUPERADMIN_EMAIL,
          SUPERADMIN_PASSWORD
        );
        await saveUserProfile(credential.user.uid, {
          firstName: "Super",
          lastName: "Admin",
          email: SUPERADMIN_EMAIL,
          role: USER_ROLES.SUPER_ADMIN,
          status: "approved",
        });
        await signOut(auth);
        return { success: true, message: "Super Admin profile updated." };
      } catch {
        return {
          success: false,
          message:
            "Super Admin account exists but the profile could not be updated.",
        };
      }
    }

    return {
      success: false,
      message: `Failed to create Super Admin: ${firebaseError.code}`,
    };
  }
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as {
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
    status?: string;
    campus?: string;
    campusName?: string;
    assignedBuilding?: string;
    assignedBuildingId?: string;
    assignedBuildings?: unknown;
    assignedBuildingIds?: string[];
  };
  const { campus, campusName } = resolveCampusAssignment(data);

  return {
    ...data,
    role: normalizeRole(data.role) ?? data.role,
    campus,
    campusName,
  };
}

export async function logout() {
  return signOut(auth);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function resendVerificationEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user);
    await signOut(auth);
  }
}

export async function saveUserProfile(
  uid: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
    status?: string;
    campus?: ReservationCampus | null;
    campusName?: CampusName | null;
  }
) {
  await setDoc(
    doc(db, "users", uid),
    {
      ...data,
      email: data.email.toLowerCase(),
      ...(data.role ? { role: normalizeRole(data.role) ?? data.role } : {}),
      ...(data.campus
        ? { campusName: data.campusName ?? getCampusName(data.campus) }
        : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export interface ManagedUser {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  campus?: ReservationCampus | null;
  campusName?: CampusName | null;
  updatedAt?: { seconds: number; nanoseconds: number };
}

function mapManagedUser(
  uid: string,
  data: Record<string, unknown>
): ManagedUser {
  return {
    uid,
    firstName: String(data.firstName || ""),
    lastName: String(data.lastName || ""),
    email: String(data.email || ""),
    role: normalizeRole(String(data.role || "")) ?? String(data.role || ""),
    status: String(data.status || ""),
    ...resolveCampusAssignment({
      assignedBuilding:
        typeof data.assignedBuilding === "string"
          ? data.assignedBuilding
          : undefined,
      assignedBuildingId:
        typeof data.assignedBuildingId === "string"
          ? data.assignedBuildingId
          : undefined,
      assignedBuildings: data.assignedBuildings,
      assignedBuildingIds: data.assignedBuildingIds,
      campus: typeof data.campus === "string" ? data.campus : undefined,
      campusName: typeof data.campusName === "string" ? data.campusName : undefined,
    }),
    updatedAt: data.updatedAt as { seconds: number; nanoseconds: number } | undefined,
  };
}

export function onPendingUsers(
  callback: (users: ManagedUser[]) => void
): Unsubscribe {
  const q = query(collection(db, "users"), where("status", "==", "pending"));
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs
          .map((userDoc) => mapManagedUser(userDoc.id, userDoc.data()))
          .filter((user) => user.role !== USER_ROLES.SUPER_ADMIN)
      );
    },
    (error) => {
      console.warn("Firestore listener error (pending users):", error);
    }
  );
}

export function onUsersByStatus(
  status: string,
  callback: (users: ManagedUser[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "users"),
    where("status", "==", status),
    where("role", "in", MANAGED_ROLE_QUERY_VALUES)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((userDoc) => mapManagedUser(userDoc.id, userDoc.data())));
    },
    (error) => {
      console.warn("Firestore listener error (users by status):", error);
    }
  );
}

export async function approveUser(uid: string) {
  await apiRequest(`/api/admin/users/${uid}`, {
    body: { action: "approve-user" },
    method: "PATCH",
  });
}

export async function approveAdmin(
  uid: string,
  campus: ReservationCampus,
  role: string = USER_ROLES.ADMIN
) {
  const normalizedRole = normalizeRole(role);
  await apiRequest(`/api/admin/users/${uid}`, {
    body: {
      action: "approve-managed",
      campus,
      role:
        normalizedRole === USER_ROLES.UTILITY
          ? USER_ROLES.UTILITY
          : USER_ROLES.ADMIN,
    },
    method: "PATCH",
  });
}

export async function rejectUser(uid: string) {
  await apiRequest(`/api/admin/users/${uid}`, {
    body: { action: "reject" },
    method: "PATCH",
  });
}

export async function deleteUserAccount(uid: string): Promise<void> {
  await apiRequest(`/api/admin/users/${uid}`, {
    method: "DELETE",
  });
}

export async function disableUserAccount(uid: string): Promise<void> {
  await apiRequest(`/api/admin/users/${uid}`, {
    body: { action: "disable" },
    method: "PATCH",
  });
}

export async function enableUserAccount(uid: string): Promise<void> {
  await apiRequest(`/api/admin/users/${uid}`, {
    body: { action: "enable" },
    method: "PATCH",
  });
}

export function onAllUsers(
  callback: (users: ManagedUser[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "users"),
    where("role", "in", MANAGED_ROLE_QUERY_VALUES)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((userDoc) => mapManagedUser(userDoc.id, userDoc.data())));
    },
    (error) => {
      console.warn("Firestore listener error (all users):", error);
    }
  );
}

export function getAuthErrorMessage(code: string): string {
  console.warn("Auth error:", code);

  const safeMessages: Record<string, string> = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/account-disabled":
      "Your account has been disabled. Please contact the administrator.",
    "auth/email-not-verified":
      "Please verify your email before logging in.",
    "auth/account-pending": "Your account is pending approval.",
    "auth/account-rejected": "Your account has been rejected.",
    "auth/unauthorized-domain": "Please use your SDCA email address.",
    "auth/user-not-found":
      "This email is not registered. Please sign up first.",
    "auth/profile-missing":
      "Your account profile is incomplete. Please contact the administrator.",
  };

  return safeMessages[code] ?? "Invalid email or password.";
}
