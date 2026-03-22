import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ─── Allowed Email Domain ───────────────────────────────────────
const ALLOWED_DOMAIN = "sdca.edu.ph";

// ─── Superadmin Credentials ─────────────────────────────────────
const SUPERADMIN_EMAIL = "johncyrus.agoncillo@sdca.edu.ph";

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

// ─── Email / Password Login ─────────────────────────────────────
export async function loginWithEmail(email: string, password: string) {
  // Don't enforce SDCA email upfront — Utility Staff use non-SDCA emails.
  // Domain validation happens based on the user's stored role after login.
  const credential = await signInWithEmailAndPassword(auth, email, password);

  // Block login if email is not verified
  if (!credential.user.emailVerified) {
    await signOut(auth);
    throw { code: "auth/email-not-verified" };
  }

  // Auto-detect Super Admin — if the email matches, set the role automatically
  if (credential.user.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
    await saveUserProfile(credential.user.uid, {
      firstName: credential.user.displayName?.split(" ")[0] || "Super",
      lastName: credential.user.displayName?.split(" ").slice(1).join(" ") || "Admin",
      email: credential.user.email,
      role: "Super Admin",
      status: "approved",
    });
    return credential;
  }

  // Check approval status for Faculty Professor, Utility, and Administrator
  const profile = await getUserProfile(credential.user.uid);
  if (profile && (profile.role === "Faculty Professor" || profile.role === "Administrator" || profile.role === "Utility")) {
    if (profile.status === "disabled") {
      await signOut(auth);
      throw { code: "auth/account-disabled" };
    }
    if (profile.status === "pending") {
      await signOut(auth);
      throw { code: "auth/account-pending" };
    }
    if (profile.status === "rejected") {
      await signOut(auth);
      throw { code: "auth/account-rejected" };
    }
  }
  // Also check disabled status for students
  if (profile && profile.status === "disabled") {
    await signOut(auth);
    throw { code: "auth/account-disabled" };
  }

  return credential;
}

// ─── Email / Password Registration ──────────────────────────────
export async function registerWithEmail(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: string = "Student"
) {
  // Auto-detect role based on email domain:
  // - Faculty tab + SDCA email → "Faculty Professor"
  // - Faculty tab + non-SDCA email (e.g. Gmail) → "Utility"
  let actualRole = role;
  if (role === "Faculty") {
    actualRole = isAllowedEmail(email) ? "Faculty Professor" : "Utility";
  }

  // Enforce SDCA email for all roles except Utility
  if (actualRole !== "Utility" && !isAllowedEmail(email)) {
    throw { code: "auth/unauthorized-domain" };
  }

  // 1. Create the Firebase Auth user
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  // 2. Set display name on the Auth profile
  await updateProfile(credential.user, {
    displayName: `${firstName} ${lastName}`,
  });

  // 3. Determine approval status based on role
  const status = actualRole === "Student" ? "approved" : "pending";

  // 4. Save additional profile data to Firestore (including role and status)
  await saveUserProfile(credential.user.uid, { firstName, lastName, email, role: actualRole, status });

  // 5. Send email verification
  await sendEmailVerification(credential.user);

  // 6. Sign out until they verify their email
  await signOut(auth);

  return { credential, actualRole };
}

// ─── Google Sign-In ─────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
// Restrict Google popup to only show SDCA accounts
googleProvider.setCustomParameters({ hd: ALLOWED_DOMAIN });

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
    const status = existingProfile.status || (existingProfile.role === 'Student' ? 'approved' : 'pending');

    if (
      existingProfile.role === "Faculty Professor" ||
      existingProfile.role === "Administrator" ||
      existingProfile.role === "Utility Staff"
    ) {
        if (status === "pending") {
          await signOut(auth);
          throw { code: "auth/account-pending" };
        }
        if (status === "rejected") {
          await signOut(auth);
          throw { code: "auth/account-rejected" };
        }
      }

    await saveUserProfile(uid, {
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email: email || "",
      role: existingProfile.role,
      status,
    });
  }

  return result;
}

// ─── Superadmin Login ───────────────────────────────────────────
export async function loginSuperAdmin(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);

  // If the email matches the designated superadmin email, ensure the profile is correct
  if (credential.user.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
    await saveUserProfile(credential.user.uid, {
      firstName: "Super",
      lastName: "Admin",
      email: credential.user.email,
      role: "Super Admin",
      status: "approved",
    });
    return credential;
  }

  // For any other email, verify they have Super Admin role
  const profile = await getUserProfile(credential.user.uid);
  if (!profile || profile.role !== "Super Admin") {
    await signOut(auth);
    throw { code: "auth/not-superadmin" };
  }

  return credential;
}

// ─── Seed Superadmin Account ────────────────────────────────────
// Call this once to create the superadmin account in Firebase
export async function seedSuperAdmin() {
  try {
    // Try to create the account (will fail if already exists)
    const credential = await createUserWithEmailAndPassword(
      auth,
      SUPERADMIN_EMAIL,
      "AnimeVanguards1500"
    );

    await updateProfile(credential.user, {
      displayName: "Super Admin",
    });

    await saveUserProfile(credential.user.uid, {
      firstName: "Super",
      lastName: "Admin",
      email: SUPERADMIN_EMAIL,
      role: "Super Admin",
      status: "approved",
    });

    // Send email verification
    await sendEmailVerification(credential.user);

    // Sign out after seeding
    await signOut(auth);

    return { success: true, message: "Super Admin account created. Please verify the email." };
  } catch (err: unknown) {
    const firebaseError = err as { code?: string };
    if (firebaseError.code === "auth/email-already-in-use") {
      // Account already exists — ensure Firestore profile is set
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          SUPERADMIN_EMAIL,
          "AnimeVanguards1500"
        );
        await saveUserProfile(credential.user.uid, {
          firstName: "Super",
          lastName: "Admin",
          email: SUPERADMIN_EMAIL,
          role: "Super Admin",
          status: "approved",
        });
        await signOut(auth);
        return { success: true, message: "Super Admin profile updated." };
      } catch {
        return { success: false, message: "Super Admin account exists but could not update profile." };
      }
    }
    return { success: false, message: `Failed to create Super Admin: ${firebaseError.code}` };
  }
}

// ─── Get User Profile from Firestore ────────────────────────────
export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    return snap.data() as {
      firstName: string;
      lastName: string;
      email: string;
      role?: string;
      status?: string;
    };
  }
  return null;
}

// ─── Logout ─────────────────────────────────────────────────────
export async function logout() {
  return signOut(auth);
}

// ─── Forgot Password (Reset via Email) ──────────────────────────
export async function resetPassword(email: string) {
  if (!isAllowedEmail(email)) {
    throw { code: "auth/unauthorized-domain" };
  }
  await sendPasswordResetEmail(auth, email);
}

// ─── Resend Verification Email ──────────────────────────────────
export async function resendVerificationEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user);
    await signOut(auth);
  }
}

// ─── Save User Profile to Firestore ─────────────────────────────
export async function saveUserProfile(
  uid: string,
  data: { firstName: string; lastName: string; email: string; role?: string; status?: string }
) {
  await setDoc(
    doc(db, "users", uid),
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ─── Approval Management (Superadmin) ───────────────────────────

export interface ManagedUser {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  assignedBuilding?: string;
  updatedAt?: { seconds: number; nanoseconds: number };
}

// Get users by status with real-time updates
export function onPendingUsers(callback: (users: ManagedUser[]) => void): Unsubscribe {
  const q = query(
    collection(db, "users"),
    where("status", "==", "pending")
  );
  return onSnapshot(q, (snapshot) => {
    const users: ManagedUser[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      users.push({
        uid: docSnap.id,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        email: data.email || "",
        role: data.role || "",
        status: data.status || "pending",
        updatedAt: data.updatedAt,
      });
    });
    callback(users);
  }, (error) => {
    console.warn('Firestore listener error (pending users):', error);
  });
}

export function onUsersByStatus(
  status: string,
  callback: (users: ManagedUser[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "users"),
    where("status", "==", status),
    where("role", "in", ["Student", "Faculty Professor", "Utility", "Administrator"])
  );
  return onSnapshot(q, (snapshot) => {
    const users: ManagedUser[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      users.push({
        uid: docSnap.id,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        email: data.email || "",
        role: data.role || "",
        status: data.status || "",
        assignedBuilding: data.assignedBuilding || undefined,
        updatedAt: data.updatedAt,
      });
    });
    callback(users);
  }, (error) => {
    console.warn('Firestore listener error (users by status):', error);
  });
}

export async function approveUser(uid: string) {
  await updateDoc(doc(db, "users", uid), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
}


export async function approveAdmin(
  uid: string,
  buildingId: string,
  buildingName: string
) {
  // 1. Update the user profile with building assignment
  await updateDoc(doc(db, "users", uid), {
    status: "approved",
    assignedBuilding: buildingName,
    assignedBuildingId: buildingId,
    updatedAt: serverTimestamp(),
  });

  // 2. Update the building to record the assigned admin
  await updateDoc(doc(db, "buildings", buildingId), {
    assignedAdminUid: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function rejectUser(uid: string) {
  await updateDoc(doc(db, "users", uid), {
    status: "rejected",
    updatedAt: serverTimestamp(),
  });
}

// ─── Delete User Account ────────────────────────────────────────
export async function deleteUserAccount(uid: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "users", uid));
}

// ─── Disable User Account ──────────────────────────────────────
export async function disableUserAccount(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    status: "disabled",
    updatedAt: serverTimestamp(),
  });
}

// ─── Enable User Account ───────────────────────────────────────
export async function enableUserAccount(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
}

// ─── Real-time All Users (excluding Super Admin) ────────────────
export function onAllUsers(
  callback: (users: ManagedUser[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "users"),
    where("role", "in", ["Student", "Faculty Professor", "Utility", "Administrator"])
  );
  return onSnapshot(q, (snapshot) => {
    const users: ManagedUser[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      users.push({
        uid: docSnap.id,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        email: data.email || "",
        role: data.role || "",
        status: data.status || "",
        assignedBuilding: data.assignedBuilding || undefined,
        updatedAt: data.updatedAt,
      });
    });
    callback(users);
  }, (error) => {
    console.warn('Firestore listener error (all users):', error);
  });
}

export function getAuthErrorMessage(code: string): string {
  console.warn("Auth error:", code);

  const safeMessages: Record<string, string> = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/account-disabled": "Your account has been disabled. Please contact the administrator.",
    "auth/email-not-verified": "Please verify your email before logging in.",
    "auth/account-pending": "Your account is pending approval.",
    "auth/account-rejected": "Your account has been rejected.",
    "auth/unauthorized-domain": "Please use your SDCA email address.",
  };

  return safeMessages[code] ?? "Invalid email or password.";
}
