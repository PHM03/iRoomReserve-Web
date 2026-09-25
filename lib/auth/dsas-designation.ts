import { normalizeRole, USER_ROLES } from "./roles";

export interface DsasDesignationProfile {
  uid: string;
  role?: string | null;
  status?: string | null;
  designation?: string | null;
  designationCampus?: string | null;
}

export function isEligibleDsasProfessor(profile: DsasDesignationProfile) {
  return (
    normalizeRole(profile.role) === USER_ROLES.FACULTY &&
    profile.status === "approved"
  );
}

export function isMainCampusDsasProfile(profile: DsasDesignationProfile) {
  return (
    profile.designation === "DSAS" &&
    profile.designationCampus === "main" &&
    isEligibleDsasProfessor(profile)
  );
}

export function planMainCampusDsasDesignation(
  targetUid: string,
  profiles: DsasDesignationProfile[]
) {
  const target = profiles.find((profile) => profile.uid === targetUid);

  if (!target) {
    throw new Error("Professor account was not found.");
  }

  if (!isEligibleDsasProfessor(target)) {
    throw new Error("Only approved Faculty Professor accounts can be designated as DSAS.");
  }

  return {
    targetUid,
    uidsToClear: profiles
      .filter(
        (profile) =>
          profile.uid !== targetUid &&
          profile.designation === "DSAS" &&
          profile.designationCampus === "main"
      )
      .map((profile) => profile.uid),
  };
}
