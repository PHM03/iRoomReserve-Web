'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { getUserProfile, logout as firebaseLogout } from '@/lib/auth/auth';
import { type CampusName } from '@/lib/buildings/campusAssignments';
import { type ReservationCampus } from '@/lib/buildings/campuses';
import type { UserGender } from '@/lib/auth/profile-types';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  gender?: UserGender | null;
  accountConfigurationReminderDismissed?: boolean;
  accountType?: 'individual' | 'organization';
  organizationName?: string | null;
  campus?: ReservationCampus | null;
  campusName?: CampusName | null;
}

interface AuthContextType {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  reloadProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  profile: null,
  loading: true,
  reloadProfile: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: Readonly<AuthProviderProps>) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const prevUidRef = useRef<string | null>(null);

  const applyProfile = (data: Awaited<ReturnType<typeof getUserProfile>> | null) => {
    if (data) {
      setProfile({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        role: data.role || 'Student',
        status: data.status || 'approved',
        gender: data.gender ?? null,
        accountConfigurationReminderDismissed:
          data.accountConfigurationReminderDismissed === true,
        accountType: data.accountType === 'organization' ? 'organization' : 'individual',
        organizationName:
          typeof data.organizationName === 'string' ? data.organizationName : null,
        campus: (data as Record<string, unknown>).campus as ReservationCampus | null | undefined,
        campusName: (data as Record<string, unknown>).campusName as CampusName | null | undefined,
      });
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        // Skip re-fetching if the UID hasn't changed (e.g. hot reload, token refresh)
        if (prevUidRef.current === user.uid) {
          setLoading(false);
          return;
        }
        prevUidRef.current = user.uid;
        const data = await getUserProfile(user.uid);
        applyProfile(data);
      } else {
        prevUidRef.current = null;
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const reloadProfile = async () => {
    if (!firebaseUser) {
      setProfile(null);
      return;
    }

    const data = await getUserProfile(firebaseUser.uid);
    applyProfile(data);
  };

  const handleLogout = async () => {
    await firebaseLogout();
    setFirebaseUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        reloadProfile,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
